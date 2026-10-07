import { DatePipe, DecimalPipe, JsonPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, defer, exhaustMap, repeat, retry, tap, timer, throwError, timeout } from 'rxjs';
import { BrowserEvent, TelemetryCategory, TelemetrySnapshot } from '../../contracts/telemetry.contracts';
import { AdminApiService } from './admin-api.service';
import { ObservabilityApiService } from './observability-api.service';
@Component({ selector: 'app-admin-observability', imports: [DatePipe, DecimalPipe, JsonPipe], templateUrl: './admin-observability.html' })
export class AdminObservability {
  private readonly api = inject(ObservabilityApiService);
  private readonly admin = inject(AdminApiService);
  private readonly destroy = inject(DestroyRef);
  readonly snapshot = signal<TelemetrySnapshot | null>(null);
  readonly state = signal<'conectado' | 'reconectando' | 'desconectado'>('reconectando');
  readonly transport = signal<'SSE' | 'polling'>('SSE');
  readonly rejectedPromises = computed(() => this.events().filter(event => event.type === 'unhandled_rejection').length);
  readonly javascriptErrors = computed(() => this.events().filter(event => ['window_error', 'angular_error'].includes(event.type)).length);
  readonly error = signal('');
  readonly lastUpdate = signal<string | null>(null);
  readonly events = computed(() => this.snapshot()?.events ?? []);
  readonly deviceContexts = computed(() => {
    const contexts = new Map<string, BrowserEvent[]>();
    for (const entry of this.events()) {
      if (!this.clientCategories.includes(entry.category)) continue;
      const entries = contexts.get(entry.sessionId) ?? [];
      if (!entries.some(previous => previous.category === entry.category)) entries.push(entry);
      contexts.set(entry.sessionId, entries);
    }
    return [...contexts].map(([id, entries]) => ({ id, entries }));
  });
  readonly performance = computed(() => this.events().find(event => event.type === 'navigation_timing'));
  readonly routePerformance = computed(() => this.events().find(event => event.type === 'route_navigation'));
  readonly clientCategories: TelemetryCategory[] = ['VIEWPORT', 'CONNECTION', 'CAPABILITY'];
  readonly countCategories: TelemetryCategory[] = ['ERROR', 'RESOURCE_ERROR', 'INTERACTION', 'VISIBILITY'];
  count(category: TelemetryCategory) { return this.events().filter(event => event.category === category).length; }
  metric(entry: BrowserEvent, key: string): number | null { const value = entry.payload[key]; return typeof value === 'number' ? value : null; }
  constructor() {
    let denied = false;
    const receive = (snapshot: TelemetrySnapshot) => {
      this.snapshot.set(snapshot); this.lastUpdate.set(snapshot.generatedAt);
      this.state.set('conectado'); this.error.set('');
    };
    const failure = (error: unknown) => {
      denied = error instanceof HttpErrorResponse && [401, 403].includes(error.status);
      this.state.set(denied ? 'desconectado' : 'reconectando');
      this.error.set(this.admin.errorMessage(error));
    };
    defer(() => { this.transport.set('SSE'); return this.api.stream(); }).pipe(
      // The server renews authorization by ending a healthy stream after 55s.
      repeat({ delay: 1000 }),
      // The server reconciles every 15 seconds. Detect streams that stay open
      // without delivering snapshots, including proxy-buffered responses.
      timeout({ first: 10000, each: 25000 }),
      tap({ next: receive, error: failure }),
      retry({ count: 2, delay: error => denied ? throwError(() => error) : timer(1000) }),
      catchError(() => {
        if (denied) return EMPTY;
        this.transport.set('polling');
        return timer(0, 3000).pipe(exhaustMap(() => denied ? EMPTY : this.api.recent().pipe(
          timeout({ first: 10000 }),
          tap(receive), catchError(error => { failure(error); return EMPTY; }),
        )));
      }), takeUntilDestroyed(this.destroy),
    ).subscribe();
  }
}

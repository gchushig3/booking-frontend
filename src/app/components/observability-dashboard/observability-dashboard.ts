import { DatePipe, JsonPipe, NgClass } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ObservabilityCategory, ObservabilityEvent, ObservabilityService } from '../../services/observability.service';

type QuickFilter = 'all' | 'http' | 'auth' | 'click' | 'errors';
interface EndpointMetric {
  key: string;
  method: string;
  url: string;
  count: number;
  averageMs: number;
  status: number;
  failed: boolean;
}

@Component({
  selector: 'app-observability-dashboard',
  standalone: true,
  imports: [DatePipe, JsonPipe, NgClass],
  templateUrl: './observability-dashboard.html',
})
export class ObservabilityDashboard implements OnDestroy {
  private readonly observability = inject(ObservabilityService);
  private autoRefreshTimer?: ReturnType<typeof setInterval>;
  private refreshAnimationTimer?: ReturnType<typeof setTimeout>;

  protected readonly events = this.observability.events;
  protected readonly filter = signal<QuickFilter>('all');
  protected readonly searchText = signal('');
  protected readonly selectedEventId = signal<string | null>(null);
  protected readonly autoRefresh = signal(false);
  protected readonly isRefreshing = signal(false);
  protected readonly refreshedAt = signal(new Date());
  protected readonly httpEvents = computed(() => this.events().filter((event) => event.type === 'http'));
  protected readonly averageLatency = computed(() => {
    const requests = this.httpEvents();
    return requests.length ? Math.round(requests.reduce((total, event) => total + this.duration(event), 0) / requests.length) : null;
  });
  protected readonly requestCounts = computed(() => {
    const requests = this.httpEvents();
    return {
      successful: requests.filter((event) => this.statusCode(event) >= 200 && this.statusCode(event) < 400).length,
      failed: requests.filter((event) => event.name === 'http_error' || this.statusCode(event) >= 400 || this.statusCode(event) === 0).length,
    };
  });
  protected readonly keyActionCounts = computed(() => {
    const events = this.events();
    return {
      searches: events.filter((event) => event.eventType === 'SEARCH').length,
      attractionViews: events.filter((event) => event.eventType === 'VIEW_ATTRACTION').length,
      packageSelections: events.filter((event) => event.eventType === 'SELECT_PACKAGE').length,
      reservations: events.filter((event) => event.eventType === 'RESERVATION_SUCCESS').length,
    };
  });
  protected readonly clickCount = computed(() => {
    const metrics = this.keyActionCounts();
    return metrics.searches + metrics.attractionViews + metrics.packageSelections + metrics.reservations;
  });
  protected readonly jsErrorCount = computed(() => this.events().filter((event) => event.type === 'js').length);
  protected readonly rejectedPromiseCount = computed(() => this.events().filter((event) => event.name === 'unhandled_rejection').length);
  protected readonly endpointMetrics = computed<EndpointMetric[]>(() => {
    const groups = new Map<string, { method: string; url: string; count: number; totalMs: number; status: number; failed: boolean }>();
    for (const event of this.httpEvents()) {
      const method = String(event.details?.['method'] ?? 'HTTP');
      const url = String(event.details?.['url'] ?? 'Endpoint desconocido');
      const key = `${method} ${url}`;
      const group = groups.get(key) ?? { method, url, count: 0, totalMs: 0, status: 0, failed: false };
      group.count += 1;
      group.totalMs += this.duration(event);
      group.status = this.statusCode(event);
      group.failed = event.name === 'http_error' || group.status >= 400 || group.status === 0;
      groups.set(key, group);
    }
    return [...groups.entries()].map(([key, group]) => ({
      key, method: group.method, url: group.url, count: group.count,
      averageMs: Math.round(group.totalMs / group.count), status: group.status, failed: group.failed,
    })).sort((a, b) => b.count - a.count);
  });
  protected readonly filteredEvents = computed(() => {
    const filter = this.filter();
    const query = this.searchText().trim().toLocaleLowerCase();
    return this.events().filter((event) => {
      const status = this.statusCode(event);
      const passesFilter = filter === 'all' ||
        (filter === 'http' && event.type === 'http') ||
        (filter === 'auth' && event.type === 'auth') ||
        (filter === 'click' && event.type === 'click') ||
        (filter === 'errors' && (event.type === 'js' || (event.type === 'http' && (event.name === 'http_error' || status >= 400))));
      const text = `${event.eventType} ${event.userRole} ${event.type} ${event.name} ${JSON.stringify(event.payload ?? event.details ?? {})}`.toLocaleLowerCase();
      return passesFilter && (!query || text.includes(query));
    }).slice().reverse();
  });
  protected readonly selectedEvent = computed(() => this.events().find((event) => event.id === this.selectedEventId()) ?? null);
  protected readonly filters: { id: QuickFilter; label: string }[] = [
    { id: 'all', label: 'TODOS' }, { id: 'http', label: 'HTTP' }, { id: 'auth', label: 'AUTH' },
    { id: 'click', label: 'CLICS' }, { id: 'errors', label: 'ERRORES' },
  ];

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    if (this.refreshAnimationTimer) clearTimeout(this.refreshAnimationTimer);
  }

  protected refresh(): void {
    this.isRefreshing.set(true);
    this.observability.refreshFromStorage();
    this.refreshedAt.set(new Date());
    if (this.refreshAnimationTimer) clearTimeout(this.refreshAnimationTimer);
    this.refreshAnimationTimer = setTimeout(() => this.isRefreshing.set(false), 450);
  }

  protected toggleAutoRefresh(enabled: boolean): void {
    this.autoRefresh.set(enabled);
    this.stopAutoRefresh();
    if (enabled) this.autoRefreshTimer = setInterval(() => this.refresh(), 5000);
  }

  protected clear(): void {
    this.observability.clear();
    this.selectedEventId.set(null);
    this.refreshedAt.set(new Date());
  }

  protected download(): void {
    try {
      const blob = new Blob([JSON.stringify(this.observability.getSnapshot(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'booking-observability-snapshot.json';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch { /* Descarga local no disponible en este navegador. */ }
  }

  protected label(type: ObservabilityCategory): string {
    return ({ navigation: 'NAVEGACIÓN', click: 'CLIC', http: 'HTTP', js: 'ERROR JS', auth: 'AUTH', search: 'BÚSQUEDA', filter: 'FILTRO', booking: 'RESERVA', modal: 'MODAL', system: 'SISTEMA' })[type];
  }

  protected statusCode(event: ObservabilityEvent): number { return Number(event.details?.['status'] ?? 0); }
  protected duration(event: ObservabilityEvent): number { return Number(event.details?.['durationMs'] ?? 0); }
  protected latencyWidth(durationMs: number): number { return Math.max(3, Math.min(100, durationMs / 10)); }
  protected statusTone(status: number): string {
    if (status >= 500 || status === 0) return 'border-red-200 bg-red-50 text-red-700';
    if (status >= 400 || status >= 300) return 'border-amber-200 bg-amber-50 text-amber-800';
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  protected latencyTone(durationMs: number): string {
    if (durationMs > 800) return 'bg-red-500 text-red-700';
    if (durationMs > 300) return 'bg-amber-400 text-amber-800';
    return 'bg-emerald-500 text-emerald-700';
  }
  protected eventTone(event: ObservabilityEvent): string {
    if (event.type === 'js' || (event.type === 'http' && (event.name === 'http_error' || this.statusCode(event) >= 400))) return 'border-l-red-500';
    if (event.type === 'http') return 'border-l-sky-500';
    if (event.type === 'auth') return 'border-l-violet-500';
    if (event.type === 'click') return 'border-l-teal-500';
    return 'border-l-stone-300';
  }
  protected selectEvent(event: ObservabilityEvent): void {
    this.selectedEventId.set(this.selectedEventId() === event.id ? null : event.id);
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
    this.autoRefreshTimer = undefined;
  }
}

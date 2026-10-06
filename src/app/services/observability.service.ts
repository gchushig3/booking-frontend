import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { API_URL } from '../core/api.config';
import { BrowserEvent, TelemetryCategory, safeTelemetryText, safeTelemetryUrl } from '../contracts/telemetry.contracts';
export type ObservabilityCategory = 'navigation' | 'click' | 'http' | 'js' | 'auth' | 'search' | 'filter' | 'booking' | 'modal' | 'system';
export type AnalyticsEventType = 'SEARCH' | 'VIEW_ATTRACTION' | 'SELECT_PACKAGE' | 'CHECKOUT_STEP' | 'RESERVATION_SUCCESS' | 'HTTP_LATENCY' | 'OTHER';
type Connection = EventTarget & { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };

@Injectable({ providedIn: 'root' })
export class ObservabilityService implements OnDestroy {
  // Public ingestion bypasses interceptors: no JWT and no telemetry feedback loop.
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly endpoint = `${inject(API_URL)}/observabilidad/eventos`;
  private readonly router = inject(Router, { optional: true });
  private readonly sessionId = crypto.randomUUID();
  readonly events = signal<BrowserEvent[]>([]);
  private queue: BrowserEvent[] = [];
  private readonly cleanups: (() => void)[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private loadTimer?: ReturnType<typeof setTimeout>;
  private inFlight?: Subscription;
  private routing?: Subscription;
  private sending = false;
  private destroyed = false;
  private lastFlush = 0;
  private failures = 0;
  constructor() {
    try { localStorage.removeItem('viveloeu_analytics_events'); localStorage.removeItem('booking-observability:v1'); } catch { /* storage unavailable */ }
    this.captureCapabilities(); this.captureViewport(); this.captureConnection();
    this.listen(window, 'error', event => {
      const target = event.target;
      if (target instanceof HTMLElement && target !== document.documentElement) {
        this.record('RESOURCE_ERROR', 'resource_error', { tag: target.tagName.toLowerCase(), url: safeTelemetryUrl(target.getAttribute('src') ?? target.getAttribute('href') ?? '') });
      } else {
        const error = event as ErrorEvent;
        this.record('ERROR', 'window_error', { message: safeTelemetryText(error.message || 'JavaScript error'), filename: safeTelemetryUrl(error.filename || ''), line: error.lineno || 0 });
      }
    }, true);
    this.listen(window, 'unhandledrejection', event => this.record('ERROR', 'unhandled_rejection', { reason: this.errorReason((event as PromiseRejectionEvent).reason) }));
    this.listen(document, 'click', event => {
      const target = event.target instanceof Element ? event.target.closest('a,button,input,select,textarea,[role="button"],[role="link"]') : null;
      if (!target || target.matches('input[type="password"],input[type="hidden"]') || target.closest('[data-telemetry="off"]')) return;
      // No textContent, value, name, id, arbitrary attributes or form content.
      this.record('INTERACTION', 'click', { tag: target.tagName.toLowerCase(), role: target.getAttribute('role') === 'link' ? 'link' : target.getAttribute('role') === 'button' ? 'button' : 'control', action: 'activate' });
    }, true);
    this.listen(document, 'visibilitychange', () => {
      this.record('VISIBILITY', 'visibility_change', { state: document.visibilityState });
      if (document.visibilityState === 'hidden') this.flushBeacon();
    });
    this.listen(window, 'resize', () => { if (this.resizeTimer) clearTimeout(this.resizeTimer); this.resizeTimer = setTimeout(() => this.captureViewport(), 250); });
    const connection = this.connection();
    if (connection?.addEventListener) this.listen(connection, 'change', () => this.captureConnection());
    this.listen(window, 'pagehide', () => this.flushBeacon());
    if (document.readyState === 'complete') this.loadTimer = setTimeout(() => this.capturePerformance(), 0);
    else this.listen(window, 'load', () => { this.loadTimer = setTimeout(() => this.capturePerformance(), 0); });
    let navigationStart = this.now();
    this.routing = this.router?.events.subscribe(event => {
      if (event instanceof NavigationStart) navigationStart = this.now();
      if (event instanceof NavigationEnd) this.record('PERFORMANCE', 'route_navigation', { durationMs: Math.max(0, this.now() - navigationStart) });
    });
    this.timer = setInterval(() => this.flush(), 5000);
  }
  private listen(target: EventTarget, type: string, handler: (event: Event) => void, capture = false) {
    target.addEventListener(type, handler, capture); this.cleanups.push(() => target.removeEventListener(type, handler, capture));
  }
  private now() { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(); }
  private errorReason(reason: unknown): string {
    return reason instanceof Error ? safeTelemetryText(reason.message) : typeof reason === 'string' ? safeTelemetryText(reason) : 'Non-string rejection (content omitted)';
  }
  private record(category: TelemetryCategory, type: string, payload: BrowserEvent['payload']) {
    if (this.destroyed) return;
    const event: BrowserEvent = { category, type, timestamp: new Date().toISOString(), route: safeTelemetryUrl(location.pathname), sessionId: this.sessionId, payload };
    this.events.update(events => [...events, event].slice(-100)); this.queue = [...this.queue, event].slice(-100);
    if (this.queue.length >= 20 && Date.now() - this.lastFlush >= 3000) this.flush();
  }
  track(type: ObservabilityCategory, name: string, details?: Record<string, unknown>, _eventType?: AnalyticsEventType) {
    if (type === 'js') this.record('ERROR', name === 'unhandled_rejection' ? name : name === 'window_error' ? name : 'angular_error', { message: this.errorReason(details?.['message'] ?? details?.['reason'] ?? 'Application error') });
    else this.record('DOMAIN', 'application_event', { action: safeTelemetryText(name) });
  }
  trackEvent(eventType: Exclude<AnalyticsEventType, 'HTTP_LATENCY'>, _payload: Record<string, unknown>) { this.record('DOMAIN', 'application_event', { action: eventType }); }
  recordHttp(method: string, url: string, durationMs: number, status: number, error = false) {
    if (/\/observabilidad(?:\/|$)/.test(url)) return;
    this.record('HTTP', error ? 'http_error' : 'http_request', { method, url: safeTelemetryUrl(url), durationMs: Math.max(0, Math.round(durationMs)), status });
  }
  capturePerformance() {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!nav || nav.loadEventEnd <= 0) return;
    const resources = performance.getEntriesByType('resource');
    this.record('PERFORMANCE', 'navigation_timing', {
      durationMs: Math.max(0, nav.duration), domContentLoadedMs: Math.max(0, nav.domContentLoadedEventEnd - nav.startTime), loadMs: Math.max(0, nav.loadEventEnd - nav.startTime),
      resourceCount: resources.length, resourceDurationMs: resources.reduce((sum, entry) => sum + Math.max(0, entry.duration), 0),
    });
  }
  captureViewport() { this.record('VIEWPORT', 'viewport', { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 }); }
  private connection(): Connection | undefined { return (navigator as Navigator & { connection?: Connection }).connection; }
  captureConnection() {
    const connection = this.connection(); const payload: BrowserEvent['payload'] = { supported: !!connection };
    if (connection) for (const key of ['effectiveType', 'downlink', 'rtt', 'saveData'] as const) { const value = connection[key]; if (value !== undefined) payload[key] = value; }
    this.record('CONNECTION', 'connection', payload);
  }
  captureCapabilities() {
    const storage = (name: 'localStorage' | 'sessionStorage') => { try { const store = window[name]; store.setItem('telemetry:probe', '1'); store.removeItem('telemetry:probe'); return true; } catch { return false; } };
    this.record('CAPABILITY', 'capabilities', {
      performance: typeof performance !== 'undefined' && typeof performance.now === 'function', navigationTiming: this.supportsNavigationTiming(), networkInformation: !!this.connection(),
      localStorage: storage('localStorage'), sessionStorage: storage('sessionStorage'), eventSource: typeof EventSource !== 'undefined', webSocket: typeof WebSocket !== 'undefined', serviceWorker: 'serviceWorker' in navigator, sendBeacon: typeof navigator.sendBeacon === 'function',
    });
  }
  private supportsNavigationTiming(): boolean {
    try {
      return typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function'
        && (typeof PerformanceNavigationTiming !== 'undefined' || performance.getEntriesByType('navigation').length > 0);
    } catch { return false; }
  }
  flush() {
    if (this.destroyed || this.sending || !this.queue.length) return;
    this.queue = this.queue.filter(event => Date.now() - Date.parse(event.timestamp) < 300000);
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, 20); this.sending = true; this.lastFlush = Date.now();
    this.inFlight = this.http.post(this.endpoint, { events: batch }).subscribe({
      next: () => { this.sending = false; this.failures = 0; },
      error: () => { this.sending = false; if (++this.failures <= 3) this.queue = [...batch, ...this.queue].slice(-100); },
    });
  }
  private flushBeacon() {
    if (!this.queue.length || this.sending || typeof navigator.sendBeacon !== 'function') { this.flush(); return; }
    const batch = this.queue.slice(0, 20);
    try { if (navigator.sendBeacon(this.endpoint, new Blob([JSON.stringify({ events: batch })], { type: 'application/json' }))) this.queue.splice(0, batch.length); else this.flush(); } catch { this.flush(); }
  }
  ngOnDestroy() {
    this.destroyed = true; this.cleanups.forEach(cleanup => cleanup()); this.routing?.unsubscribe(); this.inFlight?.unsubscribe();
    if (this.timer) clearInterval(this.timer); if (this.resizeTimer) clearTimeout(this.resizeTimer); if (this.loadTimer) clearTimeout(this.loadTimer); this.queue = [];
  }
}

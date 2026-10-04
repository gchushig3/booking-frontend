import { Injectable, inject, isDevMode, signal } from '@angular/core';
import { AuthService } from './auth.service';

export type ObservabilityCategory = 'navigation' | 'click' | 'http' | 'js' | 'auth' | 'search' | 'filter' | 'booking' | 'modal' | 'system';
export type AnalyticsEventType = 'SEARCH' | 'VIEW_ATTRACTION' | 'SELECT_PACKAGE' | 'CHECKOUT_STEP' | 'RESERVATION_SUCCESS' | 'HTTP_LATENCY' | 'OTHER';
export type AnalyticsUserRole = 'GUEST' | 'ADMIN';
export interface ObservabilityEvent {
  id: string;
  timestamp: string;
  type: ObservabilityCategory;
  name: string;
  eventType: AnalyticsEventType;
  payload: Record<string, unknown>;
  userRole: AnalyticsUserRole;
  details?: Record<string, unknown>;
}

const STORAGE_KEY = 'viveloeu_analytics_events';
const LEGACY_STORAGE_KEY = 'booking-observability:v1';
const MAX_EVENTS = 100;

@Injectable({ providedIn: 'root' })
export class ObservabilityService {
  private readonly authService = inject(AuthService);
  readonly events = signal<ObservabilityEvent[]>(this.readEvents());
  private readonly startedAt = this.now();

  constructor() {
    this.track('navigation', 'page_load', { url: this.safe(() => `${location.origin}${location.pathname}`, '') });
    this.installGlobalListeners();
    this.installConsoleApi();
    this.safe(() => window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY || event.key === null) this.refreshFromStorage();
    }), undefined);
  }

  track(type: ObservabilityCategory, name: string, details?: Record<string, unknown>, eventType = this.inferEventType(type, name)): void {
    const payload = details ? this.sanitize(details) : {};
    const event: ObservabilityEvent = {
      id: this.makeId(), timestamp: new Date().toISOString(), type, name,
      eventType, payload, details: payload, userRole: this.authService.isAdmin() ? 'ADMIN' : 'GUEST',
    };
    const events = [...this.events(), event].slice(-MAX_EVENTS);
    this.events.set(events);
    this.persist(events);
  }

  recordHttp(method: string, url: string, durationMs: number, status: number, error = false): void {
    const payload = { method, url: this.apiRoute(url), durationMs: Math.round(durationMs), status };
    this.track('http', error ? 'http_error' : 'http_request', payload, 'HTTP_LATENCY');
  }

  trackEvent(eventType: Exclude<AnalyticsEventType, 'HTTP_LATENCY'>, payload: Record<string, unknown>): void {
    const legacy = eventType === 'SEARCH' ? ['search', 'search_submitted'] as const
      : eventType === 'VIEW_ATTRACTION' ? ['navigation', 'attraction_viewed'] as const
      : eventType === 'SELECT_PACKAGE' ? ['booking', 'package_selected'] as const
      : eventType === 'CHECKOUT_STEP' ? ['booking', 'checkout_step'] as const
      : ['booking', 'booking_success'] as const;
    this.track(legacy[0], legacy[1], payload, eventType);
  }

  getSnapshot(): Record<string, unknown> {
    if (!isDevMode() && !this.authService.isAdmin()) return { access: 'denied' };
    const events = this.events();
    const navigation = this.safe(() => performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined, undefined);
    const resources = this.safe(() => performance.getEntriesByType('resource') as PerformanceResourceTiming[], []);
    const http = events.filter((event) => event.type === 'http');
    const errors = events.filter((event) => event.type === 'js' || event.name === 'http_error').length;
    const bookings = events.filter((event) => event.type === 'booking');
    return {
      generatedAt: new Date().toISOString(), startedAt: this.startedAt,
      environment: this.environment(),
      performance: {
        initialLoadMs: navigation?.loadEventEnd ? Math.round(navigation.loadEventEnd) : null,
        domContentLoadedMs: navigation?.domContentLoadedEventEnd ? Math.round(navigation.domContentLoadedEventEnd) : null,
        resources: resources.slice(-100).map((entry) => ({ name: this.safeUrl(entry.name), durationMs: Math.round(entry.duration), transferSize: entry.transferSize })),
        requests: http.map((event) => event.details),
      },
      metrics: { totalEvents: events.length, errors, bookingAttempts: bookings.filter((e) => e.name === 'booking_attempt').length, bookingSuccesses: bookings.filter((e) => e.name === 'booking_success').length },
      events,
    };
  }

  clear(): void {
    this.events.set([]);
    this.safe(() => localStorage.removeItem(STORAGE_KEY), undefined);
  }

  refreshFromStorage(): void {
    const stored = this.safe(() => localStorage.getItem(STORAGE_KEY), undefined as string | null | undefined);
    if (stored === undefined) return;
    if (!stored) {
      const legacy = this.safe(() => localStorage.getItem(LEGACY_STORAGE_KEY), null);
      if (legacy) {
        this.loadStoredValue(legacy);
        this.safe(() => localStorage.removeItem(LEGACY_STORAGE_KEY), undefined);
      } else this.events.set([]);
      return;
    }
    this.loadStoredValue(stored);
  }

  private installGlobalListeners(): void {
    this.safe(() => {
      window.addEventListener('error', (event) => this.track('js', 'window_error', { message: event.message, filename: event.filename, line: event.lineno }));
      window.addEventListener('unhandledrejection', (event) => this.track('js', 'unhandled_rejection', { reason: String(event.reason ?? 'Unknown rejection') }));
      document.addEventListener('visibilitychange', () => this.track('navigation', 'visibility_change', { state: document.visibilityState }));
    }, undefined);
  }

  private installConsoleApi(): void {
    this.safe(() => { (window as Window & { BookingObservability?: { getSnapshot: () => Record<string, unknown> } }).BookingObservability = { getSnapshot: () => this.getSnapshot() }; }, undefined);
  }

  private environment(): Record<string, unknown> {
    return this.safe(() => {
      const nav = navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } };
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        connection: nav.connection ? { effectiveType: nav.connection.effectiveType, downlink: nav.connection.downlink, rtt: nav.connection.rtt, saveData: nav.connection.saveData } : null,
        apis: { performance: typeof performance !== 'undefined', resourceTiming: typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function', storage: this.storageAvailable(), connection: Boolean(nav.connection) },
        userAgent: nav.userAgent,
      };
    }, {} as Record<string, unknown>);
  }

  private readEvents(): ObservabilityEvent[] {
    return this.safe(() => {
      const value = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!value) return [];
      const parsedValue: unknown = JSON.parse(value);
      const parsed = Array.isArray(parsedValue) ? parsedValue as Partial<ObservabilityEvent>[] : [];
      const events = this.realEvents(parsed.map((event) => this.normalizeEvent(event))).slice(-MAX_EVENTS);
      if (events.length !== parsed.length || !Array.isArray(parsedValue) || value !== localStorage.getItem(STORAGE_KEY)) this.persist(events);
      this.safe(() => localStorage.removeItem(LEGACY_STORAGE_KEY), undefined);
      return events;
    }, []);
  }
  private loadStoredValue(value: string): void {
    this.safe(() => {
      const parsedValue: unknown = JSON.parse(value);
      const parsed = Array.isArray(parsedValue) ? parsedValue as Partial<ObservabilityEvent>[] : [];
      const events = this.realEvents(parsed.map((event) => this.normalizeEvent(event))).slice(-MAX_EVENTS);
      this.events.set(events);
      if (events.length !== parsed.length || !Array.isArray(parsedValue)) this.persist(events);
    }, undefined);
  }
  private normalizeEvent(event: Partial<ObservabilityEvent>): ObservabilityEvent {
    const type = event.type ?? 'system';
    const name = event.name ?? 'legacy_event';
    const payload = event.payload ?? event.details ?? {};
    return {
      id: event.id ?? this.makeId(), timestamp: event.timestamp ?? new Date().toISOString(), type, name,
      eventType: event.eventType ?? this.inferEventType(type, name), payload, details: event.details ?? payload,
      userRole: event.userRole ?? 'GUEST',
    };
  }
  private realEvents(events: ObservabilityEvent[]): ObservabilityEvent[] {
    return events.filter((event) => event?.name !== 'demo_event' && event?.name !== 'demo_error');
  }
  private persist(events: ObservabilityEvent[]): void { this.safe(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(events)), undefined); }
  private storageAvailable(): boolean { return this.safe(() => { const key = `${STORAGE_KEY}:probe`; localStorage.setItem(key, '1'); localStorage.removeItem(key); return true; }, false); }
  private safe<T>(operation: () => T, fallback: T): T { try { return operation(); } catch { return fallback; } }
  private now(): number { return this.safe(() => performance.now(), Date.now()); }
  private makeId(): string { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
  private safeUrl(value: string): string { return value.split('?')[0]?.slice(0, 240) ?? ''; }
  private apiRoute(value: string): string {
    const path = this.safe(() => new URL(value, location.origin).pathname, value.split('?')[0] ?? '');
    const parts = path.split('/');
    const versionIndex = parts.findIndex((part) => /^v\d+$/i.test(part));
    for (let index = versionIndex >= 0 ? versionIndex + 2 : 0; index < parts.length; index++) {
      if (/^\d+$/.test(parts[index]) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(parts[index])) parts[index] = ':id';
    }
    return parts.join('/').slice(0, 240);
  }
  private inferEventType(type: ObservabilityCategory, name: string): AnalyticsEventType {
    if (type === 'http') return 'HTTP_LATENCY';
    if (name.includes('attraction_view')) return 'VIEW_ATTRACTION';
    if (name.includes('package_selected')) return 'SELECT_PACKAGE';
    if (name.includes('checkout_step')) return 'CHECKOUT_STEP';
    if (name.includes('booking_success')) return 'RESERVATION_SUCCESS';
    if (name.includes('search')) return 'SEARCH';
    return 'OTHER';
  }
  private sanitize(value: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/password|token|authorization|email|customer_name|identity_number|card|cvc/i.test(key)) continue;
      result[key] = typeof item === 'string' ? item.slice(0, 300) : item;
    }
    return result;
  }
}

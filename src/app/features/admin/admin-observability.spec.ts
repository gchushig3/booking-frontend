import { Subject, throwError } from 'rxjs';
import { ObservabilityApiService } from './observability-api.service';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AdminObservability } from './admin-observability';
import { API_URL } from '../../core/api.config';
import { routes } from '../../app.routes';
import { AuthService } from '../../services/auth.service';
import { TelemetrySnapshot } from '../../contracts/telemetry.contracts';

const endpoint = '/api/v1/admin/observabilidad/eventos';
function data(message = 'Actual browser error'): TelemetrySnapshot {
  return { generatedAt: '2026-10-06T12:00:00Z', events: [{ id: message, receivedAt: '2026-10-06T12:00:00Z', category: 'ERROR', type: 'window_error', timestamp: '2026-10-06T12:00:00Z', route: '/actividades', sessionId: 'test-session', payload: { message } }],
    summary: { sampleSize: 1, sampleLimit: 100, counts: { ERROR: 1, PERFORMANCE: 0, RESOURCE_ERROR: 0, INTERACTION: 0, VISIBILITY: 0, VIEWPORT: 0, CONNECTION: 0, CAPABILITY: 0, HTTP: 0, DOMAIN: 0 }, navigationSamples: 0, averageLoadMs: null } };
}
describe('Persisted ADMIN observability dashboard', () => {
  let http: HttpTestingController;
  let stream: Subject<TelemetrySnapshot>;
  beforeEach(() => {
    vi.useFakeTimers(); localStorage.clear(); stream = new Subject();
    TestBed.configureTestingModule({ imports: [AdminObservability], providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }] });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(ObservabilityApiService), 'stream').mockReturnValue(throwError(() => new Error('SSE unavailable')));
  });
  afterEach(() => { TestBed.resetTestingModule(); http.verify(); vi.useRealTimers(); localStorage.clear(); });
  function create() { const fixture = TestBed.createComponent(AdminObservability); fixture.detectChanges(); vi.advanceTimersByTime(2100); return fixture; }
  it('receives SSE snapshots without polling and unsubscribes on destruction', () => {
    vi.mocked(TestBed.inject(ObservabilityApiService).stream).mockReturnValue(stream);
    const fixture = create(); stream.next(data()); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('SSE'); http.expectNone(endpoint);
    stream.next(data('Live persisted event')); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Live persisted event');
    fixture.destroy(); expect(stream.observed).toBe(false);
  });
  it('does not fallback or destroy the session after SSE 403', () => {
    const auth = TestBed.inject(AuthService); auth.authenticated.set(true); localStorage.setItem('access_token', 'test-token');
    vi.mocked(TestBed.inject(ObservabilityApiService).stream).mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const fixture = create(); expect(fixture.componentInstance.state()).toBe('desconectado');
    expect(auth.getToken()).toBe('test-token'); http.expectNone(endpoint);
  });
  it('falls back when an open stream never delivers its first snapshot', () => {
    vi.mocked(TestBed.inject(ObservabilityApiService).stream).mockReturnValue(stream);
    const fixture = TestBed.createComponent(AdminObservability);
    fixture.detectChanges();
    vi.advanceTimersByTime(32001);
    http.expectOne(endpoint).flush(data('Recovered from silent stream'));
    expect(fixture.componentInstance.transport()).toBe('polling');
    expect(fixture.componentInstance.state()).toBe('conectado');
    expect(stream.observed).toBe(false);
  });
  it('renews a normally completed stream without treating it as a connection failure', () => {
    const renewed = new Subject<TelemetrySnapshot>();
    vi.mocked(TestBed.inject(ObservabilityApiService).stream).mockReturnValueOnce(stream).mockReturnValue(renewed);
    const fixture = TestBed.createComponent(AdminObservability);
    fixture.detectChanges();
    stream.next(data());
    stream.complete();
    vi.advanceTimersByTime(1000);
    renewed.next(data('Renewed stream'));
    expect(fixture.componentInstance.transport()).toBe('SSE');
    expect(fixture.componentInstance.events()[0].id).toBe('Renewed stream');
    http.expectNone(endpoint);
  });
  it('detects a stalled stream after a snapshot and limits retries even after successful snapshots', () => {
    vi.mocked(TestBed.inject(ObservabilityApiService).stream).mockReturnValue(stream);
    const fixture = TestBed.createComponent(AdminObservability);
    fixture.detectChanges();
    for (let attempt = 0; attempt < 3; attempt++) {
      stream.next(data());
      vi.advanceTimersByTime(25000);
      if (attempt < 2) vi.advanceTimersByTime(1000);
    }
    vi.advanceTimersByTime(1);
    http.expectOne(endpoint).flush(data('Recovered live data'));
    expect(fixture.componentInstance.transport()).toBe('polling');
    fixture.destroy();
    vi.advanceTimersByTime(6000);
    http.expectNone(endpoint);
  });
  it('renders events returned by the ADMIN API, without using local telemetry as the source', () => {
    const fixture = create(); http.expectOne(endpoint).flush(data()); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Actual browser error');
    expect(fixture.nativeElement.textContent).toContain('conectado');
    expect(fixture.nativeElement.textContent).toContain('polling');
    expect(fixture.nativeElement.textContent).toContain('Promedio disponible');
  });
  it('updates automatically on polling and stops on destruction', () => {
    const fixture = create(); http.expectOne(endpoint).flush(data());
    vi.advanceTimersByTime(3000); http.expectOne(endpoint).flush(data('New real event')); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('New real event');
    fixture.destroy(); vi.advanceTimersByTime(10000); http.expectNone(endpoint);
  });
  it('automatically shows all clients and devices including administration activity', () => {
    const fixture = create();
    const snapshot = data('Mobile client action');
    snapshot.events.push({ ...snapshot.events[0], id: 'admin-event', sessionId: 'desktop-admin', route: '/admin/observabilidad' });
    snapshot.events.push({ ...snapshot.events[0], id: 'other-client', sessionId: 'other-client' });
    for (const [sessionId, width] of [['test-session', 390], ['desktop-admin', 1365]] as const) {
      snapshot.events.push({ ...snapshot.events[0], id: sessionId + '-viewport', sessionId, category: 'VIEWPORT', payload: { width } });
    }
    http.expectOne(endpoint).flush(snapshot);
    fixture.detectChanges();
    expect(fixture.componentInstance.events()).toHaveLength(5);
    expect(fixture.componentInstance.count('ERROR')).toBe(3);
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    const context = fixture.nativeElement.querySelector('[aria-label="Contexto de los dispositivos"]');
    expect(context.textContent).toContain('390');
    expect(context.textContent).toContain('1365');
    const events = fixture.nativeElement.querySelector('[aria-label="Eventos recientes"]');
    for (const id of ['test-session', 'desktop-admin', 'other-client']) expect(events.textContent).toContain(id);
  });
  it('cancels a stuck polling request so later updates can proceed', () => {
    const fixture = create();
    const stuck = http.expectOne(endpoint);
    vi.advanceTimersByTime(10000);
    expect(stuck.cancelled).toBe(true);
    expect(fixture.componentInstance.state()).toBe('reconectando');
    vi.advanceTimersByTime(2000);
    http.expectOne(endpoint).flush(data('Polling recovered'));
    expect(fixture.componentInstance.state()).toBe('conectado');
  });
  it('reconnects after a transient failure without presenting stale data as current', () => {
    const fixture = create(); http.expectOne(endpoint).flush(data()); vi.advanceTimersByTime(3000);
    http.expectOne(endpoint).flush({}, { status: 500, statusText: 'Error' }); expect(fixture.componentInstance.state()).toBe('reconectando');
    vi.advanceTimersByTime(3000); http.expectOne(endpoint).flush(data()); expect(fixture.componentInstance.state()).toBe('conectado');
  });
  it('preserves authentication and stops polling after 403', () => {
    const auth = TestBed.inject(AuthService); auth.authenticated.set(true); localStorage.setItem('access_token', 'test-token');
    const fixture = create(); http.expectOne(endpoint).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(fixture.componentInstance.state()).toBe('desconectado'); expect(auth.getToken()).toBe('test-token');
    vi.advanceTimersByTime(6000); http.expectNone(endpoint);
  });
});
describe('Observability route authorization', () => {
  beforeEach(() => { localStorage.clear(); TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }] }); });
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });
  for (const role of ['CLIENTE', 'ADMIN'] as const) it(`${role} receives the appropriate route access`, async () => {
    const auth = TestBed.inject(AuthService); auth.authenticated.set(true);
    localStorage.setItem('access_token', 'h.' + btoa(JSON.stringify({ role })) + '.s');
    const harness = await RouterTestingHarness.create(); await harness.navigateByUrl('/admin/observabilidad'); harness.detectChanges();
    const router = TestBed.inject(Router);
    expect(router.url).toContain(role === 'ADMIN' ? '/admin/observabilidad' : '/acceso-denegado');
    if (role === 'CLIENTE') TestBed.inject(HttpTestingController).expectNone(endpoint);
  });
});

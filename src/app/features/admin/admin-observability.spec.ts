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

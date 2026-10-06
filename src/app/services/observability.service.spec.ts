import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ObservabilityService } from './observability.service';
import { API_URL } from '../core/api.config';
import { safeTelemetryText, safeTelemetryUrl } from '../contracts/telemetry.contracts';

describe('Real browser telemetry', () => {
  let service: ObservabilityService;
  let http: HttpTestingController;
  let root: HTMLElement;
  const originalConnection = Object.getOwnPropertyDescriptor(navigator, 'connection');
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }] });
    http = TestBed.inject(HttpTestingController);
    root = document.createElement('div'); document.body.append(root);
  });
  afterEach(() => {
    service?.ngOnDestroy(); http.verify(); root.remove();
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    if (originalConnection) Object.defineProperty(navigator, 'connection', originalConnection); else delete (navigator as unknown as Record<string, unknown>)['connection'];
  });
  function start() { service = TestBed.inject(ObservabilityService); return service; }
  function last(type: string) { return service.events().filter(event => event.type === type).at(-1)!; }
  it('reads Navigation Timing and aggregate resource durations from Performance API', () => {
    vi.stubGlobal('performance', { now: () => 0, getEntriesByType: (type: string) => type === 'navigation' ? [{ startTime: 0, duration: 120, loadEventEnd: 120, domContentLoadedEventEnd: 80 }] : [{ duration: 10 }, { duration: 20 }] });
    start().capturePerformance();
    expect(last('navigation_timing').payload).toEqual({ durationMs: 120, loadMs: 120, domContentLoadedMs: 80, resourceCount: 2, resourceDurationMs: 30 });
  });
  it('survives missing Performance API and reports unsupported capabilities', () => {
    vi.stubGlobal('performance', undefined); start().capturePerformance();
    expect(last('capabilities').payload['performance']).toBe(false);
    expect(service.events().some(event => event.type === 'navigation_timing')).toBe(false);
  });
  it('does not claim Navigation Timing when only resource entries are supported', () => {
    vi.stubGlobal('PerformanceNavigationTiming', undefined);
    vi.stubGlobal('performance', { now: () => 0, getEntriesByType: () => [] });
    start();
    expect(last('capabilities').payload['navigationTiming']).toBe(false);
  });
  it('redacts encoded identity, email and credentials in URL path segments', () => {
    for (const secret of ['1710034065', 'ana%40example.test', 'token%3Dprivate', 'eyJhbGciOiJIUzI1NiJ9.payload.signature']) {
      expect(safeTelemetryUrl('/resource/' + secret + '?cvv=123')).toBe('/resource/[redacted]');
    }
  });
  it('redacts complete quoted passwords and cookie headers', () => {
    for (const message of ['password="two word secret"', "password='two word secret'", 'Cookie: session=private; csrf=another', 'cédula=1710034065']) {
      expect(safeTelemetryText(message)).toBe('[redacted]');
    }
  });
  it('captures real window error events', () => {
    start(); window.dispatchEvent(new ErrorEvent('error', { message: 'Test JS failure', filename: 'https://example.test/app.js?token=secret', lineno: 4 }));
    expect(last('window_error').payload).toMatchObject({ message: 'Test JS failure', filename: 'https://example.test/app.js', line: 4 });
  });
  it('captures unhandled rejection without serializing arbitrary objects', () => {
    start(); const event = new Event('unhandledrejection'); Object.defineProperty(event, 'reason', { value: { token: 'private-token' } }); window.dispatchEvent(event);
    expect(last('unhandled_rejection').payload['reason']).toContain('content omitted');
    expect(JSON.stringify(service.events())).not.toContain('private-token');
  });
  it('captures resource load failures in capture phase', () => {
    start(); const image = document.createElement('img'); image.src = 'https://example.test/missing.png?password=secret'; root.append(image); image.dispatchEvent(new Event('error'));
    expect(last('resource_error').payload).toEqual({ tag: 'img', url: 'https://example.test/missing.png' });
  });
  it('captures a click on a real button', () => {
    start(); const button = document.createElement('button'); root.append(button); button.click();
    expect(last('click').payload).toEqual({ tag: 'button', role: 'control', action: 'activate' });
  });
  it('does not record passwords or input values and never reads form contents', () => {
    start(); const password = document.createElement('input'); password.type = 'password'; password.value = 'secret-value'; root.append(password); password.click();
    expect(service.events().some(event => event.type === 'click')).toBe(false);
    const input = document.createElement('input'); input.value = '4242424242424242'; root.append(input); input.click();
    expect(JSON.stringify(service.events())).not.toContain('4242424242424242');
    expect(JSON.stringify(service.events())).not.toContain('secret-value');
  });
  it('captures visibilitychange', () => {
    start(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'));
    expect(last('visibility_change').payload).toEqual({ state: 'visible' });
  });
  it('records actual viewport dimensions and pixel ratio', () => {
    start(); expect(last('viewport').payload).toEqual({ width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 });
  });
  it('debounces repeated resize events', () => {
    start(); const initial = service.events().filter(event => event.type === 'viewport').length;
    for (let index = 0; index < 10; index++) window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(249); expect(service.events().filter(event => event.type === 'viewport')).toHaveLength(initial);
    vi.advanceTimersByTime(1); expect(service.events().filter(event => event.type === 'viewport')).toHaveLength(initial + 1);
  });
  it('captures available Network Information properties and changes', () => {
    const connection = Object.assign(new EventTarget(), { effectiveType: '4g', downlink: 10, rtt: 25, saveData: false });
    Object.defineProperty(navigator, 'connection', { configurable: true, value: connection }); start();
    expect(last('connection').payload).toEqual({ supported: true, effectiveType: '4g', downlink: 10, rtt: 25, saveData: false });
    connection.rtt = 50; connection.dispatchEvent(new Event('change')); expect(last('connection').payload['rtt']).toBe(50);
  });
  it('reports missing connection API without throwing', () => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined }); start();
    expect(last('connection').payload).toEqual({ supported: false });
  });
  it('records a bounded capability set without user-agent fingerprinting', () => {
    start(); expect(Object.keys(last('capabilities').payload)).toEqual(['performance', 'navigationTiming', 'networkInformation', 'localStorage', 'sessionStorage', 'eventSource', 'webSocket', 'serviceWorker', 'sendBeacon']);
    expect(JSON.stringify(service.events())).not.toContain('userAgent');
  });
  it('batches events by interval and omits Authorization on public ingestion', () => {
    start(); service.track('auth', 'login_success'); http.expectNone('/api/v1/observabilidad/eventos');
    vi.advanceTimersByTime(5000); const req = http.expectOne('/api/v1/observabilidad/eventos');
    expect(req.request.method).toBe('POST'); expect(req.request.body.events.length).toBeGreaterThan(1);
    expect(req.request.body.events.length).toBeLessThanOrEqual(20); expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ accepted: req.request.body.events.length });
  });
  it('flushes a batch at the size limit', () => {
    start(); for (let index = 0; index < 17; index++) service.track('auth', 'login_success');
    const req = http.expectOne('/api/v1/observabilidad/eventos'); expect(req.request.body.events).toHaveLength(20); req.flush({ accepted: 20 });
  });
  it('strips credentials, query and fragment from URLs', () => {
    expect(safeTelemetryUrl('https://user:password@example.test/path?token=secret#private')).toBe('https://example.test/path');
    expect(safeTelemetryUrl('/activities?password=secret#private')).toBe('/activities');
    expect(safeTelemetryUrl('data:text/plain,sensitive-content')).toBe('/unsupported-url');
  });
  it('sanitizes JWT, passwords, identity numbers and email inside errors', () => {
    const result = safeTelemetryText('Bearer abc password=private token=hidden 1710034065 ana@example.test {"cvv":"123"}');
    for (const secret of ['abc', 'private', 'hidden', '1710034065', 'ana@example.test', '123']) expect(result).not.toContain(secret);
    expect(safeTelemetryText('card failed 4242 4242 4242 4242')).not.toContain('4242');
  });
  it('does not persist telemetry in localStorage', () => {
    start(); service.track('booking', 'booking_success', { password: 'secret', nested: { token: 'private' } });
    expect(localStorage.getItem('viveloeu_analytics_events')).toBeNull();
    expect(JSON.stringify(service.events())).not.toContain('private');
  });
  it('does not recursively capture ingestion or dashboard HTTP traffic', () => {
    start(); const count = service.events().length;
    service.recordHttp('POST', '/api/v1/observabilidad/eventos', 1, 202);
    service.recordHttp('GET', '/api/v1/admin/observabilidad/eventos', 2, 200);
    expect(service.events()).toHaveLength(count);
  });
  it('removes listeners and timers when destroyed', () => {
    start(); const count = service.events().length; service.ngOnDestroy();
    window.dispatchEvent(new ErrorEvent('error', { message: 'After destroy' })); window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(10000); expect(service.events()).toHaveLength(count); http.expectNone('/api/v1/observabilidad/eventos');
  });
});

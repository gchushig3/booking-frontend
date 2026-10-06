import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { API_URL } from '../../core/api.config';
import { AuthService } from '../../services/auth.service';
import { ObservabilityApiService } from './observability-api.service';

describe('Authenticated SSE transport', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), { provide: API_URL, useValue: '/api/v1' }] });
    vi.spyOn(TestBed.inject(AuthService), 'getToken').mockReturnValue('private-jwt');
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('decodes split SSE frames, uses Authorization and aborts on cleanup', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(encoder.encode('event: snapshot\r\ndata: {"events":'));
      controller.enqueue(encoder.encode('[]}\r\n\r\n'));
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetchMock);
    const received = new Promise<unknown>((resolve, reject) => {
      const subscription = TestBed.inject(ObservabilityApiService).stream().subscribe({ next: value => { resolve(value); subscription.unsubscribe(); }, error: reject });
    });
    expect(await received).toEqual({ events: [] });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/admin/observabilidad/stream');
    expect(url).not.toContain('private-jwt');
    expect(options.headers.Authorization).toBe('Bearer private-jwt');
    expect(options.signal.aborted).toBe(true);
  });
  it('rejects a response that is not SSE so the dashboard can fallback honestly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } })));
    const error = await new Promise<Error>(resolve => TestBed.inject(ObservabilityApiService).stream().subscribe({ error: resolve }));
    expect(error.message).toContain('SSE no disponible');
  });
  it('propagates 403 without logging out or putting JWT in a URL', async () => {
    const logout = vi.spyOn(TestBed.inject(AuthService), 'logout');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
    const error = await new Promise<{ status: number }>(resolve => TestBed.inject(ObservabilityApiService).stream().subscribe({ error: resolve }));
    expect(error.status).toBe(403); expect(logout).not.toHaveBeenCalled();
  });
});

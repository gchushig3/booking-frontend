import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { API_URL } from './core/api.config';
import { AuthService } from './services/auth.service';
import { reservation, attraction } from './testing/booking.fixtures';

describe('My reservations and cancellation flow', () => {
  let fixture: ComponentFixture<App>;
  let app: App;
  let http: HttpTestingController;
  const listUrl = '/api/v1/atracciones/reservations';
  const cancelUrl = listUrl + '/' + reservation.reservation_id + '/cancel';
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }] });
    fixture = TestBed.createComponent(App); app = fixture.componentInstance; http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); http.expectOne(req => req.url === '/api/v1/atracciones').flush({ data: [], meta: { total: 0, page: 1, lastPage: 1 } });
    TestBed.inject(AuthService).authenticated.set(true); app['vistaActual'].set('reservas');
  });
  afterEach(() => { try { fixture.destroy(); http.verify(); } finally { localStorage.clear(); TestBed.resetTestingModule(); } });
  function load() { app['cargarMisReservas'](); http.expectOne(listUrl).flush([reservation]); fixture.detectChanges(); }
  function text() { return fixture.nativeElement.textContent as string; }
  it('loads actual reservations and displays adults, children, slots, total and state', () => {
    app['cargarMisReservas'](); fixture.detectChanges(); expect(fixture.nativeElement.querySelector('[aria-label="Cargando reservas"]')).not.toBeNull();
    const req = http.expectOne(listUrl); expect(req.request.method).toBe('GET'); req.flush([reservation]); fixture.detectChanges();
    expect(app['misReservas']()).toEqual([reservation]); expect(text()).toContain(reservation.reservation_id);
    expect(text()).toContain(reservation.attraction.name); expect(text()).toContain('2 adultos, 1 niños (3 cupos)'); expect(text()).toContain('71,23');
  });
  it('shows an empty state only on successful empty response', () => {
    app['cargarMisReservas'](); http.expectOne(listUrl).flush([]); fixture.detectChanges();
    expect(text()).toContain('Aún no tienes reservas'); expect(text()).not.toContain('No se pudieron cargar');
  });
  it('distinguishes server failure from empty and retries the same endpoint', () => {
    app['cargarMisReservas'](); http.expectOne(listUrl).flush({}, { status: 500, statusText: 'Server error' }); fixture.detectChanges();
    expect(text()).toContain('No se pudieron cargar'); expect(text()).not.toContain('Aún no tienes reservas');
    app['cargarMisReservas'](); http.expectOne(listUrl).flush([reservation]); expect(app['errorReservas']()).toBe('');
  });
  it('401 listing logs out and opens the established login flow', () => {
    app['cargarMisReservas'](); http.expectOne(listUrl).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(TestBed.inject(AuthService).authenticated()).toBe(false); expect(app['loginModalAbierto']()).toBe(true); expect(app['errorReservas']()).toContain('Inicia sesión');
  });
  it('opens detail through its individual GET rather than partial list data', () => {
    load(); [...fixture.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.includes('Ver detalle')).click(); fixture.detectChanges();
    http.expectOne(listUrl + '/' + reservation.reservation_id).flush({ ...reservation, total_price: { currency: 'USD', total: 99 } });
    http.expectOne('/api/v1/atracciones/' + reservation.attraction.id + '/comentarios').flush([]); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-reservation-detail').textContent).toContain('99.00');
  });
  it('cancelled reservations offer detail but cannot start cancellation', () => {
    app['misReservas'].set([{ ...reservation, status: 'CANCELADA' }]); fixture.detectChanges();
    expect(text()).not.toContain('Cancelar reserva'); expect(text()).toContain('Ver detalle');
    app['iniciarCancelacion']({ ...reservation, status: 'CANCELADA' }); expect(app['reservaPorCancelar']()).toBeNull();
  });
  it('successful cancellation applies the server response and then refreshes the list', () => {
    load(); app['iniciarCancelacion'](reservation); app['confirmarCancelacion'](); app['confirmarCancelacion']();
    const req = http.expectOne(cancelUrl); expect(req.request.method).toBe('POST'); expect(req.request.headers.get('X-Idempotency-Key')).toBeTruthy();
    const response = { ...reservation, status: 'CANCELADA', total_price: { currency: 'USD', total: 19.50 } };
    req.flush(response); expect(app['misReservas']()).toEqual([response]); expect(app['reservaPorCancelar']()).toBeNull();
    http.expectOne(listUrl).flush([response]); fixture.detectChanges(); expect(text()).toContain('Cancelada');
  });
  it('network error retries retain the key; closing and starting another intention creates a new key', () => {
    load(); app['iniciarCancelacion'](reservation); app['confirmarCancelacion']();
    const first = http.expectOne(cancelUrl); const key = first.request.headers.get('X-Idempotency-Key'); first.error(new ProgressEvent('error'));
    expect(app['reservaPorCancelar']()).toEqual(reservation); expect(app['errorReservas']()).toBe('');
    app['iniciarCancelacion'](reservation); app['confirmarCancelacion'](); const retry = http.expectOne(cancelUrl);
    expect(retry.request.headers.get('X-Idempotency-Key')).toBe(key); retry.flush({}, { status: 500, statusText: 'Error' });
    app['cerrarCancelacion'](); app['iniciarCancelacion'](reservation); app['confirmarCancelacion']();
    const another = http.expectOne(cancelUrl); expect(another.request.headers.get('X-Idempotency-Key')).not.toBe(key); another.error(new ProgressEvent('error'));
  });
  for (const status of [400, 401, 403, 404, 409, 500]) {
    it('reports cancellation HTTP ' + status + ' without inventing a status transition', () => {
      load(); app['iniciarCancelacion'](reservation); app['confirmarCancelacion']();
      http.expectOne(cancelUrl).flush(status === 409 ? { code: 'IDEMPOTENCY_KEY_REUSED' } : {}, { status, statusText: 'Failure' });
      expect(app['misReservas']()[0].status).toBe('CONFIRMADA'); expect(app['errorCancelacion']()).not.toBe('');
      expect(TestBed.inject(AuthService).authenticated()).toBe(status !== 401);
      if (status === 409) expect(app['errorCancelacion']()).toContain('otra operacion');
    });
  }
  it('shows code text and copy action in confirmation without an external QR image', () => {
    app['reservaConfirmada'].set({ reservation, attraction, customerName: 'Ana', date: reservation.date }); fixture.detectChanges();
    expect(text()).toContain(reservation.reservation_id);
    const urls = [...fixture.nativeElement.querySelectorAll('img')].map((img: any) => img.src);
    expect(urls.every((url: string) => !url.includes(reservation.reservation_id))).toBe(true);
    expect(urls.some((url: string) => url.includes('qrserver'))).toBe(false);
    http.expectNone(req => !req.url.startsWith('/api/v1/'));
  });
});

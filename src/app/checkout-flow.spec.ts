import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, filter } from 'rxjs';
import { App } from './app';
import { API_URL } from './core/api.config';
import { attraction, reservation, selection } from './testing/booking.fixtures';
import { BookingSelection } from './services/booking-navigation.service';

describe('Checkout flow with backend contracts', () => {
  let fixture: ComponentFixture<App>;
  let app: App;
  let http: HttpTestingController;
  const endpoint = '/api/v1/atracciones/' + attraction.id + '/reservations';
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }] });
    fixture = TestBed.createComponent(App); app = fixture.componentInstance; http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(req => req.url === '/api/v1/atracciones').flush({ data: [], meta: { total: 0, page: 1, lastPage: 1 } });
    app['authService'].authenticated.set(true);
  });
  afterEach(() => { fixture.destroy(); http.verify(); localStorage.clear(); });
  async function open(chosen: BookingSelection = selection(), method: 'tarjeta' | 'paypal' = 'tarjeta') {
    app['abrirReserva'](attraction, chosen);
    app['reservaForm'].patchValue({ customer_name: 'Ana Perez', first_name: 'Ana', last_name: 'Perez', customer_email: 'ana@example.com', identity_number: '1710034065', phone: '0991234567', cardholder: 'Ana Perez', card_number: '4242424242424242', card_expiry: '12/99', card_cvc: '123' });
    app['seleccionarMetodoPago'](method);
    if (app['reservaForm'].pending) await firstValueFrom(app['reservaForm'].statusChanges.pipe(filter(status => status !== 'PENDING')));
    expect(app['reservaForm'].valid).toBe(true);
    app['reservaPaso'].set(2); fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(app['reservaForm'].valid).toBe(true);
  }
  function submit(): TestRequest { app['confirmarReserva'](); return http.expectOne(endpoint); }
  function failed(request: TestRequest, code = '', status = 500) { request.flush({ code, message: 'Backend failure' }, { status, statusText: 'Request failed' }); }
  for (const status of [400, 401, 403, 404, 429, 500]) it(`shows HTTP ${status} distinctly without silently generating another checkout intent`, async () => {
    await open(selection(), 'paypal'); const req = submit(); const key = req.request.headers.get('X-Idempotency-Key');
    failed(req, '', status);
    expect(app['errorReserva']()).toContain(`(${status})`);
    expect(app['checkoutKey']).toBe(key); expect(app['reservaEnviando']()).toBe(false);
    if (status === 403) expect(app['authService'].isLoggedIn()).toBe(true);
  });
  it('submits 2 adults and a child age without ticket_count or frontend totals', async () => {
    await open(); const req = submit();
    expect(req.request.body).toEqual({ date: '2099-10-10', time: '11:15', paquete_id: selection().experience.id, num_adultos: 2, ninos: [{ edad: 6 }], customer_name: 'Ana Perez', customer_email: 'ana@example.com', metodo_pago: 'CREDIT_CARD', titular_tarjeta: 'Ana Perez', ultimos_cuatro_digitos: '4242' });
    for (const property of ['ticket_count', 'monto_total', 'total_cupos_ocupados', 'cupos_reservados', 'precio', 'package_id', 'product_type', 'precio_unitario', 'politicas_json', 'min_participantes', 'max_participantes']) expect(req.request.body).not.toHaveProperty(property);
    failed(req);
  });
  it('sends the exact selected UUID for two packages with the same modality', async () => {
    const a = selection(); const b = selection({ experience: { ...a.experience, id: 'second-package-id', precio_unitario: 90, politicas_json: { edad_nino_gratis_hasta: 0 } } });
    await open(a); const first = submit(); const firstKey = first.request.headers.get('X-Idempotency-Key');
    expect(first.request.body.paquete_id).toBe(a.experience.id); failed(first);
    const retry = submit(); expect(retry.request.body.paquete_id).toBe(a.experience.id);
    expect(retry.request.headers.get('X-Idempotency-Key')).toBe(firstKey); failed(retry);
    app['cerrarModal'](); await open(b); const second = submit();
    expect(second.request.body.paquete_id).toBe(b.experience.id);
    expect(second.request.headers.get('X-Idempotency-Key')).not.toBe(firstKey);
    for (const property of ['product_type', 'precio_unitario', 'politicas_json', 'min_participantes', 'max_participantes']) expect(second.request.body).not.toHaveProperty(property);
    failed(second);
  });
  it('never puts full PAN or CVV in requests or persistent storage', async () => {
    await open(); const req = submit();
    expect(JSON.stringify(req.request.body)).not.toContain('4242424242424242');
    expect(JSON.stringify(req.request.body)).not.toContain('123');
    expect(req.request.body).not.toHaveProperty('card_number'); expect(req.request.body).not.toHaveProperty('card_cvc');
    expect(req.request.body).not.toHaveProperty('cvv');
    expect(JSON.stringify(localStorage)).not.toContain('4242424242424242');
    expect(JSON.stringify(sessionStorage)).not.toContain('4242424242424242'); failed(req);
  });
  it('sends PayPal and omits all card-exclusive fields', async () => {
    await open(selection(), 'paypal'); const req = submit();
    expect(req.request.body.metodo_pago).toBe('PAYPAL'); expect(req.request.body).not.toHaveProperty('titular_tarjeta');
    expect(req.request.body).not.toHaveProperty('ultimos_cuatro_digitos'); failed(req);
  });
  it('preserves every individual child age through checkout', async () => {
    await open(selection({ num_adultos: 1, ninos: [{ edad: 0 }, { edad: 8 }, { edad: 17 }] }));
    const req = submit(); expect(req.request.body.num_adultos).toBe(1);
    expect(req.request.body.ninos).toEqual([{ edad: 0 }, { edad: 8 }, { edad: 17 }]); failed(req);
  });
  it('rejects incomplete ages even if an invalid selection reaches checkout', async () => {
    await open(selection({ ninos: [{ edad: undefined as unknown as number }] }));
    app['confirmarReserva'](); http.expectNone(endpoint); expect(app['errorReserva']()).toContain('participantes');
  });
  it('rejects selection counts outside package bounds before POST', async () => {
    for (const chosen of [selection({ num_adultos: 1, ninos: [] }), selection({ num_adultos: 6, ninos: [] })]) {
      await open(chosen); app['confirmarReserva'](); http.expectNone(endpoint); expect(app['errorReserva']()).toContain('participantes');
    }
  });
  it('retries a network failure with the same immutable request and key', async () => {
    await open(); const first = submit(); const key = first.request.headers.get('X-Idempotency-Key'); const body = first.request.body;
    first.error(new ProgressEvent('error'));
    expect(app['checkoutLocked']()).toBe(true);
    app['reservaForm'].controls.customer_name.setValue('Changed locally');
    const retry = submit(); expect(retry.request.headers.get('X-Idempotency-Key')).toBe(key); expect(retry.request.body).toEqual(body);
    failed(retry);
  });
  it('generates another key only when a new checkout starts after success', async () => {
    await open(); const first = submit(); const key = first.request.headers.get('X-Idempotency-Key'); first.flush(reservation);
    await open(); const second = submit(); expect(second.request.headers.get('X-Idempotency-Key')).not.toBe(key); failed(second);
  });
  it('shows the confirmed backend UUID as a local QR while retaining the returned total', async () => {
    await open(selection(), 'paypal');
    const id = 'a1234567-1234-4234-8234-123456789abc';
    const response = { ...reservation, reservation_id: id };
    submit().flush(response); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-reservation-qr svg')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-reservation-qr [data-reservation-code]').textContent).toContain(id);
    expect(app['reservaConfirmada']()?.reservation.total_price).toEqual(response.total_price);
    expect(fixture.nativeElement.textContent).toContain('71,23');
    http.match(req => req.url.includes('/availability')).forEach(req => req.flush({ date: response.date, time: response.time, available_spots: 0, times: [] }));
  });
  it('blocks double clicks while a checkout request is pending', async () => {
    await open(); app['confirmarReserva'](); app['confirmarReserva']();
    const requests = http.match(endpoint); expect(requests.length).toBe(1); failed(requests[0]);
  });
  it('renders the backend final price, participants, payment reference and actual status', async () => {
    await open(); submit().flush({ ...reservation, status: 'PENDIENTE' }); fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('71,23'); expect(text).toContain('Confirmed attraction name'); expect(text).toContain('PENDIENTE');
    expect(text).toContain('2 adultos + 1'); expect(text).toContain('safe-payment-reference'); expect(text).toContain('11:15');
    expect(app['reservaConfirmada']()?.reservation.total_price).toEqual(reservation.total_price);
    expect(app['reservaConfirmada']()?.reservation.status).toBe('PENDIENTE');
  });
  for (const ending of ['close', 'success'] as const) {
    it(`clears temporary payment details on ${ending}`, async () => {
      await open();
      if (ending === 'success') submit().flush(reservation); else app['cerrarModal']();
      for (const field of ['card_number', 'card_cvc', 'card_expiry', 'cardholder'] as const) expect(app['reservaForm'].controls[field].value).toBe('');
      expect(app['atraccionParaReservar']()).toBeNull();
    });
  }
  it('refreshes availability on INSUFFICIENT_AVAILABILITY and never posts a new reservation automatically', async () => {
    await open(); const req = submit(); const key = req.request.headers.get('X-Idempotency-Key'); failed(req, 'INSUFFICIENT_AVAILABILITY', 409);
    expect(app['errorReserva']()).toContain('cupos cambiaron'); expect(app['refreshingCheckoutAvailability']()).toBe(true);
    const refresh = http.expectOne(request => request.url === '/api/v1/atracciones/' + attraction.id + '/availability');
    expect(refresh.request.params.get('date')).toBe('2099-10-10'); expect(refresh.request.params.get('time')).toBe('11:15'); expect(refresh.request.params.get('product_type')).toBe('GUIDED_TOUR');
    refresh.flush({ date: '2099-10-10', time: '11:15', times: ['11:15'], available_spots: 2 });
    app['confirmarReserva'](); http.expectNone(endpoint); expect(app['checkoutBlocked']()).toBe(true); expect(app['checkoutKey']).toBe(key);
  });
  it('can manually retry with the same key after availability is refreshed with enough seats', async () => {
    await open(); const first = submit(); const key = first.request.headers.get('X-Idempotency-Key'); failed(first, 'INSUFFICIENT_AVAILABILITY', 409);
    http.expectOne(request => request.url.endsWith('/availability')).flush({ date: '2099-10-10', time: '11:15', times: ['11:15'], available_spots: 3 });
    const retry = submit(); expect(retry.request.headers.get('X-Idempotency-Key')).toBe(key); failed(retry);
  });
  it('distinguishes idempotency conflicts and blocks automatic retries', async () => {
    await open(); const req = submit(); failed(req, 'IDEMPOTENCY_KEY_REUSED', 409);
    expect(app['errorReserva']()).toContain('otra solicitud'); expect(app['checkoutBlocked']()).toBe(true);
    app['confirmarReserva'](); http.expectNone(endpoint); http.expectNone(request => request.url.endsWith('/availability'));
  });
  it('distinguishes other 409 conflicts without refreshing seats or creating another key', async () => {
    await open(); const req = submit(); const key = req.request.headers.get('X-Idempotency-Key'); failed(req, 'PAYMENT_FAILED', 409);
    expect(app['errorReserva']()).toContain('Conflicto al confirmar'); expect(app['checkoutKey']).toBe(key);
    http.expectNone(request => request.url.endsWith('/availability'));
  });
  it('uses a fresh cancellation key for each intention and the same key for its retry', () => {
    app['iniciarCancelacion'](reservation); app['confirmarCancelacion']();
    const cancelUrl = '/api/v1/atracciones/reservations/' + reservation.reservation_id + '/cancel';
    const first = http.expectOne(cancelUrl); const key = first.request.headers.get('X-Idempotency-Key'); failed(first);
    app['confirmarCancelacion'](); const retry = http.expectOne(cancelUrl); expect(retry.request.headers.get('X-Idempotency-Key')).toBe(key); failed(retry);
    app['cerrarCancelacion'](); app['iniciarCancelacion'](reservation); app['confirmarCancelacion']();
    const newIntention = http.expectOne(cancelUrl); expect(newIntention.request.headers.get('X-Idempotency-Key')).not.toBe(key); failed(newIntention);
  });
});

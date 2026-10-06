import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { AtraccionesService } from './atracciones.service';
import { ReservasService } from './reservas.service';
import { AdminApiService } from '../features/admin/admin-api.service';
import { API_URL } from '../core/api.config';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { ReservationRequest } from '../contracts/atracciones.contracts';
const api = 'http://localhost:3000/api/v1';
const user = { id: 'user-id', name: 'Ana', email: 'ana@example.com' };

describe('Backend API contracts', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), { provide: API_URL, useValue: api }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); localStorage.clear(); });
  it('login uses accessToken/user and logout clears the session', () => {
    const auth = TestBed.inject(AuthService);
    auth.login({ email: user.email, password: 'password' }).subscribe(result => expect(result).toEqual(user));
    const req = http.expectOne(api + '/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: user.email, password: 'password' });
    req.flush({ accessToken: 'jwt', user });
    expect(auth.getToken()).toBe('jwt');
    expect(auth.user()).toEqual(user);
    expect(auth.isLoggedIn()).toBe(true);
    auth.logout();
    expect(auth.getToken()).toBeNull();
    expect(auth.user()).toBeNull();
    expect(auth.isLoggedIn()).toBe(false);
  });
  it('rejects historical token aliases', () => {
    let failed = false;
    TestBed.inject(AuthService).login({ email: user.email, password: 'password' }).subscribe({ error: () => failed = true });
    http.expectOne(api + '/auth/login').flush({ token: 'old', user });
    expect(failed).toBe(true);
    expect(localStorage.getItem('access_token')).toBeNull();
  });
  it('reads only closed backend roles from JWT claims', () => {
    const auth = TestBed.inject(AuthService);
    auth.authenticated.set(true);
    for (const role of ['CLIENTE', 'ADMIN', 'OTHER']) {
      localStorage.setItem('access_token', 'header.' + btoa(JSON.stringify({ sub: user.id, email: user.email, role, type: 'user' })) + '.signature');
      expect(auth.getRole()).toBe(role === 'OTHER' ? null : role);
      expect(auth.isAdmin()).toBe(role === 'ADMIN');
    }
  });
  for (const status of [400, 409]) {
    it(`preserves registration backend errors (${status})`, () => {
      const auth = TestBed.inject(AuthService);
      let message = '';
      auth.register({ name: user.name, email: user.email, password: 'password', cedula_dni: '1710034065' }).subscribe({ error: error => message = auth.getLoginErrorMessage(error) });
      http.expectOne(api + '/auth/register').flush({ message: ['Invalid or duplicate ID'] }, { status, statusText: 'Registration error' });
      expect(message).toBe('Invalid or duplicate ID');
      expect(auth.isLoggedIn()).toBe(false);
    });
  }
  it('register sends cedula_dni and no role', () => {
    const credentials = { name: user.name, email: user.email, password: 'password', cedula_dni: '1710034065' };
    TestBed.inject(AuthService).register(credentials).subscribe();
    const req = http.expectOne(api + '/auth/register');
    expect(req.request.body).toEqual(credentials);
    expect(req.request.body.role).toBeUndefined();
    req.flush({ accessToken: 'jwt', user });
  });
  it('loads real packages including prices and policies without adapting them', () => {
    const packages = [{ id: 'package-id', atraccion_id: 'attraction-id', tipo_experiencia: 'GUIDED_TOUR', nombre_paquete: 'Tour', descripcion: null, precio_unitario: 35.5, moneda: 'USD', min_participantes: 2, max_participantes: null, politicas_json: { ninos: { edad_maxima: 12 } } }];
    TestBed.inject(AtraccionesService).obtenerPaquetes('attraction-id').subscribe(result => expect(result).toEqual(packages));
    http.expectOne(api + '/atracciones/attraction-id/paquetes').flush(packages);
  });
  it('collects the documented paginated catalog', () => {
    TestBed.inject(AtraccionesService).obtenerAtracciones().subscribe(items => expect(items.map(item => item.id)).toEqual(['first', 'second']));
    http.expectOne(req => req.url === api + '/atracciones' && req.params.get('page') === '1').flush({ data: [{ id: 'first' }], meta: { total: 2, page: 1, lastPage: 2 } });
    http.expectOne(req => req.url === api + '/atracciones' && req.params.get('page') === '2').flush({ data: [{ id: 'second' }], meta: { total: 2, page: 2, lastPage: 2 } });
  });
  it('loads a single attraction by ID', () => {
    TestBed.inject(AtraccionesService).obtenerAtraccion('id').subscribe();
    http.expectOne(api + '/atracciones/id').flush({ id: 'id' });
  });
  it('sends optional availability modality and time', () => {
    const response = { date: '2026-10-10', available_spots: 5, times: ['10:00'], product_type: 'PACKAGE', time: '10:00' };
    TestBed.inject(AtraccionesService).obtenerDisponibilidad('id', response.date, 'PACKAGE', '10:00').subscribe(result => expect(result).toEqual(response));
    const req = http.expectOne(request => request.url === api + '/atracciones/id/availability');
    expect(req.request.params.get('date')).toBe(response.date);
    expect(req.request.params.get('product_type')).toBe('PACKAGE');
    expect(req.request.params.get('time')).toBe('10:00');
    req.flush(response);
  });
  it('propagates HTTP errors rather than returning an empty catalog', () => {
    let status = 0;
    TestBed.inject(AtraccionesService).obtenerAtracciones().subscribe({ error: error => status = error.status });
    http.expectOne(request => request.url === api + '/atracciones').flush({ message: 'failure' }, { status: 500, statusText: 'Server Error' });
    expect(status).toBe(500);
  });
  it('preserves adults, child ages, safe payment and caller keys on checkout retries', () => {
    const body: ReservationRequest = { paquete_id: '123e4567-e89b-42d3-a456-426614174009', date: '2026-10-10', time: '10:00', num_adultos: 2, ninos: [{ edad: 0 }, { edad: 8 }], product_type: 'GUIDED_TOUR', customer_name: 'Ana', customer_email: user.email, metodo_pago: 'CREDIT_CARD', titular_tarjeta: 'Ana', ultimos_cuatro_digitos: '4242' };
    const service = TestBed.inject(ReservasService);
    for (const key of ['123e4567-e89b-42d3-a456-426614174000', '123e4567-e89b-42d3-a456-426614174000', '123e4567-e89b-42d3-a456-426614174001']) {
      service.crearReserva('id', body, key).subscribe();
      const req = http.expectOne(api + '/atracciones/id/reservations');
      expect(req.request.headers.get('X-Idempotency-Key')).toBe(key);
      expect(req.request.body).toEqual(body);
      for (const forbidden of ['monto_total', 'total_cupos_ocupados', 'cupos_reservados', 'estado', 'cvv', 'card_number', 'card_cvc']) expect(req.request.body[forbidden]).toBeUndefined();
      req.flush({});
    }
  });
  it('supports PayPal without any card fields', () => {
    const body: ReservationRequest = { paquete_id: '123e4567-e89b-42d3-a456-426614174009', date: '2026-10-10', num_adultos: 1, ninos: [], customer_name: 'Ana', metodo_pago: 'PAYPAL' };
    TestBed.inject(ReservasService).crearReserva('id', body, '123e4567-e89b-42d3-a456-426614174002').subscribe();
    const req = http.expectOne(api + '/atracciones/id/reservations');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });
  it('uses the provided cancellation key on retries', () => {
    const service = TestBed.inject(ReservasService);
    for (let i = 0; i < 2; i++) {
      service.cancelarReserva('id', '123e4567-e89b-42d3-a456-426614174003').subscribe();
      const req = http.expectOne(api + '/atracciones/reservations/id/cancel');
      expect(req.request.headers.get('X-Idempotency-Key')).toBe('123e4567-e89b-42d3-a456-426614174003');
      expect(req.request.body).toEqual({ reason: 'Cancelada por el usuario desde Mis Reservas' });
      req.flush({});
    }
  });
  it('creates, patches and deactivates attractions with the documented admin methods', () => {
    const attractions = TestBed.inject(AtraccionesService);
    attractions.crearAtraccion({ name: 'Tour Cotopaxi', long_description: 'Excursion guiada al volcan.', duration: 'PT8H', product_type: 'GUIDED_TOUR', includes: [], categories: [], locations: [], photos: [], supported_languages: [], free_cancellation: true }).subscribe();
    const created = http.expectOne(api + '/atracciones');
    expect(created.request.method).toBe('POST');
    created.flush({ id: 'id' });
    attractions.editarAtraccion('id', { name: 'Updated' }).subscribe();
    const patched = http.expectOne(api + '/atracciones/id');
    expect(patched.request.method).toBe('PATCH');
    expect(patched.request.body).toEqual({ name: 'Updated' });
    patched.flush({ id: 'id' });
    attractions.desactivarAtraccion('id').subscribe();
    const removed = http.expectOne(api + '/atracciones/id');
    expect(removed.request.method).toBe('DELETE');
    removed.flush(null);
  });
  it('loads every reservation from the admin collection', () => {
    TestBed.inject(AdminApiService).reservas().subscribe();
    const req = http.expectOne(api + '/admin/reservas');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
  it('adds Bearer only to our API origin and path', () => {
    localStorage.setItem('access_token', 'jwt');
    const client = TestBed.inject(HttpClient);
    for (const url of [api + '/atracciones', 'https://external.example/photo', api + '-external/test', 'http://localhost:3000/other', 'http://localhost.evil.example:3000/api/v1/test']) {
      client.get(url).subscribe();
      const req = http.expectOne(url);
      expect(req.request.headers.get('Authorization')).toBe(url === api + '/atracciones' ? 'Bearer jwt' : null);
      req.flush({});
    }
  });
});

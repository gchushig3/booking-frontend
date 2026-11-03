import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { AtraccionesService } from './atracciones.service';
import { CATALOG_API_URL, IDENTITY_API_URL } from '../core/api.config';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { Atraccion, CreateAttractionRequest } from '../contracts/atracciones.contracts';

const api = 'http://localhost:3011/api/v2';
const catalog = 'http://localhost:3014/api/v2';
const user = {
  id: 'user-id', email: 'ana@example.com', first_name: 'Ana', last_name: 'Prueba',
  verified: true, active: true, roles: ['CLIENTE'],
};
const tokenPair = {
  access_token: 'jwt',
  refresh_token: 'refresh',
  token_type: 'Bearer' as const,
  expires_in: 900,
  refresh_expires_at: '2026-11-07T12:00:00.000Z',
};
const bookingCard = {
  id: 'attraction-id',
  name: 'Tour Quito',
  short_description: 'Centro histórico',
  city: 'Quito',
  duration: '2 horas',
  duration_hours: 2,
  price: { currency: 'USD', adult: 35, child: 18, senior: 25, infant: 0 },
  rating: { score: 4.8, review_count: 21 },
  inclusions: { includes_food: true, includes_transport: false, includes_guide: true },
  free_cancellation: true,
  free_cancellation_hours: 24,
  photos: ['https://example.com/quito.jpg'],
};
const page = (data: unknown[], current = 1, total = data.length, totalPages = 1) => ({
  data,
  metadata: { total_results: total, page: current, limit: 50, total_pages: totalPages },
});

describe('Backend API contracts', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: IDENTITY_API_URL, useValue: api },
        { provide: CATALOG_API_URL, useValue: catalog },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); localStorage.clear(); });

  it('logs in with the Identity token pair and fetches the authenticated profile', () => {
    const auth = TestBed.inject(AuthService);
    let result: unknown;
    auth.login({ email: user.email, password: 'password' }).subscribe(value => result = value);
    const req = http.expectOne(api + '/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: user.email, password: 'password' });
    req.flush(tokenPair);
    const profile = http.expectOne(api + '/auth/me');
    expect(profile.request.method).toBe('GET');
    expect(profile.request.headers.get('Authorization')).toBe('Bearer jwt');
    profile.flush({ user, session_id: 'session-id' });
    expect(auth.getToken()).toBe('jwt');
    expect(auth.user()).toEqual({
      id: user.id, email: user.email, name: 'Ana Prueba', roles: ['CLIENTE'], verified: true,
    });
    expect(auth.isLoggedIn()).toBe(true);
    expect(result).toEqual(auth.user());
    auth.logout().subscribe();
    const logout = http.expectOne(api + '/auth/logout');
    expect(logout.request.method).toBe('POST');
    expect(logout.request.headers.get('Authorization')).toBe('Bearer jwt');
    logout.flush(null);
    expect(auth.getToken()).toBeNull();
    expect(auth.user()).toBeNull();
  });

  it('registers first and last name without inventing a session', () => {
    const credentials = { first_name: 'Ana', last_name: 'Prueba', email: user.email, password: 'Una-clave-local-segura-42!' };
    let result: unknown;
    TestBed.inject(AuthService).register(credentials).subscribe(value => result = value);
    const req = http.expectOne(api + '/auth/register');
    expect(req.request.body).toEqual(credentials);
    expect(req.request.body.role).toBeUndefined();
    req.flush({ user, verification_email_sent: true });
    expect(result).toEqual({ user, verification_email_sent: true });
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(http.match(api + '/auth/me')).toHaveLength(0);
  });

  it('searches and collects all catalog pages using the Booking search contract', () => {
    const items: Atraccion[] = [];
    TestBed.inject(AtraccionesService).obtenerAtracciones().subscribe(result => items.push(...result));
    const first = http.expectOne(catalog + '/atracciones/search');
    expect(first.request.method).toBe('POST');
    expect(first.request.body).toEqual({ page: 1, limit: 50, sort: 'POPULARITY' });
    first.flush(page([bookingCard], 1, 51, 2));
    const second = http.expectOne(catalog + '/atracciones/search');
    expect(second.request.body.page).toBe(2);
    second.flush(page([{ ...bookingCard, id: 'second' }], 2, 51, 2));
    expect(items.map(item => item.id)).toEqual(['attraction-id', 'second']);
    expect(items[0].bookingPrice).toEqual(bookingCard.price);
    expect(items[0].price.total).toBe(35);
    expect(items[0].photos).toEqual([{ url: 'https://example.com/quito.jpg' }]);
  });

  it('sends date and adult count to the backend inventory-backed search', () => {
    TestBed.inject(AtraccionesService).buscarDisponibles({
      city: 'Quito', fecha_inicio: '2026-10-30', adult_count: 2, page: 1, limit: 10,
    }).subscribe(result => expect(result.data[0]?.city).toBe('Quito'));
    const req = http.expectOne(catalog + '/atracciones/search');
    expect(req.request.body).toEqual({
      city: 'Quito', fecha_inicio: '2026-10-30', adult_count: 2, page: 1, limit: 10,
    });
    req.flush(page([bookingCard]));
  });

  it('loads Booking detail and adapts the backend response for the view', () => {
    TestBed.inject(AtraccionesService).obtenerAtraccion('attraction-id').subscribe(item => {
      expect(item.long_description).toBe('Tour completo');
      expect(item.bookingPrice?.adult).toBe(35);
      expect(item.itinerary?.[0]?.title).toBe('Plaza Grande');
      expect(item.meetingPoint?.latitude).toBe(-0.22);
    });
    http.expectOne(catalog + '/atracciones/attraction-id').flush({
      ...bookingCard,
      description: 'Tour completo',
      itinerary: [{ stop_number: 1, time: '09:00', title: 'Plaza Grande', duration_minutes: 30 }],
      meeting_point_geo: { address: 'Centro', city: 'Quito', latitude: -0.22, longitude: -78.5 },
      rating: { ...bookingCard.rating, breakdown: { servicio: 4.5 } },
    });
  });

  it('creates an attraction with the Catalog DTO and updates status through its endpoint', () => {
    const body: CreateAttractionRequest = {
      name: 'Tour Cotopaxi',
      description: 'Excursión guiada al volcán.',
      type: 'GUIDED_TOUR',
      latitude: -0.68,
      longitude: -78.43,
      duration_hours: 8,
      city_id: 1,
      operator_id: '1',
      currency: 'USD',
    };
    const service = TestBed.inject(AtraccionesService);
    service.crearAtraccion(body).subscribe(item => expect(item.status).toBe('BORRADOR'));
    const created = http.expectOne(catalog + '/atracciones');
    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual(body);
    created.flush({ id: 'attraction-id', name: body.name, description: body.description, status: 'BORRADOR' });

    service.actualizarEstado('attraction-id', 'PUBLICADA').subscribe();
    const status = http.expectOne(catalog + '/atracciones/attraction-id/estado');
    expect(status.request.method).toBe('PATCH');
    expect(status.request.body).toEqual({ status: 'PUBLICADA' });
    status.flush({ id: 'attraction-id', name: body.name, status: 'PUBLICADA' });
  });

  it('saves the Booking profile to the current integration endpoint', () => {
    const profile = {
      city: 'Quito',
      price: { currency: 'USD', adult: 35, child: 18, senior: 25, infant: 0 },
      inclusions: { includes_food: false, includes_transport: true, includes_guide: true },
      itinerary: [],
      ratings_breakdown: { limpieza: 4, servicio: 5, calidad_precio: 4, puntualidad: 5 },
      schedule_times: ['09:00:00'],
    };
    TestBed.inject(AtraccionesService).guardarPerfilBooking('attraction-id', profile).subscribe();
    const req = http.expectOne(catalog + '/atracciones/attraction-id/booking');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(profile);
    req.flush({ id: 'attraction-id', ...profile });
  });

  it('propagates backend errors rather than returning an empty catalog', () => {
    let status = 0;
    TestBed.inject(AtraccionesService).buscarDisponibles({ page: 1, limit: 10 }).subscribe({
      error: error => status = error.status,
    });
    http.expectOne(catalog + '/atracciones/search')
      .flush({ message: 'failure' }, { status: 503, statusText: 'Unavailable' });
    expect(status).toBe(503);
  });

  it('attaches authentication to both configured APIs but not unrelated origins', () => {
    localStorage.setItem('access_token', 'jwt');
    const client = TestBed.inject(HttpClient);
    for (const url of [api + '/auth/login', catalog + '/atracciones', 'https://external.example/photo']) {
      client.get(url).subscribe();
      const req = http.expectOne(url);
      expect(req.request.headers.get('Authorization')).toBe(url === 'https://external.example/photo' ? null : 'Bearer jwt');
      req.flush({});
    }
  });
});

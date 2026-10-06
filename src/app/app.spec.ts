import { firstValueFrom, filter } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Atraccion } from './contracts/atracciones.contracts';
import { App } from './app';
import { API_URL } from './core/api.config';
import { validateEcuadorianId } from './utils/async-validators';

describe('App contract integration', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }] }).compileComponents();
  });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); localStorage.clear(); });
  it('creates the app with routing and renders the current navigation', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(request => request.url === '/api/v1/atracciones').flush({ data: [], meta: { total: 0, page: 1, lastPage: 1 } });
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Iniciar sesi\u00f3n');
  });
  it('does not download the catalog when the app starts on an attraction detail URL', () => {
    const initialUrl = location.href;
    try {
      history.replaceState({}, '', '/actividades/attraction-id');
      const fixture = TestBed.createComponent(App); fixture.detectChanges();
      TestBed.inject(HttpTestingController).expectNone(request => request.url === '/api/v1/atracciones');
      fixture.destroy();
    } finally { history.replaceState({}, '', initialUrl); }
  });
  it('register form validates and submits cedula_dni with backend limits', async () => {
    const app = TestBed.createComponent(App).componentInstance;
    const form = app['registerForm'];
    form.setValue({ name: 'Ana', email: 'ana@example.com', password: 'password', cedula_dni: '1710034065' });
    await firstValueFrom(form.statusChanges.pipe(filter(status => status !== 'PENDING')));
    expect(form.valid).toBe(true);
    app['registrarse']();
    const req = TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/register');
    expect(req.request.body).toEqual(form.getRawValue());
    req.flush({ accessToken: 'jwt', user: { id: 'id', name: 'Ana', email: 'ana@example.com' } });
    form.controls.name.setValue('x'.repeat(121));
    expect(form.controls.name.invalid).toBe(true);
    form.controls.password.setValue('x'.repeat(73));
    expect(form.controls.password.invalid).toBe(true);
    form.controls.email.setValue('a'.repeat(250) + '@example.com');
    expect(form.controls.email.invalid).toBe(true);
  });
  it('maps the existing checkout to safe fields and retains its key on retry', async () => {
    const app = TestBed.createComponent(App).componentInstance;
    app['authService'].authenticated.set(true);
    const attraction: Atraccion = {
      id: 'id', name: 'Tour', provincia: 'Pichincha', region: 'Sierra', categoria: 'Tours', precioBase: 20,
      cuposTotales: 10, horariosDisponibles: ['10:00'], tipoExperienciaPermitidos: ['SINGLE_TICKET'],
      long_description: 'Tour', duration: 'PT2H', price: { currency: 'USD', total: 20 },
      operator: { id: 1, name: 'Operator' }, product_type: 'SINGLE_TICKET', includes: [], categories: [],
      badges: [], locations: [], photos: [], supported_languages: [], free_cancellation: false,
    };
    const selection = { experience: { id: 'pkg', atraccion_id: 'id', tipo_experiencia: 'SINGLE_TICKET' as const, nombre_paquete: 'Tour real', descripcion: null, precio_unitario: 20, moneda: 'USD', min_participantes: 1, max_participantes: null, politicas_json: {} }, product_type: 'SINGLE_TICKET' as const, date: '2099-10-10', time: '10:00', num_adultos: 2, ninos: [] };
    app['abrirReserva'](attraction, selection);
    const form = app['reservaForm'];
    form.patchValue({ customer_name: 'Ana Perez', first_name: 'Ana', last_name: 'Perez', customer_email: 'ana@example.com', identity_number: '1710034065', phone: '0991234567', cardholder: 'Ana Perez', card_number: '4242424242424242', card_expiry: '12/99', card_cvc: '123', date: '2099-10-10' });
    await firstValueFrom(form.statusChanges.pipe(filter(status => status !== 'PENDING')));
    expect(form.valid).toBe(true);
    app['confirmarReserva']();
    const http = TestBed.inject(HttpTestingController);
    const first = http.expectOne('/api/v1/atracciones/id/reservations');
    expect(first.request.body).toEqual({ date: '2099-10-10', time: '10:00', paquete_id: selection.experience.id, num_adultos: 2, ninos: [], metodo_pago: 'CREDIT_CARD', titular_tarjeta: 'Ana Perez', ultimos_cuatro_digitos: '4242', customer_name: 'Ana Perez', customer_email: 'ana@example.com' });
    const key = first.request.headers.get('X-Idempotency-Key');
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    first.flush({ message: 'Retry later' }, { status: 500, statusText: 'Server Error' });
    app['confirmarReserva']();
    const retry = http.expectOne('/api/v1/atracciones/id/reservations');
    expect(retry.request.headers.get('X-Idempotency-Key')).toBe(key);
    retry.flush({ message: 'Retry later' }, { status: 500, statusText: 'Server Error' });
    app['cerrarModal']();
    app['abrirReserva'](attraction, selection);
    form.patchValue({ customer_name: 'Ana Perez', first_name: 'Ana', last_name: 'Perez', customer_email: 'ana@example.com', identity_number: '1710034065', phone: '0991234567', cardholder: 'Ana Perez', card_number: '4242424242424242', card_expiry: '12/99', card_cvc: '123' });
    await firstValueFrom(form.statusChanges.pipe(filter(status => status !== 'PENDING')));
    app['confirmarReserva']();
    const changed = http.expectOne('/api/v1/atracciones/id/reservations');
    expect(changed.request.headers.get('X-Idempotency-Key')).not.toBe(key);
    changed.flush({ message: 'Retry later' }, { status: 500, statusText: 'Server Error' });
    app['cerrarModal']();
    expect(form.controls.card_number.value).toBe('');
    expect(form.controls.card_cvc.value).toBe('');
    expect(JSON.stringify(localStorage)).not.toContain('4242424242424242');
  });
  it('uses the same Ecuadorian ID rules as backend (provinces 01 through 24)', async () => {
    expect((await validateEcuadorianId('1710034065')).valid).toBe(true);
    expect((await validateEcuadorianId('3010034060')).valid).toBe(false);
    expect((await validateEcuadorianId('1710034064')).valid).toBe(false);
  });
});

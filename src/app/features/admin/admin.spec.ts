import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { API_URL } from '../../core/api.config';
import { AuthService } from '../../services/auth.service';
import { attraction, reservation } from '../../testing/booking.fixtures';
import { AdminAttractions } from './admin-attractions';
import { AdminReservations } from './admin-reservations';
import { AttractionForm } from './attraction-form';
import { BookingSettings } from './booking-settings';
import { CreateAttractionRequest } from '../../contracts/admin.contracts';

const api = '/api/v1';
const internal = ['id', 'provincia', 'region', 'categoria', 'precioBase', 'cuposTotales', 'horariosDisponibles', 'tipoExperienciaPermitidos', 'ratings', 'url', '_links', 'deletedAt', 'estaActivo', 'userId', 'password', 'cvv', 'pan', 'card_number', 'monto_total', 'cupos_reservados', 'priceEnabled'];
function jwt(role: 'CLIENTE' | 'ADMIN') {
  return 'h.' + btoa(JSON.stringify({ sub: 'id', email: 'ana@example.com', role, type: 'user' })) + '.s';
}
function session(role: 'CLIENTE' | 'ADMIN') {
  localStorage.setItem('access_token', jwt(role));
  localStorage.setItem('auth_user', JSON.stringify({ id: 'id', name: 'Ana', email: 'ana@example.com' }));
  const auth = TestBed.inject(AuthService);
  auth.authenticated.set(true);
  auth.user.set({ id: 'id', name: 'Ana', email: 'ana@example.com' });
}
function dto(): CreateAttractionRequest {
  return {
    name: 'Tour Cotopaxi', long_description: 'Excursion guiada al volcan.', duration: 'PT8H', product_type: 'GUIDED_TOUR',
    includes: ['Transporte'], categories: ['tour_guiado'], supported_languages: ['es'], free_cancellation: true,
    photos: [{ url: 'https://example.com/photo.jpg' }],
    locations: [{ address: 'Cotopaxi', city: 1, country: 'ec', coordinates: { latitude: -0.68, longitude: -78.43 }, type: 'attraction' }],
    price: { currency: 'USD', total: 45 },
  };
}
function fill(form: AttractionForm, extra: Partial<{ name: string }> = {}) {
  const body = dto();
  form.form.patchValue({
    name: extra.name ?? body.name, long_description: body.long_description, duration: body.duration, product_type: body.product_type,
    includes: body.includes.join('\n'), categories: body.categories.join('\n'), supported_languages: body.supported_languages.join('\n'),
    photos: body.photos.map(photo => photo.url).join('\n'), free_cancellation: body.free_cancellation, priceEnabled: true, currency: 'USD', total: 45,
  });
  if (!form.form.controls.locations.length) form.addLocation();
  form.form.controls.locations.at(0).patchValue({ address: 'Cotopaxi', city: 1, country: 'ec', latitude: -0.68, longitude: -78.43, type: 'attraction' });
}

describe('Admin panel of attractions', () => {
  afterEach(() => localStorage.clear());

  describe('route guard', () => {
    beforeEach(async () => {
      localStorage.clear();
      await TestBed.configureTestingModule({
        providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: api }],
      }).compileComponents();
    });
    it('does not let a CLIENTE open an ADMIN route', async () => {
      session('CLIENTE');
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/admin');
      harness.detectChanges();
      expect(TestBed.inject(Router).url).toContain('/acceso-denegado');
      expect(TestBed.inject(Router).url).toContain('motivo=403');
      expect(TestBed.inject(AuthService).isLoggedIn()).toBe(true);
      TestBed.inject(HttpTestingController).expectNone(req => req.url.includes('/admin/reservas') || req.method === 'POST');
    });
    it('lets an ADMIN open the attractions panel', async () => {
      session('ADMIN');
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/admin');
      harness.detectChanges();
      expect(TestBed.inject(Router).url).toContain('/admin/atracciones');
      const req = TestBed.inject(HttpTestingController).expectOne(request => request.url === api + '/atracciones');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('1');
      req.flush({ data: [], meta: { total: 0, page: 1, lastPage: 1 } });
    });
  });

  describe('attractions list and mutations', () => {
    let fixture: ComponentFixture<AdminAttractions>;
    let component: AdminAttractions;
    let http: HttpTestingController;
    beforeEach(async () => {
      localStorage.clear();
      await TestBed.configureTestingModule({
        imports: [AdminAttractions],
        providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: api }],
      }).compileComponents();
      session('ADMIN');
      fixture = TestBed.createComponent(AdminAttractions);
      component = fixture.componentInstance;
      http = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
    });
    afterEach(() => http.verify());
    function list(data = [attraction], meta = { total: data.length, page: 1, lastPage: 1 }) {
      const req = http.expectOne(request => request.url === api + '/atracciones' && request.method === 'GET');
      expect(req.request.params.get('limit')).toBe('10');
      req.flush({ data, meta });
      fixture.detectChanges();
      return req;
    }
    it('lists attractions from the real paginated API', () => {
      expect(fixture.nativeElement.textContent).toContain('Cargando atracciones');
      list();
      expect(fixture.nativeElement.textContent).toContain(attraction.name);
      expect(fixture.nativeElement.textContent).toContain(attraction.provincia);
      expect(http.match(() => true).length).toBe(0);
    });
    it('shows an empty state only after a successful empty page', () => {
      list([], { total: 0, page: 1, lastPage: 1 });
      expect(fixture.nativeElement.textContent).toContain('No hay atracciones');
      expect(fixture.nativeElement.textContent).not.toContain('No se pudo');
    });
    it('shows an error distinct from empty and retries the same list endpoint', () => {
      http.expectOne(request => request.url === api + '/atracciones').flush({}, { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('No hay atracciones');
      expect(component.error()).toBeTruthy();
      component.load();
      list();
      expect(component.error()).toBe('');
      expect(component.rows().length).toBe(1);
    });
    it('creates with the Swagger DTO and refreshes the list from the server', () => {
      list();
      component.startCreate();
      fixture.detectChanges();
      const form = fixture.debugElement.query(By.directive(AttractionForm)).componentInstance as AttractionForm;
      fill(form);
      form.submit();
      form.submit();
      const created = http.expectOne(request => request.url === api + '/atracciones' && request.method === 'POST');
      expect(created.request.body).toEqual(dto());
      for (const key of internal) expect(created.request.body[key]).toBeUndefined();
      created.flush({ ...attraction, name: dto().name });
      const refresh = http.expectOne(request => request.url === api + '/atracciones' && request.method === 'GET');
      expect(refresh.request.params.get('page')).toBe('1');
      refresh.flush({ data: [{ ...attraction, name: dto().name }], meta: { total: 1, page: 1, lastPage: 1 } });
      fixture.detectChanges();
      http.expectOne(api + '/atracciones/' + attraction.id + '/paquetes').flush([]);
      expect(fixture.nativeElement.textContent).toContain('Atracción creada');
      expect(fixture.nativeElement.textContent).toContain('Tour Cotopaxi');
    });
    it('PATCHes only modified DTO fields and never uses PUT', () => {
      list();
      component.startEdit(attraction);
      fixture.detectChanges();
      const form = fixture.debugElement.query(By.directive(AttractionForm)).componentInstance as AttractionForm;
      form.form.controls.name.setValue('Nombre actualizado');
      form.submit();
      const req = http.expectOne(api + '/atracciones/' + attraction.id);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Nombre actualizado' });
      for (const key of internal) expect(req.request.body[key]).toBeUndefined();
      req.flush({ ...attraction, name: 'Nombre actualizado' });
      http.expectOne(request => request.url === api + '/atracciones').flush({ data: [{ ...attraction, name: 'Nombre actualizado' }], meta: { total: 1, page: 1, lastPage: 1 } });
      http.expectNone(request => request.method === 'PUT');
    });
    it('edits an attraction whose omitted optional price was normalized to zero by the API', () => {
      const zeroPrice = { ...attraction, price: { currency: 'USD', total: 0 } };
      list([zeroPrice]); component.startEdit(zeroPrice); fixture.detectChanges();
      const form = fixture.debugElement.query(By.directive(AttractionForm)).componentInstance as AttractionForm;
      form.form.controls.name.setValue('Edited without changing price'); form.submit();
      const req = http.expectOne(api + '/atracciones/' + attraction.id);
      expect(req.request.method).toBe('PATCH'); expect(req.request.body).toEqual({ name: 'Edited without changing price' });
      req.flush({ ...zeroPrice, name: 'Edited without changing price' });
      http.expectOne(request => request.url === api + '/atracciones').flush({ data: [zeroPrice], meta: { total: 1, page: 1, lastPage: 1 } });
    });
    it('still rejects changing an existing positive price to zero', () => {
      list(); component.startEdit(attraction); fixture.detectChanges();
      const form = fixture.debugElement.query(By.directive(AttractionForm)).componentInstance as AttractionForm;
      form.form.controls.total.setValue(0); form.submit();
      expect(form.error()).toBeTruthy(); http.expectNone(request => request.method === 'PATCH');
    });
    it('does not submit invalid creation data', () => {
      list(); component.startCreate(); fixture.detectChanges();
      const form = fixture.debugElement.query(By.directive(AttractionForm)).componentInstance as AttractionForm;
      form.submit();
      expect(form.error()).toBeTruthy();
      http.expectNone(request => request.method === 'POST');
    });
    it('does not send undefined when the optional price is removed', () => {
      list(); component.startEdit(attraction); fixture.detectChanges();
      const form = fixture.debugElement.query(By.directive(AttractionForm)).componentInstance as AttractionForm;
      form.form.controls.priceEnabled.setValue(false);
      form.form.controls.name.setValue('Otro nombre');
      expect(Object.values(form.patchPayload()).every(value => value !== undefined)).toBe(true);
      form.submit();
      expect(form.error()).toContain('no permite borrar');
      http.expectNone(request => request.method === 'PATCH');
    });
    it('searches the catalog by name and resets pagination', () => {
      list();
      component.page.set(3);
      component.searchText.set('  Cotopaxi  ');
      component.search();
      const req = http.expectOne(request => request.url === api + '/atracciones');
      expect(req.request.params.get('q')).toBe('Cotopaxi');
      expect(req.request.params.get('page')).toBe('1');
      req.flush({ data: [attraction], meta: { total: 1, page: 1, lastPage: 1 } });
      expect(component.total()).toBe(1);
    });

    it('fetches only the requested page', () => {
      list([attraction], { total: 20, page: 1, lastPage: 2 });
      component.goTo(2);
      const req = http.expectOne(request => request.url === api + '/atracciones');
      expect(req.request.params.get('page')).toBe('2');
      req.flush({ data: [attraction], meta: { total: 20, page: 2, lastPage: 2 } });
    });
    it('reads packages without mutation endpoints', () => {
      list(); component.openAvailability(attraction); fixture.detectChanges();
      const req = http.expectOne(api + '/atracciones/' + attraction.id + '/paquetes');
      expect(req.request.method).toBe('GET'); req.flush([]);
      expect((fixture.debugElement.query(By.directive(BookingSettings)).componentInstance as BookingSettings).packagesLoading()).toBe(false);
    });
    it('cancels deactivation using Escape without sending DELETE', () => {
      list(); component.askDeactivate(attraction); fixture.detectChanges();
      fixture.nativeElement.querySelector('[role="alertdialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(component.pendingDeactivate()).toBeNull();
      http.expectNone(request => request.method === 'DELETE');
    });
    it('asks for confirmation before deactivating and then uses DELETE', () => {
      list();
      const deactivate = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent?.includes('Desactivar atracción'));
      deactivate.click();
      fixture.detectChanges();
      http.expectNone(request => request.method === 'DELETE');
      expect(fixture.nativeElement.textContent).toContain('¿Desactivar esta atracción?');
      [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent?.includes('Sí, desactivar')).click();
      const req = http.expectOne(api + '/atracciones/' + attraction.id);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      http.expectOne(request => request.url === api + '/atracciones').flush({ data: [], meta: { total: 0, page: 1, lastPage: 1 } });
    });
  });

  describe('admin reservations', () => {
    let fixture: ComponentFixture<AdminReservations>;
    let http: HttpTestingController;
    beforeEach(async () => {
      localStorage.clear();
      await TestBed.configureTestingModule({
        imports: [AdminReservations],
        providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: api }],
      }).compileComponents();
      session('ADMIN');
      fixture = TestBed.createComponent(AdminReservations);
      http = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
    });
    afterEach(() => http.verify());
    it('lists reservations from /admin/reservas with closed statuses', () => {
      const req = http.expectOne(api + '/admin/reservas');
      expect(req.request.method).toBe('GET');
      req.flush([reservation, { ...reservation, reservation_id: 'pending-id', status: 'PENDIENTE' }, { ...reservation, reservation_id: 'cancelled-id', status: 'CANCELADA' }]);
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('(CONFIRMADA)');
      expect(text).toContain('(PENDIENTE)');
      expect(text).toContain('(CANCELADA)');
      expect(text).toContain(reservation.attraction.name);
      expect(text).not.toContain('4242');
      expect(text).not.toContain('password');
    });
    it('does not expose controls to change totals, slots, payment or status', () => {
      http.expectOne(api + '/admin/reservas').flush([reservation]);
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent as string;
      expect(text).not.toContain('Confirmar reserva');
      expect(text).not.toContain('Cambiar estado');
      expect(text).not.toContain('Modificar total');
      expect(text).not.toContain('Modificar pago');
      expect(text).not.toContain('Editar participantes');
      expect(fixture.nativeElement.querySelector('input, select, textarea, form')).toBeNull();
    });
    it('keeps the session on 403', () => {
      http.expectOne(api + '/admin/reservas').flush({}, { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();
      expect(TestBed.inject(AuthService).isLoggedIn()).toBe(true);
      expect(TestBed.inject(AuthService).getToken()).toBe(jwt('ADMIN'));
      expect(fixture.nativeElement.textContent).toContain('permisos ADMIN');
    });
    it('invalidates the session on 401 and offers authentication feedback', () => {
      http.expectOne(api + '/admin/reservas').flush({}, { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();
      expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
      expect(TestBed.inject(AuthService).getToken()).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Sesión no válida');
    });
  });
});

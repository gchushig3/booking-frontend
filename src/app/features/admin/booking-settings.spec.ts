import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../../core/api.config';
import { attraction } from '../../testing/booking.fixtures';
import { BookingSettings } from './booking-settings';

describe('Administrator booking settings', () => {
  let component: BookingSettings;
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingSettings],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }],
    }).compileComponents();
    const fixture = TestBed.createComponent(BookingSettings);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('attraction', attraction);
    fixture.detectChanges();
    http.expectOne(`/api/v1/atracciones/${attraction.id}/paquetes`).flush([]);
  });
  afterEach(() => http.verify());
  it('creates a reservable experience with its price and limits', () => {
    component.experience.setValue({ nombre_paquete: 'Tour guiado', tipo_experiencia: 'GUIDED_TOUR', precio_unitario: 25, min_participantes: 1, max_participantes: 10 });
    component.saveExperience();
    const req = http.expectOne(`/api/v1/atracciones/${attraction.id}/paquetes`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.precio_unitario).toBe(25);
    req.flush({ id: 'package-id' });
    http.expectOne(`/api/v1/atracciones/${attraction.id}/paquetes`).flush([]);
    expect(component.message()).toContain('Experiencia guardada');
  });
  it('saves a closed turn with zero capacity and checks its availability', () => {
    component.slot.setValue({ date: '2026-10-10', time: '11:00', capacidad_total: 0 });
    component.saveSlot();
    const req = http.expectOne(`/api/v1/atracciones/${attraction.id}/availability`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.capacidad_total).toBe(0);
    req.flush({});
    http.expectOne(request => request.method === 'GET' && request.params.get('time') === '11:00').flush({ available_spots: 0 });
    expect(component.availability()).toContain('0 cupos');
  });
  it('rejects inconsistent participant limits without sending a request', () => {
    component.experience.patchValue({ nombre_paquete: 'Tour', min_participantes: 10, max_participantes: 2 });
    component.saveExperience();
    expect(component.error()).toBeTruthy();
    http.expectNone(request => request.method === 'POST');
  });
  it('preserves packages with unlimited participants when editing', () => {
    component.edit({ id: 'pkg', atraccion_id: attraction.id, tipo_experiencia: 'GUIDED_TOUR', nombre_paquete: 'Tour', descripcion: null, precio_unitario: 25, moneda: 'USD', min_participantes: 1, max_participantes: null, politicas_json: {} });
    component.saveExperience();
    const req = http.expectOne(`/api/v1/atracciones/${attraction.id}/paquetes/pkg`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.max_participantes).toBeNull();
    req.flush({ id: 'pkg' });
    http.expectOne(`/api/v1/atracciones/${attraction.id}/paquetes`).flush([]);
  });
});

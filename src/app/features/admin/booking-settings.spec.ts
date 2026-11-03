import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL, CATALOG_API_URL } from '../../core/api.config';
import { attraction } from '../../testing/booking.fixtures';
import { BookingSettings } from './booking-settings';

describe('Booking integration profile', () => {
  let fixture: ComponentFixture<BookingSettings>;
  let component: BookingSettings;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BookingSettings],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: API_URL, useValue: '/api/v1' },
        { provide: CATALOG_API_URL, useValue: '/api/v2' },
      ],
    });
    fixture = TestBed.createComponent(BookingSettings);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('attraction', attraction);
    fixture.detectChanges();
    http.expectOne('/api/v2/atracciones/' + attraction.id)
      .flush({ message: 'Draft attraction has no public detail' }, { status: 404, statusText: 'Not Found' });
  });
  afterEach(() => { fixture.destroy(); http.verify(); });

  it('saves the booking profile through the PUT endpoint and then publishes', () => {
    component.form.patchValue({
      city: 'Quito',
      currency: 'USD',
      adult: 35,
      child: 18,
      senior: 25,
      infant: 0,
      schedule_times: '09:00\n13:30',
      itinerary_json: JSON.stringify([{ stop_number: 1, time: '09:00', title: 'Plaza Grande', duration_minutes: 30 }]),
      ratings_json: '{"servicio":4.5}',
    });
    component.save();
    const request = http.expectOne('/api/v2/atracciones/' + attraction.id + '/booking');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      city: 'Quito',
      price: { currency: 'USD', adult: 35, child: 18, senior: 25, infant: 0 },
      inclusions: { includes_food: false, includes_transport: false, includes_guide: false },
      itinerary: [{ stop_number: 1, time: '09:00', title: 'Plaza Grande', duration_minutes: 30 }],
      ratings_breakdown: { servicio: 4.5 },
      accessibility: { wheelchair_accessible: false, service_animals_allowed: false },
      permite_paquete: false,
      schedule_times: ['09:00:00', '13:30:00'],
    });
    request.flush({ id: attraction.id });
    expect(component.profileSaved()).toBe(true);

    component.publish();
    const publish = http.expectOne('/api/v2/atracciones/' + attraction.id + '/estado');
    expect(publish.request.method).toBe('PATCH');
    expect(publish.request.body).toEqual({ status: 'PUBLICADA' });
    publish.flush({ id: attraction.id, status: 'PUBLICADA' });
    expect(component.isPublished()).toBe(true);
  });

  it('rejects malformed JSON and invalid horarios without calling the API', () => {
    component.form.patchValue({ city: 'Quito', itinerary_json: '{', schedule_times: '9:00' });
    component.save();
    expect(component.error()).toContain('JSON válido');
    http.expectNone(request => request.method === 'PUT');
  });

  it('blocks editing a published profile when the detail omits its saved schedule', () => {
    fixture.componentRef.setInput('attraction', { ...attraction, status: 'PUBLICADA' });
    fixture.detectChanges();
    http.expectOne('/api/v2/atracciones/' + attraction.id)
      .flush({ id: attraction.id, name: attraction.name, city: 'Quito', price: { currency: 'USD', adult: 35, child: 18, senior: 25, infant: 0 } });
    expect(component.allowProfileSave()).toBe(false);
    component.save();
    http.expectNone(request => request.method === 'PUT');
  });
});

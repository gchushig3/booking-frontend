import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL, CATALOG_API_URL } from '../../core/api.config';
import { AttractionForm } from './attraction-form';

describe('Catalog attraction form', () => {
  let form: AttractionForm;
  let http: HttpTestingController;
  let fixture: ComponentFixture<AttractionForm>;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AttractionForm],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: API_URL, useValue: '/api/v1' },
        { provide: CATALOG_API_URL, useValue: '/api/v2' },
      ],
    });
    fixture = TestBed.createComponent(AttractionForm);
    form = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });

  it('requires valid Catalog fields before creating an attraction', () => {
    form.submit();
    expect(form.error()).toContain('Completa los campos obligatorios');
    expect(form.form.controls.name.touched).toBe(true);
    http.expectNone(() => true);
  });

  it('creates a draft using the current API DTO', () => {
    form.form.setValue({
      name: 'Tour Cotopaxi',
      description: 'Excursión guiada al volcán Cotopaxi.',
      short_description: 'Una aventura en Cotopaxi',
      type: 'GUIDED_TOUR',
      latitude: -0.68,
      longitude: -78.43,
      address: 'Parque Nacional Cotopaxi',
      meeting_point: 'Entrada norte',
      duration_hours: 8,
      currency: 'USD',
      city_id: 1,
      operator_id: '12',
      free_cancellation: true,
      cancellation_hours: 24,
      featured: false,
    });
    form.submit();
    const request = http.expectOne('/api/v2/atracciones');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Tour Cotopaxi',
      description: 'Excursión guiada al volcán Cotopaxi.',
      short_description: 'Una aventura en Cotopaxi',
      type: 'GUIDED_TOUR',
      latitude: -0.68,
      longitude: -78.43,
      address: 'Parque Nacional Cotopaxi',
      meeting_point: 'Entrada norte',
      duration_hours: 8,
      currency: 'USD',
      city_id: 1,
      operator_id: '12',
      free_cancellation: true,
      cancellation_hours: 24,
      featured: false,
    });
    request.flush({ id: 'attraction-id', name: 'Tour Cotopaxi', description: 'Excursión guiada al volcán Cotopaxi.', status: 'BORRADOR' });
    expect(form.sending()).toBe(false);
  });
});

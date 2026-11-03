import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AttractionDetail } from './attraction-detail';
import { CATALOG_API_URL } from '../../core/api.config';
import { ObservabilityService } from '../../services/observability.service';

const catalog = '/api/v2';
const detail = {
  id: 'attraction-id',
  name: 'Tour Quito',
  city: 'Quito',
  duration: '2 horas',
  description: 'Recorrido por el centro histórico.',
  price: { currency: 'USD', adult: 35, child: 18, senior: 25, infant: 0 },
  rating: { score: 4.8, review_count: 21, breakdown: { servicio: 4.5 } },
  inclusions: { includes_food: true, includes_transport: false, includes_guide: true },
  inclusions_list: ['Alimentación', 'Guía'],
  itinerary: [{ stop_number: 1, time: '09:00', title: 'Plaza Grande', duration_minutes: 30 }],
  meeting_point_geo: { address: 'Centro Histórico', city: 'Quito', latitude: -0.22, longitude: -78.5 },
  accessibility: { wheelchair_accessible: true },
  photos: ['https://example.com/quito.jpg'],
  free_cancellation: true,
};

describe('Attraction detail', () => {
  let fixture: ComponentFixture<AttractionDetail>;
  let component: AttractionDetail;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ id: detail.id }));
    TestBed.configureTestingModule({
      imports: [AttractionDetail],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: CATALOG_API_URL, useValue: catalog },
        { provide: ObservabilityService, useValue: { trackEvent: vi.fn() } },
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable(), snapshot: { paramMap: params.value } } },
      ],
    });
    fixture = TestBed.createComponent(AttractionDetail);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); localStorage.clear(); });

  it('renders the backend booking prices, inclusions, itinerary and map point', () => {
    const request = http.expectOne(catalog + '/atracciones/' + detail.id);
    expect(request.request.method).toBe('GET');
    request.flush(detail);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Tour Quito');
    expect(text).toContain('Recorrido por el centro histórico.');
    expect(text).toContain('35.00');
    expect(text).toContain('Plaza Grande');
    expect(text).toContain('Centro Histórico');
    expect(text).toContain('Alimentación');
    expect(text).toContain('Reservar');
    expect(text).toContain('Total');
    http.expectNone(request => request.url.includes('/paquetes') || request.url.includes('/availability'));
  });

  it('renders not-found responses distinctly', () => {
    http.expectOne(catalog + '/atracciones/' + detail.id)
      .flush({ message: 'Attraction missing' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(component['notFound']()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('No encontramos esta atracción');
    expect(fixture.nativeElement.textContent).toContain('Attraction missing');
  });

  it('surfaces server failures without displaying a valid empty attraction', () => {
    http.expectOne(catalog + '/atracciones/' + detail.id)
      .flush({ message: 'Service unavailable' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(component['attraction']()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Service unavailable');
  });
});

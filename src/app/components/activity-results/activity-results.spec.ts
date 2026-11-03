import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ActivityResults } from './activity-results';
import { CATALOG_API_URL } from '../../core/api.config';

const catalog = '/api/v2';
const card = {
  id: 'attraction-id',
  name: 'Tour Quito',
  city: 'Quito',
  short_description: 'Centro histórico',
  duration: '2 horas',
  duration_hours: 2,
  price: { currency: 'USD', adult: 35, child: 18, senior: 25, infant: 0 },
  rating: { score: 4.8, review_count: 21 },
  inclusions: { includes_food: true, includes_transport: false, includes_guide: true },
  photos: ['https://example.com/quito.jpg'],
};
function response(data = [card]) {
  return { data, metadata: { total_results: data.length, page: 1, limit: 50, total_pages: 1 } };
}

describe('Catalog availability searches', () => {
  let fixture: ComponentFixture<ActivityResults>;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ fecha: '2099-10-10' }));
    TestBed.configureTestingModule({
      imports: [ActivityResults],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: CATALOG_API_URL, useValue: catalog },
        { provide: ActivatedRoute, useValue: { queryParamMap: params.asObservable(), get snapshot() { return { queryParamMap: params.value }; } } },
      ],
    });
    fixture = TestBed.createComponent(ActivityResults);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(catalog + '/atracciones/categorias').flush([]);
  });
  afterEach(() => { fixture.destroy(); http.verify(); localStorage.clear(); });

  it('uses the backend search with selected dates and cancels an older search', () => {
    const old = http.expectOne(catalog + '/atracciones/search');
    expect(old.request.body).toEqual({ page: 1, limit: 50, sort: 'POPULARITY', fecha_inicio: '2099-10-10', adult_count: 1 });
    params.next(convertToParamMap({ destino: 'Quito', fecha: '2099-10-11' }));
    expect(old.cancelled).toBe(true);
    const current = http.expectOne(catalog + '/atracciones/search');
    expect(current.request.body).toEqual({
      page: 1, limit: 50, sort: 'POPULARITY', city: 'Quito',
      fecha_inicio: '2099-10-11', adult_count: 1,
    });
    current.flush(response());
    expect(fixture.componentInstance['attractions']()[0]?.city).toBe('Quito');
    expect(fixture.componentInstance['date']()).toBe('2099-10-11');
    expect(fixture.componentInstance['results']()).toHaveLength(1);
  });

  it('searches the catalog without a date after the date filter is cleared', () => {
    const pending = http.expectOne(catalog + '/atracciones/search');
    params.next(convertToParamMap({}));
    expect(pending.cancelled).toBe(true);
    const request = http.expectOne(catalog + '/atracciones/search');
    expect(request.request.body).toEqual({ page: 1, limit: 50, sort: 'POPULARITY' });
    request.flush(response());
    expect(fixture.componentInstance['date']()).toBe('');
    expect(fixture.componentInstance['results']()).toHaveLength(1);
  });

  it('keeps Ecuador-wide navigation and surfaces search errors', () => {
    const pending = http.expectOne(catalog + '/atracciones/search');
    params.next(convertToParamMap({ destino: 'Ecuador' }));
    expect(pending.cancelled).toBe(true);
    http.expectOne(catalog + '/atracciones/search')
      .flush({ message: 'Inventory unavailable' }, { status: 503, statusText: 'Unavailable' });
    expect(fixture.componentInstance['error']()).toContain('Inventory unavailable');
    expect(fixture.componentInstance['attractions']()).toEqual([]);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ActivityResults } from './activity-results';
import { API_URL } from '../../core/api.config';
import { attraction } from '../../testing/booking.fixtures';
describe('Catalog availability searches', () => {
  let fixture: ComponentFixture<ActivityResults>;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ fecha: '2099-10-10' }));
    TestBed.configureTestingModule({ imports: [ActivityResults], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }, { provide: ActivatedRoute, useValue: { queryParamMap: params.asObservable(), get snapshot() { return { queryParamMap: params.value }; } } }] });
    fixture = TestBed.createComponent(ActivityResults); http = TestBed.inject(HttpTestingController); fixture.detectChanges();
    http.expectOne(req => req.url === '/api/v1/atracciones').flush({ data: [attraction], meta: { total: 1, page: 1, lastPage: 1 } });
  });
  afterEach(() => { fixture.destroy(); http.verify(); localStorage.clear(); });
  it('does not let an older catalog date overwrite the new search', () => {
    const old = http.expectOne(req => req.url.endsWith('/availability') && req.params.get('date') === '2099-10-10');
    params.next(convertToParamMap({ fecha: '2099-10-11' })); expect(old.cancelled).toBe(true);
    http.expectOne(req => req.url.endsWith('/availability') && req.params.get('date') === '2099-10-11').flush({ date: '2099-10-11', times: [], available_spots: 0 });
    expect(fixture.componentInstance['availableIds']()).toEqual([]); expect(fixture.componentInstance['date']()).toBe('2099-10-11');
  });
  it('cancels availability queries when a date is cleared and when destroyed', () => {
    const old = http.expectOne(req => req.url.endsWith('/availability'));
    params.next(convertToParamMap({})); expect(old.cancelled).toBe(true); expect(fixture.componentInstance['availabilityLoading']()).toBe(false);
    params.next(convertToParamMap({ fecha: '2099-10-12' })); const pending = http.expectOne(req => req.url.endsWith('/availability'));
    fixture.destroy(); expect(pending.cancelled).toBe(true);
  });
});

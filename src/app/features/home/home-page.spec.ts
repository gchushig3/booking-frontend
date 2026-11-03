import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home-page';
import { CATALOG_API_URL } from '../../core/api.config';

const catalog = '/api/v2';

describe('HomePage', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [HomePage],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: CATALOG_API_URL, useValue: catalog }],
  }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows backend categories, cities and featured attractions', () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    http.expectOne(catalog + '/atracciones/categorias').flush([{ id: '1', nombre: 'Aventura' }]);
    const search = http.expectOne(catalog + '/atracciones/search');
    expect(search.request.body).toEqual({ page: 1, limit: 50, sort: 'POPULARITY' });
    search.flush({
      data: [{ id: 'a1', name: 'Tour Quito', city: 'Quito', price: { currency: 'USD', adult: 35, child: 0, senior: 0, infant: 0 }, photos: [] }],
      metadata: { total_results: 1, page: 1, limit: 50, total_pages: 1 },
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Aventura');
    expect(text).toContain('Tour Quito');
    expect(text).toContain('1 experiencia');
  });
});

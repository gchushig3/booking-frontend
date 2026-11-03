import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { API_URL, CATALOG_API_URL } from '../../core/api.config';
import { AuthService } from '../../services/auth.service';

function jwt(role: 'CLIENTE' | 'ADMIN') {
  return 'h.' + btoa(JSON.stringify({ sub: 'id', sid: 'session-id', token_use: 'access', roles: [role] })) + '.s';
}
function session(role: 'CLIENTE' | 'ADMIN') {
  localStorage.setItem('access_token', jwt(role));
  localStorage.setItem('auth_user', JSON.stringify({ id: 'id', name: 'Ana', email: 'ana@example.com' }));
  const auth = TestBed.inject(AuthService);
  auth.authenticated.set(true);
  auth.user.set({ id: 'id', name: 'Ana', email: 'ana@example.com', roles: [role], verified: true });
}

describe('Admin catalog routes', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes), provideHttpClient(), provideHttpClientTesting(),
        { provide: API_URL, useValue: '/api/v1' },
        { provide: CATALOG_API_URL, useValue: '/api/v2' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); localStorage.clear(); });

  it('prevents a client account from opening an ADMIN route', async () => {
    session('CLIENTE');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin');
    expect(TestBed.inject(Router).url).toContain('/acceso-denegado');
    expect(TestBed.inject(Router).url).toContain('motivo=403');
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(true);
    http.expectNone(() => true);
  });

  it('opens the attractions admin and loads its page from the current catalog search', async () => {
    session('ADMIN');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin');
    expect(TestBed.inject(Router).url).toContain('/admin/atracciones');
    const request = http.expectOne('/api/v2/atracciones/search');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ page: 1, limit: 10, sort: 'POPULARITY' });
    request.flush({ data: [], metadata: { total_results: 0, page: 1, limit: 10, total_pages: 1 } });
  });
});

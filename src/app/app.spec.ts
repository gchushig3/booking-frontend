import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { API_URL, CATALOG_API_URL, IDENTITY_API_URL } from './core/api.config';
import { routes } from './app.routes';

describe('App shell', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes), provideHttpClient(), provideHttpClientTesting(),
        { provide: API_URL, useValue: '/api/v1' },
        { provide: IDENTITY_API_URL, useValue: '/api/v2' },
        { provide: CATALOG_API_URL, useValue: '/api/v2' },
      ],
    }).compileComponents();
  });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); localStorage.clear(); });

  it('renders the Vívelo Ecuador header with the login action', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Vívelo');
    expect(text).toContain('Iniciar sesi\u00f3n');
  });

  it('register form sends the Identity DTO and respects its field limits', () => {
    const app = TestBed.createComponent(App).componentInstance;
    const form = app['registerForm'];
    form.setValue({ first_name: 'Ana', last_name: 'Prueba', email: 'ana@example.com', password: 'Una-clave-local-segura-42!' });
    expect(form.valid).toBe(true);
    app['registrarse']();
    const req = TestBed.inject(HttpTestingController).expectOne('/api/v2/auth/register');
    expect(req.request.body).toEqual(form.getRawValue());
    req.flush({
      user: {
        id: '123', email: 'ana@example.com', first_name: 'Ana', last_name: 'Prueba',
        verified: false, active: true, roles: ['CLIENTE'],
      },
      verification_email_sent: true,
    });
    expect(app['authService'].isLoggedIn()).toBe(false);
    expect(app['authMessage']()).toContain('verificación');
    form.controls.first_name.setValue('x'.repeat(121));
    expect(form.controls.first_name.invalid).toBe(true);
    form.controls.password.setValue('corta');
    expect(form.controls.password.invalid).toBe(true);
    form.controls.email.setValue('a'.repeat(150) + '@example.com');
    expect(form.controls.email.invalid).toBe(true);
  });
});

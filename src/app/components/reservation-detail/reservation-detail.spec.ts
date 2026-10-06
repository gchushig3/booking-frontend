import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReservationDetail } from './reservation-detail';
import { API_URL } from '../../core/api.config';
import { AuthService } from '../../services/auth.service';
import { reservation } from '../../testing/booking.fixtures';
import { ComentarioResponse, ReservationStatus } from '../../contracts/atracciones.contracts';

describe('Reservation detail and real comments', () => {
  let fixture: ComponentFixture<ReservationDetail>;
  let component: ReservationDetail;
  let http: HttpTestingController;
  const detailUrl = '/api/v1/atracciones/reservations/' + reservation.reservation_id;
  const commentsUrl = '/api/v1/atracciones/' + reservation.attraction.id + '/comentarios';
  const comment: ComentarioResponse = { id: 'comment-id', atraccion_id: reservation.attraction.id, reserva_id: reservation.reservation_id, puntuacion: 4, comentario: 'Comentario creado por API', fecha_creacion: '2026-10-05T15:00:00Z' };
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReservationDetail], providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }] });
    TestBed.inject(AuthService).authenticated.set(true);
    fixture = TestBed.createComponent(ReservationDetail); component = fixture.componentInstance; http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('reservationId', reservation.reservation_id); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); localStorage.clear(); });
  function load(status: ReservationStatus = 'CONFIRMADA', comments: ComentarioResponse[] = []) {
    const req = http.expectOne(detailUrl); expect(req.request.method).toBe('GET'); req.flush({ ...reservation, status });
    http.expectOne(commentsUrl).flush(comments); fixture.detectChanges();
  }
  function text() { return fixture.nativeElement.textContent as string; }
  function validForm(score = 4, body = 'Una experiencia real') { component.startComment(); component.form.setValue({ puntuacion: score, comentario: body }); }
  it('loads the individual reservation and displays its real fields without payment hashes', () => {
    expect(text()).toContain('Cargando reserva'); load();
    expect(component.reservation()).toEqual(reservation); expect(text()).toContain(reservation.attraction.name);
    expect(text()).toContain('71.23'); expect(text()).toContain('CONFIRMADA');
    expect(text()).not.toContain(reservation.payment!.transaccion_hash);
    expect(fixture.nativeElement.querySelector('img')).toBeNull(); http.expectNone(req => !req.url.startsWith('/api/v1/'));
  });
  it('offers cancel and comment for a confirmed reservation', () => {
    load(); expect(text()).toContain('Cancelar reserva'); expect(text()).toContain('Escribir comentario');
    let emitted: unknown; component.cancelRequested.subscribe(res => emitted = res);
    [...fixture.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.includes('Cancelar reserva')).click();
    expect(emitted).toEqual(reservation);
  });
  it('renders the QR identifier from the individual real reservation GET, not the input alone', () => {
    const idFromResponse = 'a1234567-1234-4234-8234-123456789abc';
    const req = http.expectOne(detailUrl); expect(req.request.method).toBe('GET');
    req.flush({ ...reservation, reservation_id: idFromResponse }); http.expectOne(commentsUrl).flush([]); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-reservation-qr [data-reservation-code]').textContent).toContain(idFromResponse);
    expect(fixture.nativeElement.querySelector('app-reservation-qr svg')).toBeTruthy();
    http.expectNone(req => !req.url.startsWith('/api/v1/'));
  });
  it('does not offer cancellation or commenting for a cancelled reservation', () => {
    load('CANCELADA'); expect(text()).not.toContain('Cancelar reserva'); expect(text()).not.toContain('Escribir comentario');
    validForm(); component.submit(); http.expectNone(req => req.method === 'POST');
  });
  it('represents pending state and does not offer commenting', () => {
    load('PENDIENTE'); expect(text()).toContain('PENDIENTE'); expect(text()).not.toContain('Escribir comentario');
  });
  it('shows real comment scores and dates without inventing an author or average', () => {
    load('CONFIRMADA', [comment]); expect(text()).toContain(comment.comentario); expect(text()).toContain('4/5');
    expect(text()).not.toContain('Escribir comentario'); expect(component.canComment()).toBe(false);
  });
  it('accepts integer ratings 1 through 5', () => {
    load(); for (const score of [1, 2, 3, 4, 5]) { validForm(score); expect(component.form.valid).toBe(true); }
  });
  it('blocks ratings outside the range or non-integers without a POST', () => {
    load(); for (const score of [0, 6, 8.5, 2.5]) { validForm(score); component.submit(); expect(component.form.invalid).toBe(true); }
    http.expectNone(req => req.method === 'POST');
  });
  it('enforces exact comment length boundaries and excludes blank content', () => {
    load(); for (const body of ['', 'ab', '   ', 'a'.repeat(3001)]) { validForm(4, body); component.submit(); expect(component.form.invalid).toBe(true); }
    for (const body of ['abc', 'a'.repeat(3000)]) { validForm(4, body); expect(component.form.valid).toBe(true); }
    http.expectNone(req => req.method === 'POST');
  });
  it('creates with the real reservation ID, blocks double submit, resets and refreshes real comments', () => {
    load(); validForm(4, '  Una experiencia real  '); component.submit(); component.submit();
    const req = http.expectOne(commentsUrl); expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reservation_id: reservation.reservation_id, puntuacion: 4, comentario: 'Una experiencia real' });
    expect(component.submitting()).toBe(true); expect(component.form.disabled).toBe(true);
    req.flush(comment); expect(component.comments()).toEqual([comment]); expect(component.form.controls.comentario.value).toBe('');
    expect(component.writing()).toBe(false); expect(component.submitting()).toBe(false);
    http.expectOne(commentsUrl).flush([comment]); fixture.detectChanges(); expect(text()).toContain(comment.comentario); expect(text()).toContain('publicado correctamente');
  });
  it('handles duplicate 409 explicitly and never retries creation automatically', () => {
    load(); validForm(); component.submit();
    http.expectOne(commentsUrl).flush({ message: 'duplicate' }, { status: 409, statusText: 'Conflict' });
    http.expectOne(commentsUrl).flush([comment]); fixture.detectChanges();
    expect(text()).toContain('Esta reserva ya tiene un comentario'); expect(component.canComment()).toBe(false);
    component.submit(); http.expectNone(req => req.method === 'POST');
  });
  it('distinguishes a failed comment listing from an empty list and permits retry', () => {
    http.expectOne(detailUrl).flush(reservation);
    http.expectOne(commentsUrl).flush({}, { status: 500, statusText: 'Server error' }); fixture.detectChanges();
    expect(text()).not.toContain('Aún no hay comentarios'); expect(text()).toContain('Reintentar comentarios');
    component.loadComments(); http.expectOne(commentsUrl).flush([]); fixture.detectChanges(); expect(text()).toContain('Aún no hay comentarios');
  });
  it('401 logs out and requests login for detail', () => {
    let login = 0; component.authRequired.subscribe(() => login++);
    http.expectOne(detailUrl).flush({}, { status: 401, statusText: 'Unauthorized' }); fixture.detectChanges();
    expect(login).toBe(1); expect(TestBed.inject(AuthService).authenticated()).toBe(false); expect(text()).toContain('Inicia sesión');
  });
  it('403 does not log out and shows permission failure', () => {
    http.expectOne(detailUrl).flush({}, { status: 403, statusText: 'Forbidden' }); fixture.detectChanges();
    expect(TestBed.inject(AuthService).authenticated()).toBe(true); expect(text()).toContain('No tienes permiso'); http.expectNone(commentsUrl);
  });
  it('401 listing comments requests login while 403 creation keeps the session', () => {
    let login = 0; component.authRequired.subscribe(() => login++);
    http.expectOne(detailUrl).flush(reservation); http.expectOne(commentsUrl).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(login).toBe(1); TestBed.inject(AuthService).authenticated.set(true);
    validForm(); component.submit(); http.expectOne(commentsUrl).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(component.commentError()).toContain('No tienes permiso'); expect(TestBed.inject(AuthService).authenticated()).toBe(true);
  });
  it('401 creating a comment requests login and preserves the error', () => {
    load(); let login = 0; component.authRequired.subscribe(() => login++); validForm(); component.submit();
    http.expectOne(commentsUrl).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(login).toBe(1); expect(component.commentError()).toContain('Inicia sesión'); expect(component.submitting()).toBe(false);
  });
  it('cleans up cancelled and in-flight requests on closing/destruction', () => {
    const old = http.expectOne(detailUrl); component.reload(); expect(old.cancelled).toBe(true);
    const next = http.expectOne(detailUrl); fixture.destroy(); expect(next.cancelled).toBe(true);
  });
});

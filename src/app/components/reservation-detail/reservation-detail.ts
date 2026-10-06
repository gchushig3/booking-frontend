import { Component, DestroyRef, inject, input, output, signal, effect, computed } from '@angular/core';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, switchMap, catchError, of, tap } from 'rxjs';
import { ReservationResponse, ComentarioResponse } from '../../contracts/atracciones.contracts';
import { ReservasService } from '../../services/reservas.service';
import { ComentariosService } from '../../services/comentarios.service';
import { AuthService } from '../../services/auth.service';
import { httpErrorMessage } from '../../core/http-errors';

@Component({ selector: 'app-reservation-detail', imports: [ReactiveFormsModule, DatePipe, CurrencyPipe], templateUrl: './reservation-detail.html' })
export class ReservationDetail {
  readonly reservationId = input.required<string>();
  readonly closed = output<void>();
  readonly cancelRequested = output<ReservationResponse>();
  readonly authRequired = output<void>();
  private readonly reservations = inject(ReservasService);
  private readonly commentsApi = inject(ComentariosService);
  private readonly auth = inject(AuthService);
  private readonly destroy = inject(DestroyRef);
  readonly reservation = signal<ReservationResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly comments = signal<ComentarioResponse[]>([]);
  readonly commentsLoading = signal(false);
  readonly commentsError = signal('');
  readonly writing = signal(false);
  readonly submitting = signal(false);
  readonly commentError = signal('');
  readonly success = signal('');
  readonly duplicate = signal(false);
  readonly canComment = computed(() => this.reservation()?.status === 'CONFIRMADA' && !this.duplicate() && !this.comments().some(c => c.reserva_id === this.reservationId()));
  readonly form = new FormGroup({
    puntuacion: new FormControl(5, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(5), (c: AbstractControl) => Number.isInteger(c.value) ? null : { integer: true }] }),
    comentario: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3), Validators.maxLength(3000), (c: AbstractControl) => String(c.value).trim().length >= 3 ? null : { trimmedLength: true }] }),
  });
  private readonly detailRequests = new Subject<string>();
  private readonly commentRequests = new Subject<string>();
  constructor() {
    this.detailRequests.pipe(tap(() => { this.loading.set(true); this.error.set(''); this.reservation.set(null); }),
      switchMap(id => this.reservations.obtenerReserva(id).pipe(catchError(err => { this.error.set(this.message(err)); return of(null); }))), takeUntilDestroyed(this.destroy)
    ).subscribe(res => { this.loading.set(false); this.reservation.set(res); if (res) this.loadComments(); });
    this.commentRequests.pipe(tap(() => { this.commentsLoading.set(true); this.commentsError.set(''); }),
      switchMap(id => this.commentsApi.listar(id).pipe(catchError(err => { this.commentsError.set(this.message(err)); return of(null); }))), takeUntilDestroyed(this.destroy)
    ).subscribe(comments => { this.commentsLoading.set(false); if (comments) this.comments.set(comments); });
    effect(() => { const id = this.reservationId(); this.reset(); this.comments.set([]); this.duplicate.set(false); this.detailRequests.next(id); });
  }
  reload() { this.detailRequests.next(this.reservationId()); }
  loadComments() { const res = this.reservation(); if (res) this.commentRequests.next(res.attraction.id); }
  startComment() { if (this.canComment()) { this.commentError.set(''); this.success.set(''); this.writing.set(true); } }
  reset() { this.writing.set(false); this.commentError.set(''); this.success.set(''); this.form.reset({ puntuacion: 5, comentario: '' }); }
  close() { if (!this.submitting()) { this.reset(); this.closed.emit(); } }
  private message(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 401) { this.auth.logout(); this.authRequired.emit(); }
    return httpErrorMessage(error);
  }
  submit() {
    if (this.submitting() || !this.canComment()) return;
    this.form.markAllAsTouched(); if (this.form.invalid) return;
    const res = this.reservation(); if (!res) return;
    this.submitting.set(true); this.commentError.set(''); this.form.disable();
    this.commentsApi.crear(res.attraction.id, { reservation_id: res.reservation_id, puntuacion: this.form.controls.puntuacion.value, comentario: this.form.controls.comentario.value.trim() }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: comment => {
        this.submitting.set(false); this.form.enable(); this.reset();
        this.comments.update(items => [comment, ...items.filter(item => item.id !== comment.id)]);
        this.success.set('Comentario publicado correctamente.'); this.loadComments();
      },
      error: err => {
        this.submitting.set(false); this.form.enable();
        if (err instanceof HttpErrorResponse && err.status === 409) {
          this.duplicate.set(true); this.commentError.set('Esta reserva ya tiene un comentario.'); this.loadComments();
        } else this.commentError.set(this.message(err));
      },
    });
  }
}

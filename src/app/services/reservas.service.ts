import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { API_URL } from '../core/api.config';
import { ReservationRequest, ReservationResponse } from '../contracts/atracciones.contracts';

@Injectable({ providedIn: 'root' })
export class ReservasService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${inject(API_URL)}/atracciones`;
  private readonly reservaConfirmada = new Subject<{ attractionId: string; date: string; time?: string; ticketCount: number }>();
  readonly reservaConfirmada$ = this.reservaConfirmada.asObservable();

  private readonly disponibilidadCambiada = new Subject<string>();
  readonly disponibilidadCambiada$ = this.disponibilidadCambiada.asObservable();
  notificarDisponibilidadCambiada(id: string): void { this.disponibilidadCambiada.next(id); }

  notificarReservaConfirmada(atraccionId: string, date: string, time: string | undefined, ticketCount: number): void {
    this.notificarDisponibilidadCambiada(atraccionId);
    this.reservaConfirmada.next({ attractionId: atraccionId, date, time, ticketCount });
  }

  crearReserva(atraccionId: string, datos: ReservationRequest, idempotencyKey: string): Observable<ReservationResponse> {
    return this.http.post<ReservationResponse>(
      `${this.apiUrl}/${encodeURIComponent(atraccionId)}/reservations`,
      datos,
      {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      },
    );
  }

  obtenerMisReservas(): Observable<ReservationResponse[]> {
    return this.http.get<ReservationResponse[]>(`${this.apiUrl}/reservations`);
  }

  obtenerReserva(id: string): Observable<ReservationResponse> {
    return this.http.get<ReservationResponse>(`${this.apiUrl}/reservations/${encodeURIComponent(id)}`);
  }

  cancelarReserva(id: string, idempotencyKey: string): Observable<ReservationResponse> {
    return this.http.post<ReservationResponse>(
      `${this.apiUrl}/reservations/${encodeURIComponent(id)}/cancel`,
      { reason: 'Cancelada por el usuario desde Mis Reservas' },
      { headers: { 'X-Idempotency-Key': idempotencyKey } },
    );
  }
}

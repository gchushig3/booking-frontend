import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';

export interface CrearReservaDto {
  date: string;
  time?: string;
  ticket_count: number;
  customer_name: string;
  customer_email: string;
}

export interface ReservaCreada {
  reservation_id: string;
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
  ticket_count: number;
  total_price: { currency: string; total: number };
}

export interface ReservaUsuario {
  reservation_id: string;
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
  ticket_count: number;
  total_price: { currency: string; total: number };
  date: string;
  time?: string;
  attraction: { id: string; name: string; image_url?: string };
}

interface ReservasResponse {
  data?: ReservaUsuario[];
}

@Injectable({ providedIn: 'root' })
export class ReservasService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:3000/api/v1/atracciones';

  crearReserva(atraccionId: string, datos: CrearReservaDto): Observable<ReservaCreada> {
    return this.http.post<ReservaCreada>(
      `${this.apiUrl}/${encodeURIComponent(atraccionId)}/reservations`,
      datos,
      {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      },
    );
  }

  obtenerMisReservas(): Observable<ReservaUsuario[]> {
    return this.http.get<ReservaUsuario[] | ReservasResponse>(`${this.apiUrl}/reservations`).pipe(
      map((response) => Array.isArray(response) ? response : response.data ?? []),
    );
  }

  cancelarReserva(id: string): Observable<ReservaUsuario> {
    return this.http.post<ReservaUsuario>(
      `${this.apiUrl}/reservations/${encodeURIComponent(id)}/cancel`,
      { reason: 'Cancelada por el usuario desde Mis Reservas' },
      { headers: { 'Idempotency-Key': crypto.randomUUID() } },
    );
  }
}

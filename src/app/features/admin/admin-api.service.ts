import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { API_URL } from '../../core/api.config';
import { httpErrorMessage } from '../../core/http-errors';
import { AuthService } from '../../services/auth.service';
import { ReservationResponse } from '../../contracts/atracciones.contracts';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_URL);
  private readonly auth = inject(AuthService);

  reservas() {
    return this.http.get<ReservationResponse[]>(`${this.api}/admin/reservas`);
  }

  errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        this.auth.logout();
        return 'Sesión no válida. Inicia sesión nuevamente desde la cabecera.';
      }
      if (error.status === 403) {
        return 'Acceso denegado: tu cuenta no tiene permisos ADMIN para esta operación.';
      }
    }
    return httpErrorMessage(error);
  }
}

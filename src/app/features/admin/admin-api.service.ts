import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { httpErrorMessage } from '../../core/http-errors';
import { AuthService } from '../../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        this.auth.logoutLocally();
        return 'Sesión no válida. Inicia sesión nuevamente desde la cabecera.';
      }
      if (error.status === 403) {
        return 'Acceso denegado: tu cuenta no tiene permisos ADMIN para esta operación.';
      }
    }
    return httpErrorMessage(error);
  }
}

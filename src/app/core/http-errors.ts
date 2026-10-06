import { HttpErrorResponse } from '@angular/common/http';
const messages: Record<number, string> = {
  400: 'Verifica los datos enviados.', 401: 'Inicia sesión para continuar.',
  403: 'No tienes permiso para realizar esta operación.', 404: 'No se encontró el recurso solicitado.',
  409: 'La operación entra en conflicto con los datos actuales.', 500: 'El servidor no pudo completar la operación.',
};
export function httpErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message: unknown = error.error?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message) && message.every(item => typeof item === 'string') && message.length) return message.join(' ');
    for (const value of [error.error?.detail, error.error?.title]) {
      if (typeof value === 'string' && value.trim()) return value;
    }
    return messages[error.status] ?? 'No se pudo comunicar con el servidor. Inténtalo nuevamente.';
  }
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

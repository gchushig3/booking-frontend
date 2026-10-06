import { HttpErrorResponse } from '@angular/common/http';
const messages: Record<number, string> = {
  400: 'Verifica los datos enviados.', 401: 'Inicia sesión para continuar.',
  403: 'No tienes permiso para realizar esta operación.', 404: 'No se encontró el recurso solicitado.',
  409: 'La operación entra en conflicto con los datos actuales.', 429: 'Demasiadas solicitudes. Espera un momento antes de reintentar.', 500: 'El servidor no pudo completar la operación.',
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
export function checkoutErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return httpErrorMessage(error);
  const context: Record<number, string> = {
    0: 'Respuesta incierta. Reintenta la misma reserva; se conservará su clave',
    400: 'Datos de reserva inválidos (400)', 401: 'Sesión no válida (401)',
    403: 'Acceso denegado (403)', 404: 'Atracción, paquete o recurso no encontrado (404)',
    409: 'Conflicto de reserva (409)', 429: 'Límite de solicitudes alcanzado (429)',
    500: 'Error del servidor (500)',
  };
  return `${context[error.status] ?? 'No se pudo confirmar la reserva'}: ${httpErrorMessage(error)}`;
}

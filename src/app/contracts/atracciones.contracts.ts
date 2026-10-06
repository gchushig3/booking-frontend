// JSON contracts from the current backend DTOs. Dates on the wire are strings.
export type Role = 'CLIENTE' | 'ADMIN';
export interface AuthUser { id: string; name: string; email: string }
export interface LoginCredentials { email: string; password: string }
export interface RegisterCredentials extends LoginCredentials { name: string; cedula_dni: string }
export interface AuthResponse { accessToken: string; user: AuthUser }
export interface UserJwtClaims { sub: string; email: string; role: Role; type: 'user' }
export type ProductType = 'SINGLE_TICKET' | 'GUIDED_TOUR' | 'PACKAGE';
export interface Price { currency: string; total: number }
export interface Location { address: string; city: number; country: string; coordinates: { latitude: number; longitude: number }; type?: string }
export interface Photo { url: string }
export interface Atraccion {
  id: string; name: string; provincia: string; region: string; categoria: string;
  precioBase: number; cuposTotales: number; horariosDisponibles: string[]; tipoExperienciaPermitidos: ProductType[];
  long_description: string; duration: string; price: Price; package_prices?: Partial<Record<ProductType, Price>>;
  operator: { id: number; name: string }; product_type: ProductType; includes: string[];
  categories: string[]; badges: string[]; locations: unknown[]; photos: unknown[];
  supported_languages: string[]; free_cancellation: boolean;
  ratings?: { number_of_reviews: number; score: number }; url?: { web: string; app?: string };
  _links?: Record<string, unknown>;
}
export interface AtraccionesListResponse { data: Atraccion[]; meta: { total: number; page: number; lastPage: number } }
export interface PaqueteExperiencia {
  id: string; atraccion_id: string; tipo_experiencia: ProductType; nombre_paquete: string;
  descripcion: string | null; precio_unitario: number; moneda: string;
  min_participantes: number; max_participantes: number | null; politicas_json: Record<string, unknown>;
}
export interface DisponibilidadAtraccion { date: string; available_spots: number; times: string[]; product_type?: ProductType; time?: string }
export type PaymentMethod = 'CREDIT_CARD' | 'PAYPAL';
export interface SafePayment { metodo_pago?: PaymentMethod; titular_tarjeta?: string; ultimos_cuatro_digitos?: string }
export interface ReservationRequest extends SafePayment {
  paquete_id: string;
  date: string; time?: string;
  /** Still supported by backend; new checkout flows should use num_adultos. */
  ticket_count?: number;
  num_adultos?: number; ninos?: { edad: number }[]; product_type?: ProductType;
  customer_name: string; customer_email?: string;
}
export type ReservationStatus = 'PENDIENTE' | 'CONFIRMADA' | 'CANCELADA';
export interface ReservationResponse {
  reservation_id: string; status: ReservationStatus; ticket_count: number; num_adultos: number; num_ninos: number;
  total_cupos_ocupados: number; product_type: ProductType; total_price: Price;
  payment?: { status: 'SUCCESS'; metodo_pago: PaymentMethod; monto_pagado: number; transaccion_hash: string; fecha_pago: string };
  date: string; time?: string; attraction: { id: string; name: string; image_url?: string };
}
export interface CancelReservationRequest { reason: string }

export interface CreateComentarioRequest { reservation_id: string; puntuacion: number; comentario: string }
export interface ComentarioResponse {
  id: string; atraccion_id: string; reserva_id: string | null; puntuacion: number; comentario: string; fecha_creacion: string;
}

// JSON contracts from the current backend DTOs. Dates on the wire are strings.
export type Role = 'CLIENTE' | 'ADMIN';
export interface AuthUser { id: string; name: string; email: string; roles: string[]; verified: boolean }
export interface IdentityUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  verified: boolean;
  active: boolean;
  roles: string[];
}
export interface LoginCredentials { email: string; password: string }
export interface RegisterCredentials extends LoginCredentials { first_name: string; last_name: string }
export interface RegisterResponse { user: IdentityUser; verification_email_sent: boolean }
export interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_expires_at: string;
}
export interface AuthMeResponse { user: IdentityUser; session_id: string }
export interface UserJwtClaims { sub: string; sid: string; token_use: 'access'; roles: string[] }
export type ProductType = 'SINGLE_TICKET' | 'GUIDED_TOUR' | 'PACKAGE';
export interface Price { currency: string; total: number }
export interface Location { address: string; city: number; country: string; coordinates: { latitude: number; longitude: number }; type?: string }
export interface Photo { url: string; id?: string }
export type AttractionType = 'GUIDED_TOUR' | 'ADMISSION' | 'DAY_TRIP' | 'TRANSPORT' | 'PACKAGE';
export interface BookingPrice {
  currency: string;
  adult: number;
  child: number;
  senior: number;
  infant: number;
  student?: number;
}
export interface BookingInclusions {
  includes_food: boolean;
  includes_transport: boolean;
  includes_guide: boolean;
}
export interface ItineraryStop {
  stop_number: number;
  time: string;
  title: string;
  duration_minutes: number;
}
export interface BookingProfile {
  city: string;
  price: BookingPrice;
  inclusions: BookingInclusions;
  itinerary: ItineraryStop[];
  ratings_breakdown: Record<string, number>;
  accessibility?: {
    wheelchair_accessible?: boolean;
    service_animals_allowed?: boolean;
  };
  permite_paquete?: boolean;
  schedule_times?: string[];
}
export interface PaqueteExperiencia {
  id: string;
  atraccion_id: string;
  tipo_experiencia: ProductType;
  nombre_paquete: string;
  descripcion: string | null;
  precio_unitario: number;
  moneda: string;
  min_participantes: number;
  max_participantes: number | null;
  politicas_json: Record<string, unknown>;
}
export interface Atraccion {
  id: string; numericId?: string; name: string; provincia: string; region: string; categoria: string;
  precioBase: number; cuposTotales: number; horariosDisponibles: string[]; tipoExperienciaPermitidos: ProductType[];
  long_description: string; duration: string; price: Price; package_prices?: Partial<Record<ProductType, Price>>;
  operator?: { id: number; name: string }; product_type: ProductType; includes: string[];
  categories: string[]; badges: string[]; locations: unknown[]; photos: unknown[];
  supported_languages: string[]; free_cancellation: boolean;
  ratings?: { number_of_reviews: number; score: number }; url?: { web: string; app?: string };
  _links?: Record<string, unknown>;
  description?: string;
  short_description?: string;
  city?: string;
  city_id?: number;
  type?: AttractionType;
  status?: string;
  duration_hours?: number;
  operator_id?: string;
  address?: string | null;
  meeting_point?: string | null;
  latitude?: number;
  longitude?: number;
  bookingPrice?: BookingPrice;
  bookingInclusions?: BookingInclusions;
  itinerary?: ItineraryStop[];
  bookingProfile?: BookingProfile;
  meetingPoint?: { address: string; latitude: number; longitude: number };
  accessibility?: BookingProfile['accessibility'];
  ratingsBreakdown?: Record<string, number>;
  bookingEnabled?: boolean;
  cancellationHours?: number;
}
export interface AtraccionesListResponse { data: Atraccion[]; meta: { total: number; page: number; lastPage: number } }
export interface BookingSearchRequest {
  query?: string;
  ciudad?: string;
  city?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  adult_count?: number;
  cantidad_adultos?: number;
  page?: number;
  limit?: number;
  sort?: 'PRICE_ASC' | 'PRICE_DESC' | 'RATING_DESC' | 'POPULARITY';
  categoria_id?: string;
  precio_max?: number;
  cancelacion_gratuita?: boolean;
  incluye_comida?: boolean;
  incluye_transporte?: boolean;
  incluye_guia?: boolean;
}
export interface AttractionCategory { id: string; nombre: string; slug?: string; descripcion?: string | null; icono?: string | null }
export interface CreateAttractionRequest {
  name: string;
  description: string;
  short_description?: string;
  type: AttractionType;
  latitude: number;
  longitude: number;
  address?: string;
  meeting_point?: string;
  duration_hours: number;
  currency?: string;
  city_id: number;
  operator_id: string;
  free_cancellation?: boolean;
  cancellation_hours?: number;
  featured?: boolean;
}
export type UpdateAttractionRequest = Partial<CreateAttractionRequest>;
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

export interface AttractionReservationRequest {
  attraction_id: string;
  date: string;
  time: string;
  quantity: number;
  customer_name: string;
  customer_email: string;
}
export interface AttractionReservationResponse {
  reserva_id: string;
  estado: 'CONFIRMADA';
  atraccion_id: string;
  atraccion: string;
  fecha: string;
  hora: string;
  personas: number;
}

export interface CreateComentarioRequest { reservation_id: string; puntuacion: number; comentario: string }
export interface ComentarioResponse {
  id: string; atraccion_id: string; reserva_id: string | null; puntuacion: number; comentario: string; fecha_creacion: string;
}

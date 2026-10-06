import { Atraccion, PaqueteExperiencia, ReservationResponse } from '../contracts/atracciones.contracts';
import { BookingSelection } from '../services/booking-navigation.service';
export const attraction: Atraccion = {
  id: 'attraction-id', name: 'Attraction from backend', provincia: 'Pichincha', region: 'Sierra', categoria: 'Tours',
  precioBase: 1, cuposTotales: 30, horariosDisponibles: ['01:00'], tipoExperienciaPermitidos: ['PACKAGE'],
  long_description: 'Backend description', duration: 'PT2H', price: { currency: 'USD', total: 1 },
  operator: { id: 1, name: 'Operator' }, product_type: 'PACKAGE', includes: [], categories: [], badges: [],
  locations: [], photos: [], supported_languages: [], free_cancellation: false,
};
export const experience: PaqueteExperiencia = {
  id: 'package-id', atraccion_id: attraction.id, tipo_experiencia: 'GUIDED_TOUR', nombre_paquete: 'Sendero del bosque',
  descripcion: 'Description from packages endpoint', precio_unitario: 37, moneda: 'EUR',
  min_participantes: 3, max_participantes: 5, politicas_json: { edad_nino_gratis_hasta: 6, informacion: 'Policy from backend' },
};
export function selection(overrides: Partial<BookingSelection> = {}): BookingSelection {
  return { experience: structuredClone(experience), product_type: experience.tipo_experiencia, date: '2099-10-10', time: '11:15', num_adultos: 2, ninos: [{ edad: 6 }], ...overrides };
}
export const reservation: ReservationResponse = {
  reservation_id: 'reservation-id', status: 'CONFIRMADA', ticket_count: 3, num_adultos: 2, num_ninos: 1, total_cupos_ocupados: 3,
  product_type: 'GUIDED_TOUR', total_price: { currency: 'USD', total: 71.23 }, date: '2099-10-10', time: '11:15',
  attraction: { id: attraction.id, name: 'Confirmed attraction name' },
  payment: { status: 'SUCCESS', metodo_pago: 'CREDIT_CARD', monto_pagado: 71.23, transaccion_hash: 'safe-payment-reference', fecha_pago: '2099-10-01T10:00:00Z' },
};

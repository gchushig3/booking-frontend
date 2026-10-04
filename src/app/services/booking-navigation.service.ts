import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Atraccion, ProductType } from './atracciones.service';
import { CrearReservaDto } from './reservas.service';

export type BookingSelection = Pick<CrearReservaDto, 'date' | 'time' | 'ticket_count'> & {
  product_type: ProductType;
  adult_count: number;
  child_count: number;
  checkout_total: number;
};
export interface BookingRequest { attraction: Atraccion; selection?: BookingSelection; }

@Injectable({ providedIn: 'root' })
export class BookingNavigationService {
  private readonly bookingRequests = new Subject<BookingRequest>();
  readonly bookingRequested$ = this.bookingRequests.asObservable();

  requestBooking(attraction: Atraccion, selection?: BookingSelection): void {
    this.bookingRequests.next({ attraction, selection });
  }
}

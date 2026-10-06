import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Atraccion, PaqueteExperiencia, ProductType } from '../contracts/atracciones.contracts';
export interface BookingSelection {
  experience: PaqueteExperiencia;
  product_type: ProductType;
  date: string;
  time: string;
  num_adultos: number;
  ninos: { edad: number }[];
}
export interface BookingRequest { attraction: Atraccion; selection: BookingSelection }
@Injectable({ providedIn: 'root' })
export class BookingNavigationService {
  private readonly bookingRequests = new Subject<BookingRequest>();
  readonly bookingRequested$ = this.bookingRequests.asObservable();
  requestBooking(attraction: Atraccion, selection: BookingSelection): void {
    this.bookingRequests.next({ attraction, selection });
  }
}

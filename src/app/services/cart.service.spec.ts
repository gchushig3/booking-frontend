import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormControl } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { CART_API_URL } from '../core/api.config';
import { CartService, slotIdOf } from './cart.service';
import { expiry, luhn } from '../features/booking/checkout-page';

describe('CartService', () => {
  let http: HttpTestingController;
  let service: CartService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CART_API_URL, useValue: 'https://cart/api/v2' }],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(CartService);
  });

  it('builds slot ids as Inventory expects', () => {
    expect(slotIdOf('2026-11-05', '10:00')).toBe('slot-20261105-1000');
  });

  it('clears the cart, adds the line and checks out with idempotency keys', () => {
    const results: unknown[] = [];
    service.reserve({ attractionId: '2', date: '2026-11-05', timeSlot: '10:00', slotId: 'slot-20261105-1000', adults: 2, children: 1 })
      .subscribe(value => results.push(value));
    http.expectOne(r => r.method === 'DELETE' && r.url === 'https://cart/api/v2/cart').flush({});
    const add = http.expectOne('https://cart/api/v2/cart/items');
    expect(add.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    add.flush({});
    const checkout = http.expectOne('https://cart/api/v2/cart/checkout');
    expect(checkout.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    checkout.flush({ reservationId: 'r1', expiresAt: 'x', amountCents: 6250 });
    expect(results).toEqual([{ reservationId: 'r1', expiresAt: 'x', amountCents: 6250 }]);
  });

  it('requests cancellation', () => {
    service.cancel('abc').subscribe();
    expect(http.expectOne('https://cart/api/v2/cart/reservations/abc/cancel').request.method).toBe('POST');
  });
});

describe('card validators', () => {
  it('accepts Luhn-valid numbers and rejects others', () => {
    expect(luhn(new FormControl('4242 4242 4242 4242'))).toBeNull();
    expect(luhn(new FormControl('4242 4242 4242 4241'))).not.toBeNull();
  });
  it('rejects expired cards', () => {
    expect(expiry(new FormControl('01/20'))).not.toBeNull();
    expect(expiry(new FormControl('12/99'))).toBeNull();
  });
});

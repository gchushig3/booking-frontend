import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Atraccion, AtraccionesService } from '../../services/atracciones.service';
import { AuthService } from '../../services/auth.service';
import { CartService, Reservation, slotIdOf } from '../../services/cart.service';
import { httpErrorMessage } from '../../core/http-errors';

export function luhn(control: AbstractControl): ValidationErrors | null {
  const digits = String(control.value ?? '').replace(/\s+/g, '');
  if (!/^\d{13,19}$/.test(digits)) return { card: true };
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0 ? null : { card: true };
}

export function expiry(control: AbstractControl): ValidationErrors | null {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(String(control.value ?? ''));
  if (!match) return { expiry: true };
  const end = new Date(2000 + Number(match[2]), Number(match[1]), 1);
  return end > new Date() ? null : { expiry: true };
}

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe],
  template: `
    <main class="min-h-screen bg-stone-50 px-4 py-8 sm:px-8">
      <div class="mx-auto max-w-4xl">
        <h1 class="text-3xl font-black">Confirmar y pagar</h1>
        @if (!auth.authenticated()) {
          <p role="alert" class="mt-6 rounded-2xl bg-amber-50 p-5 text-amber-900">Inicia sesión desde la cabecera para completar tu reserva.</p>
        } @else if (loadError()) {
          <p role="alert" class="mt-6 rounded-2xl bg-red-50 p-5 text-red-800">{{ loadError() }}</p>
        } @else if (attraction(); as item) {
          @if (result(); as r) {
            <section class="mt-6 rounded-3xl bg-white p-8 shadow-sm" aria-live="polite">
              <p class="text-sm font-bold uppercase tracking-widest text-emerald-700">¡Reserva confirmada!</p>
              <h2 class="mt-2 text-2xl font-black">{{ item.name }}</h2>
              <dl class="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt class="font-semibold">Código</dt><dd class="font-mono">{{ r.reservationId.slice(0, 8).toUpperCase() }}</dd></div>
                <div><dt class="font-semibold">Fecha y hora</dt><dd>{{ fecha() }} · {{ hora() }}</dd></div>
                <div><dt class="font-semibold">Personas</dt><dd>{{ adultos() }} adultos, {{ ninos() }} niños</dd></div>
                <div><dt class="font-semibold">Total pagado</dt><dd>{{ r.payload.amountCents / 100 | currency:'USD' }}</dd></div>
              </dl>
              <a routerLink="/reservas" class="mt-6 inline-block rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800">Ver mis reservas</a>
            </section>
          } @else {
            <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
              <form [formGroup]="form" (ngSubmit)="pay()" class="space-y-4 rounded-3xl bg-white p-6 shadow-sm" aria-label="Pago">
                <h2 class="text-xl font-bold">Datos de la tarjeta</h2>
                <label class="block text-sm font-semibold">Titular
                  <input formControlName="holder" autocomplete="cc-name" class="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2">
                </label>
                <label class="block text-sm font-semibold">Número de tarjeta
                  <input formControlName="number" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" class="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2">
                  @if (form.controls.number.touched && form.controls.number.invalid) { <span role="alert" class="text-xs text-red-700">Número de tarjeta inválido</span> }
                </label>
                <div class="grid grid-cols-2 gap-4">
                  <label class="block text-sm font-semibold">Vence (MM/AA)
                    <input formControlName="expiry" autocomplete="cc-exp" placeholder="12/30" class="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2">
                    @if (form.controls.expiry.touched && form.controls.expiry.invalid) { <span role="alert" class="text-xs text-red-700">Fecha inválida</span> }
                  </label>
                  <label class="block text-sm font-semibold">CVV
                    <input formControlName="cvv" inputmode="numeric" autocomplete="cc-csc" maxlength="4" class="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2">
                  </label>
                </div>
                <p class="text-xs text-slate-500">Entorno de simulación: los datos de la tarjeta se validan en tu navegador y no se envían ni se almacenan. El resultado del cobro lo decide el servicio de pagos simulado.</p>
                @if (error()) { <p role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-800">{{ error() }}</p> }
                <button type="submit" [disabled]="form.invalid || processing()" class="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
                  {{ processing() ? status() : 'Pagar ' + (total() | currency:'USD') }}
                </button>
              </form>
              <aside class="rounded-3xl bg-white p-6 shadow-sm">
                <h2 class="text-xl font-bold">{{ item.name }}</h2>
                <p class="mt-1 text-sm text-slate-600">{{ item.city }}</p>
                <dl class="mt-4 space-y-2 text-sm">
                  <div class="flex justify-between"><dt>Fecha</dt><dd>{{ fecha() }}</dd></div>
                  <div class="flex justify-between"><dt>Hora</dt><dd>{{ hora() }}</dd></div>
                  <div class="flex justify-between"><dt>Adultos</dt><dd>{{ adultos() }}</dd></div>
                  <div class="flex justify-between"><dt>Niños</dt><dd>{{ ninos() }}</dd></div>
                  <div class="flex justify-between border-t pt-2 text-lg font-black"><dt>Total</dt><dd>{{ total() | currency:'USD' }}</dd></div>
                </dl>
              </aside>
            </div>
          }
        } @else {
          <p class="mt-6 text-slate-500" role="status">Cargando…</p>
        }
      </div>
    </main>
  `,
})
export class CheckoutPage {
  private readonly route = inject(ActivatedRoute);
  private readonly atracciones = inject(AtraccionesService);
  private readonly cart = inject(CartService);
  protected readonly auth = inject(AuthService);

  protected readonly attraction = signal<Atraccion | null>(null);
  protected readonly loadError = signal('');
  protected readonly processing = signal(false);
  protected readonly status = signal('');
  protected readonly error = signal('');
  protected readonly result = signal<Reservation | null>(null);

  private readonly query = this.route.snapshot.queryParamMap;
  protected readonly fecha = signal(this.query.get('fecha') ?? '');
  protected readonly hora = signal(this.query.get('hora') ?? '');
  protected readonly adultos = signal(Number(this.query.get('adultos') ?? 1));
  protected readonly ninos = signal(Number(this.query.get('ninos') ?? 0));
  protected readonly total = computed(() => {
    const price = this.attraction()?.bookingPrice;
    return price ? price.adult * this.adultos() + price.child * this.ninos() : 0;
  });

  protected readonly form = new FormGroup({
    holder: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] }),
    number: new FormControl('', { nonNullable: true, validators: [luhn] }),
    expiry: new FormControl('', { nonNullable: true, validators: [expiry] }),
    cvv: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d{3,4}$/)] }),
  });

  ngOnInit(): void {
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(this.fecha()) && /^\d{2}:\d{2}$/.test(this.hora())
      && this.adultos() >= 1 && this.ninos() >= 0;
    if (!valid) { this.loadError.set('Faltan datos de la reserva. Vuelve a la ficha y elige fecha, horario y personas.'); return; }
    this.atracciones.obtenerAtraccion(this.route.snapshot.paramMap.get('id') ?? '').subscribe({
      next: item => item.numericId
        ? this.attraction.set(item)
        : this.loadError.set('La atracción no admite reservas todavía.'),
      error: err => this.loadError.set(httpErrorMessage(err)),
    });
  }

  protected pay(): void {
    const item = this.attraction();
    if (!item?.numericId || this.form.invalid || this.processing()) return;
    this.processing.set(true);
    this.error.set('');
    this.status.set('Reservando cupo…');
    const draft = {
      attractionId: item.numericId,
      date: this.fecha(),
      timeSlot: this.hora(),
      slotId: slotIdOf(this.fecha(), this.hora()),
      adults: this.adultos(),
      children: this.ninos(),
    };
    this.cart.reserve(draft).subscribe({
      next: created => {
        this.status.set('Procesando pago…');
        let settled = false;
        this.cart.waitForResult(created.reservationId).subscribe({
          next: reservation => {
            settled = true;
            this.processing.set(false);
            if (reservation.state === 'CONFIRMED') this.result.set(reservation);
            else this.error.set('No se pudo completar la reserva: el pago fue rechazado o el cupo ya no está disponible. No se realizó ningún cobro. Inténtalo de nuevo.');
          },
          error: err => { this.processing.set(false); this.error.set(httpErrorMessage(err)); },
          complete: () => {
            if (!settled) {
              this.processing.set(false);
              this.error.set('El pago sigue en proceso. Revisa "Mis reservas" en unos instantes.');
            }
          },
        });
      },
      error: err => { this.processing.set(false); this.error.set(httpErrorMessage(err)); },
    });
  }
}

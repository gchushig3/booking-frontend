import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { AtraccionesService } from '../../services/atracciones.service';
import { AuthService } from '../../services/auth.service';
import { CartService, Reservation } from '../../services/cart.service';
import { httpErrorMessage } from '../../core/http-errors';

const STATE_LABEL: Record<string, string> = {
  PENDING: 'Procesando', CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada / no completada',
};

@Component({
  selector: 'app-my-reservations',
  standalone: true,
  imports: [RouterLink, CurrencyPipe],
  template: `
    <main class="mx-auto max-w-4xl px-5 py-10 sm:px-8">
      <h1 class="text-3xl font-bold">Mis reservas</h1>
      @if (!auth.authenticated()) {
        <p role="alert" class="mt-6 rounded-2xl bg-amber-50 p-5 text-amber-900">Inicia sesión para ver tus reservas.</p>
      } @else if (loading()) {
        <p class="mt-6 text-slate-500" role="status">Cargando reservas…</p>
      } @else {
        @if (message()) { <p role="status" class="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{{ message() }}</p> }
        @if (error()) { <p role="alert" class="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{{ error() }}</p> }
        @for (r of reservations(); track r.reservationId) {
          <article class="mt-5 rounded-3xl bg-white p-6 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 class="text-xl font-bold">{{ nameOf(r) }}</h2>
                <p class="text-sm text-slate-600">{{ r.payload.lines[0].date }} · {{ r.payload.lines[0].timeSlot }} · {{ r.payload.lines[0].adults }} adultos, {{ r.payload.lines[0].children }} niños</p>
                <p class="mt-1 font-mono text-xs text-slate-500">Código {{ r.reservationId.slice(0, 8).toUpperCase() }}</p>
              </div>
              <div class="text-right">
                <p class="font-black">{{ r.payload.amountCents / 100 | currency:'USD' }}</p>
                <span class="mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold"
                  [class]="r.state === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : r.state === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-stone-200 text-stone-700'">{{ label(r.state) }}</span>
              </div>
            </div>
            @if (r.state === 'CONFIRMED') {
              <button type="button" (click)="cancel(r)" [disabled]="busy() === r.reservationId" class="mt-4 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                {{ busy() === r.reservationId ? 'Cancelando…' : 'Cancelar y reembolsar' }}
              </button>
            }
          </article>
        } @empty {
          <p class="mt-6 text-slate-600">Aún no tienes reservas.</p>
          <a routerLink="/actividades" class="mt-4 inline-flex rounded-xl bg-teal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-800">Explorar experiencias</a>
        }
      }
    </main>
  `,
})
export class MyReservations {
  protected readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);
  private readonly atracciones = inject(AtraccionesService);

  protected readonly reservations = signal<Reservation[]>([]);
  protected readonly names = signal<Record<string, string>>({});
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly busy = signal('');

  ngOnInit(): void { if (this.auth.authenticated()) this.load(); else this.loading.set(false); }

  protected label(state: string): string { return STATE_LABEL[state] ?? state; }
  protected nameOf(r: Reservation): string { return this.names()[r.payload.lines[0].itemId] ?? 'Experiencia'; }

  private load(): void {
    this.cart.list().subscribe({
      next: list => {
        this.reservations.set(list.filter(r => r.payload?.lines?.length));
        this.loading.set(false);
        const ids = [...new Set(this.reservations().map(r => r.payload.lines[0].itemId))];
        if (!ids.length) return;
        forkJoin(ids.map(id => this.atracciones.obtenerAtraccion(id).pipe(
          map(item => [id, item.name] as const), catchError(() => of([id, 'Experiencia'] as const)),
        ))).subscribe(pairs => this.names.set(Object.fromEntries(pairs)));
      },
      error: err => { this.loading.set(false); this.error.set(httpErrorMessage(err)); },
    });
  }

  protected cancel(r: Reservation): void {
    this.busy.set(r.reservationId);
    this.error.set('');
    this.message.set('');
    this.cart.cancel(r.reservationId).subscribe({
      next: () => {
        this.message.set('Reembolso solicitado. Tu reserva se actualizará en unos segundos y el cupo se liberará.');
        // El reembolso circula por la saga: se refresca hasta ver la reserva cancelada.
        let attempts = 0;
        const poll = setInterval(() => {
          attempts++;
          this.cart.get(r.reservationId).subscribe(updated => {
            if (updated.state === 'CANCELLED' || attempts >= 20) {
              clearInterval(poll);
              this.busy.set('');
              this.load();
            }
          });
        }, 1500);
      },
      error: err => { this.busy.set(''); this.error.set(httpErrorMessage(err)); },
    });
  }
}

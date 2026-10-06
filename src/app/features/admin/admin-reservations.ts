import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminApiService } from './admin-api.service';
import { ReservationResponse, ReservationStatus } from '../../contracts/atracciones.contracts';

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADA: 'Confirmada',
  CANCELADA: 'Cancelada',
};

@Component({
  selector: 'app-admin-reservations',
  imports: [CurrencyPipe],
  template: `
    <section aria-labelledby="admin-reservations-title">
      <h2 id="admin-reservations-title" class="text-2xl font-bold">Reservas</h2>
      <p class="mt-1 text-sm text-slate-600">Consulta de reservas de todas las atracciones.</p>
      <button type="button" (click)="load()" [disabled]="loading()" class="my-4 rounded-xl border border-stone-300 px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Actualizar reservas</button>
      @if (loading()) { <p role="status">Cargando reservas...</p> }
      @else if (error()) {
        <div role="alert" class="text-red-700">{{ error() }}
          <button type="button" (click)="load()" class="ml-2 rounded-lg border px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Reintentar</button>
        </div>
      }
      @else if (!rows().length) { <p>No hay reservas.</p> }
      @else {
        <div class="space-y-3 md:hidden">
          @for (res of rows(); track res.reservation_id) {
            <article class="rounded-2xl border border-stone-200 bg-white p-4">
              <p class="font-mono text-xs">{{ res.reservation_id }}</p>
              <h3 class="mt-1 font-bold">{{ res.attraction.name }}</h3>
              <p class="text-sm">{{ res.date }} {{ res.time }}</p>
              <p class="text-sm">{{ res.num_adultos }} adultos, {{ res.num_ninos }} niños; {{ res.total_cupos_ocupados }} cupos</p>
              <p class="text-sm"><span class="font-semibold">{{ statusLabel(res.status) }}</span> <span class="font-mono">({{ res.status }})</span></p>
              <p class="text-sm font-semibold">{{ res.total_price.total | currency:res.total_price.currency }}</p>
            </article>
          }
        </div>
        <div class="hidden overflow-x-auto md:block">
          <table class="w-full min-w-[48rem] text-left text-sm">
            <caption class="sr-only">Reservas del backend, solo lectura</caption>
            <thead>
              <tr>
                <th scope="col" class="p-3">ID</th>
                <th scope="col" class="p-3">Atracción</th>
                <th scope="col" class="p-3">Fecha / turno</th>
                <th scope="col" class="p-3">Participantes</th>
                <th scope="col" class="p-3">Estado</th>
                <th scope="col" class="p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (res of rows(); track res.reservation_id) {
                <tr class="border-t">
                  <td class="p-3 font-mono">{{ res.reservation_id }}</td>
                  <td class="p-3">{{ res.attraction.name }}</td>
                  <td class="p-3">{{ res.date }} {{ res.time }}</td>
                  <td class="p-3">{{ res.num_adultos }} adultos, {{ res.num_ninos }} niños; {{ res.total_cupos_ocupados }} cupos</td>
                  <td class="p-3">{{ statusLabel(res.status) }} <span class="font-mono text-xs">({{ res.status }})</span></td>
                  <td class="p-3">{{ res.total_price.total | currency:res.total_price.currency }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class AdminReservations {
  private readonly api = inject(AdminApiService);
  private readonly destroy = inject(DestroyRef);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly rows = signal<ReservationResponse[]>([]);

  constructor() {
    this.load();
  }

  statusLabel(status: ReservationStatus): string {
    return STATUS_LABEL[status] ?? status;
  }

  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.reservas().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(this.api.errorMessage(err));
        this.loading.set(false);
      },
    });
  }
}

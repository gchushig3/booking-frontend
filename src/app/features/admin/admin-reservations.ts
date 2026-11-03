import { Component } from '@angular/core';

@Component({
  selector: 'app-admin-reservations',
  template: `
    <section aria-labelledby="admin-reservations-title">
      <h2 id="admin-reservations-title" class="text-2xl font-bold">Reservas</h2>
      <p class="mt-1 text-sm text-slate-600">El contrato actual de ms-catalog permite registrar una reserva, pero no ofrece un endpoint para consultar el listado administrativo.</p>
      <p role="status" class="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        Esta sección se habilitará cuando el backend publique el endpoint de consulta de reservas. No se realizará una petición a una ruta inexistente.
      </p>
    </section>
  `,
})
export class AdminReservations {}

import { Component, computed, input } from '@angular/core';
import qrcode from 'qrcode-generator';
import { ReservationStatus } from '../../contracts/atracciones.contracts';

/** Presentation only: the opaque UUID grants no authority or private lookup. */
@Component({
  selector: 'app-reservation-qr',
  template: `
    <section aria-label="Código de presentación de reserva" class="flex flex-col items-center gap-3 text-center">
      @if (validIdentifier()) {
        <p class="text-sm font-semibold">Código de reserva</p>
        <p class="max-w-full break-all font-mono text-sm" data-reservation-code>{{ identifier() }}</p>
      }
      @if (status() === 'CANCELADA') {
        <p role="status" class="font-semibold text-red-700">Reserva cancelada</p>
      } @else if (status() === 'PENDIENTE') {
        <p role="status" class="text-sm text-slate-600">Reserva pendiente. El QR estará disponible cuando esté confirmada.</p>
      } @else if (matrix(); as qr) {
        <svg role="img" aria-label="QR de reserva" [attr.viewBox]="'0 0 ' + qr.size + ' ' + qr.size"
          width="224" height="224" class="max-w-full" shape-rendering="crispEdges">
          <rect width="100%" height="100%" fill="white" />
          <path [attr.d]="qr.path" fill="black" />
        </svg>
        <p class="max-w-xs text-sm text-slate-700">Presenta este código o QR al ingresar a la atracción.</p>
      } @else {
        <p role="status" class="text-sm text-slate-600">Código de presentación no disponible.</p>
      }
    </section>
  `,
})
export class ReservationQr {
  readonly identifier = input.required<string>();
  readonly status = input.required<ReservationStatus>();
  readonly validIdentifier = computed(() => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.identifier()));
  readonly matrix = computed(() => {
    if (this.status() !== 'CONFIRMADA' || !this.validIdentifier()) return null;
    const qr = qrcode(0, 'M');
    qr.addData(this.identifier(), 'Byte');
    qr.make();
    const modules = qr.getModuleCount(); const quietZone = 4; const paths: string[] = [];
    for (let row = 0; row < modules; row++) {
      for (let column = 0; column < modules; column++) {
        if (qr.isDark(row, column)) paths.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
      }
    }
    return { size: modules + quietZone * 2, path: paths.join('') };
  });
}

import { Component, inject } from '@angular/core';
import { ToastService } from './services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  template: `
    <section class="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3" aria-label="Notificaciones" aria-live="polite">
      @for (toast of toasts(); track toast.id) {
        <div class="pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-xl ring-1 ring-black/5" [class.border-emerald-200]="toast.tipo === 'exito'" [class.border-red-200]="toast.tipo === 'error'" [class.border-sky-200]="toast.tipo === 'info'" [class.text-emerald-900]="toast.tipo === 'exito'" [class.text-red-900]="toast.tipo === 'error'" [class.text-sky-900]="toast.tipo === 'info'" role="status">
          <span class="grid size-8 shrink-0 place-items-center rounded-full font-bold" [class.bg-emerald-100]="toast.tipo === 'exito'" [class.bg-red-100]="toast.tipo === 'error'" [class.bg-sky-100]="toast.tipo === 'info'" aria-hidden="true">{{ toast.tipo === 'exito' ? '✓' : toast.tipo === 'error' ? '!' : 'i' }}</span>
          <p class="flex-1 pt-1 text-sm font-semibold leading-5">{{ toast.mensaje }}</p>
          <button type="button" (click)="cerrar(toast.id)" class="rounded-lg px-2 py-1 text-lg leading-none opacity-60 hover:bg-black/5 hover:opacity-100" aria-label="Cerrar notificación">×</button>
        </div>
      }
    </section>
  `,
})
export class ToastContainer {
  private readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;
  protected cerrar(id: number): void { this.toastService.cerrar(id); }
}

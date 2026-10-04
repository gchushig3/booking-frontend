import { Injectable, signal } from '@angular/core';

export type ToastTipo = 'exito' | 'error' | 'info';
export interface ToastMensaje { id: number; tipo: ToastTipo; mensaje: string; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<ToastMensaje[]>([]);
  private siguienteId = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  mostrar(tipo: ToastTipo, mensaje: string): void {
    const id = ++this.siguienteId;
    this.toasts.update((items) => [...items, { id, tipo, mensaje }]);
    this.timers.set(id, setTimeout(() => this.cerrar(id), 3000));
  }

  cerrar(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.toasts.update((items) => items.filter((item) => item.id !== id));
  }
}

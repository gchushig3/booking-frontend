import { CurrencyPipe } from '@angular/common';
import { afterRenderEffect, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { Atraccion, PaqueteExperiencia } from '../../contracts/atracciones.contracts';
import { AtraccionesService } from '../../services/atracciones.service';
import { ToastService } from '../../services/toast.service';
import { AdminApiService } from './admin-api.service';
import { AttractionForm } from './attraction-form';

@Component({
  selector: 'app-admin-attractions',
  imports: [CurrencyPipe, AttractionForm],
  templateUrl: './admin-attractions.html',
})
export class AdminAttractions {
  private readonly api = inject(AtraccionesService);
  private readonly admin = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly destroy = inject(DestroyRef);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly rows = signal<Atraccion[]>([]);
  readonly page = signal(1);
  readonly lastPage = signal(1);
  readonly total = signal(0);
  readonly limit = 10;
  readonly mode = signal<'list' | 'create' | 'edit'>('list');
  readonly editing = signal<Atraccion | null>(null);
  readonly pendingDeactivate = signal<Atraccion | null>(null);
  readonly deactivating = signal(false);
  readonly packagesFor = signal<string | null>(null);
  readonly packages = signal<PaqueteExperiencia[]>([]);
  readonly packagesLoading = signal(false);
  readonly packagesError = signal('');
  readonly feedback = signal('');
  private readonly confirmation = viewChild<ElementRef<HTMLElement>>('confirmation');
  private previousFocus: HTMLElement | null = null;
  private packagesRequest?: Subscription;

  constructor() {
    afterRenderEffect(() => {
      this.confirmation()?.nativeElement.querySelector<HTMLButtonElement>('button')?.focus();
    });
    this.load();
  }

  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.obtenerPagina(this.page(), this.limit).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (response) => {
        this.rows.set(response.data);
        this.total.set(response.meta.total);
        this.lastPage.set(Math.max(1, Number(response.meta.lastPage) || 1));
        this.loading.set(false);
        if (!response.data.length && this.page() > 1) {
          this.page.set(this.page() - 1);
          this.load();
        }
      },
      error: (err) => {
        this.error.set(this.admin.errorMessage(err));
        this.loading.set(false);
      },
    });
  }

  goTo(page: number) {
    if (page < 1 || page > this.lastPage() || page === this.page() || this.loading()) return;
    this.page.set(page);
    this.load();
  }

  startCreate() {
    this.editing.set(null);
    this.mode.set('create');
    this.feedback.set('');
  }

  startEdit(attraction: Atraccion) {
    this.editing.set(attraction);
    this.mode.set('edit');
    this.feedback.set('');
  }

  closeForm() {
    this.mode.set('list');
    this.editing.set(null);
  }

  onSaved(attraction: Atraccion) {
    const created = this.mode() === 'create';
    this.feedback.set(created ? `Atracción creada: ${attraction.name}` : `Atracción actualizada: ${attraction.name}`);
    this.toast.mostrar('exito', this.feedback());
    this.closeForm();
    if (created) this.page.set(1);
    this.load();
  }

  askDeactivate(attraction: Atraccion) {
    if (this.deactivating()) return;
    this.previousFocus = document.activeElement as HTMLElement | null;
    this.pendingDeactivate.set(attraction);
  }

  cancelDeactivate() {
    if (this.deactivating()) return;
    this.pendingDeactivate.set(null);
    this.previousFocus?.focus();
  }

  confirmationKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelDeactivate();
    }
    if (event.key !== 'Tab') return;
    const buttons = this.confirmation()?.nativeElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    if (!buttons?.length) { event.preventDefault(); return; }
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  confirmDeactivate() {
    const attraction = this.pendingDeactivate();
    if (!attraction || this.deactivating()) return;
    this.deactivating.set(true);
    this.api.desactivarAtraccion(attraction.id).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => {
        this.deactivating.set(false);
        this.pendingDeactivate.set(null);
        this.toast.mostrar('exito', `Atracción desactivada: ${attraction.name}`);
        this.feedback.set(`Atracción desactivada: ${attraction.name}`);
        this.load();
      },
      error: (err) => {
        this.deactivating.set(false);
        this.error.set(this.admin.errorMessage(err));
      },
    });
  }

  togglePackages(attraction: Atraccion) {
    this.packagesRequest?.unsubscribe();
    this.packagesLoading.set(false);
    if (this.packagesFor() === attraction.id) {
      this.packagesFor.set(null);
      this.packages.set([]);
      this.packagesError.set('');
      return;
    }
    this.packagesFor.set(attraction.id);
    this.packages.set([]);
    this.packagesError.set('');
    this.packagesLoading.set(true);
    this.packagesRequest = this.api.obtenerPaquetes(attraction.id).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (packages) => {
        this.packages.set(packages);
        this.packagesLoading.set(false);
      },
      error: (err) => {
        this.packagesError.set(this.admin.errorMessage(err));
        this.packagesLoading.set(false);
      },
    });
  }
}

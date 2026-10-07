import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Atraccion, PaqueteExperiencia, ProductType } from '../../contracts/atracciones.contracts';
import { AtraccionesService } from '../../services/atracciones.service';
import { AdminApiService } from './admin-api.service';

@Component({
  selector: 'app-booking-settings', imports: [ReactiveFormsModule], templateUrl: './booking-settings.html',
})
export class BookingSettings {
  readonly attraction = input.required<Atraccion>();
  private readonly api = inject(AtraccionesService);
  private readonly admin = inject(AdminApiService);
  private readonly destroy = inject(DestroyRef);
  readonly packages = signal<PaqueteExperiencia[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly availability = signal('');
  readonly packageId = signal<string | undefined>(undefined);
  readonly types: ProductType[] = ['SINGLE_TICKET', 'GUIDED_TOUR', 'PACKAGE'];
  readonly experience = new FormGroup({
    nombre_paquete: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3), Validators.maxLength(100)] }),
    tipo_experiencia: new FormControl<ProductType>('SINGLE_TICKET', { nonNullable: true }),
    precio_unitario: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    min_participantes: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)] }),
    max_participantes: new FormControl<number | null>(20, { validators: [Validators.min(1), Validators.pattern(/^\d+$/)] }),
  });
  readonly slot = new FormGroup({
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    time: new FormControl('10:00', { nonNullable: true, validators: [Validators.required] }),
    capacidad_total: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)] }),
  });
  constructor() {
    effect(() => { this.experience.controls.tipo_experiencia.setValue(this.attraction().product_type); this.loadPackages(); });
  }
  loadPackages() {
    this.api.obtenerPaquetes(this.attraction().id).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: items => this.packages.set(items), error: err => this.error.set(this.admin.errorMessage(err)),
    });
  }
  edit(pkg?: PaqueteExperiencia) {
    if (this.busy()) return;
    this.packageId.set(pkg?.id);
    this.experience.reset({ nombre_paquete: pkg?.nombre_paquete ?? '', tipo_experiencia: pkg?.tipo_experiencia ?? this.attraction().product_type, precio_unitario: pkg?.precio_unitario ?? 0, min_participantes: pkg?.min_participantes ?? 1, max_participantes: pkg ? pkg.max_participantes : 20 });
  }
  saveExperience() {
    this.experience.markAllAsTouched();
    const body = this.experience.getRawValue();
    if (this.busy()) return;
    if (this.experience.invalid || (body.max_participantes != null && body.max_participantes < body.min_participantes)) { this.error.set('Revisa el nombre, precio y límites de participantes.'); return; }
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.api.guardarPaquete(this.attraction().id, body, this.packageId()).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => { this.busy.set(false); this.message.set('Experiencia guardada. Configura sus turnos para habilitar reservas.'); this.edit(); this.loadPackages(); },
      error: err => { this.busy.set(false); this.error.set(this.admin.errorMessage(err)); },
    });
  }
  checkSlot() {
    if (this.busy() || !this.slot.controls.date.value || !this.slot.controls.time.value) return;
    this.busy.set(true); this.error.set(''); this.availability.set('');
    const { date, time } = this.slot.getRawValue();
    this.api.obtenerDisponibilidad(this.attraction().id, date, undefined, time).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: result => { this.busy.set(false); this.availability.set(`${result.available_spots} cupos disponibles para ${date} a las ${time}.`); },
      error: err => { this.busy.set(false); this.error.set(this.admin.errorMessage(err)); },
    });
  }
  saveSlot() {
    this.slot.markAllAsTouched();
    if (this.busy()) return;
    if (this.slot.invalid) { this.error.set('Indica fecha, hora y una capacidad entera igual o mayor que cero.'); return; }
    this.busy.set(true); this.error.set(''); this.message.set(''); this.availability.set('');
    this.api.guardarTurno(this.attraction().id, this.slot.getRawValue()).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => { this.busy.set(false); this.message.set('Turno guardado.'); this.checkSlot(); },
      error: err => { this.busy.set(false); this.error.set(this.admin.errorMessage(err)); },
    });
  }
}

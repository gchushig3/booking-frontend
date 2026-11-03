import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AttractionType, Atraccion, CreateAttractionRequest, UpdateAttractionRequest } from '../../contracts/atracciones.contracts';
import { AtraccionesService } from '../../services/atracciones.service';
import { AdminApiService } from './admin-api.service';

const TYPES: AttractionType[] = ['GUIDED_TOUR', 'ADMISSION', 'DAY_TRIP', 'TRANSPORT', 'PACKAGE'];

@Component({
  selector: 'app-admin-attraction-form',
  imports: [ReactiveFormsModule],
  templateUrl: './attraction-form.html',
})
export class AttractionForm {
  readonly attraction = input<Atraccion | null>(null);
  readonly saved = output<Atraccion>();
  readonly cancelled = output<void>();
  private readonly api = inject(AtraccionesService);
  private readonly admin = inject(AdminApiService);
  private readonly destroy = inject(DestroyRef);
  readonly sending = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly types = TYPES;
  readonly typeLabels: Record<AttractionType, string> = {
    GUIDED_TOUR: 'Tour guiado',
    ADMISSION: 'Admisión',
    DAY_TRIP: 'Excursión de día',
    TRANSPORT: 'Transporte',
    PACKAGE: 'Paquete',
  };
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3), Validators.maxLength(200)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(10)] }),
    short_description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(280)] }),
    type: new FormControl<AttractionType>('GUIDED_TOUR', { nonNullable: true, validators: [Validators.required] }),
    latitude: new FormControl<number | null>(null, [Validators.required, Validators.min(-90), Validators.max(90)]),
    longitude: new FormControl<number | null>(null, [Validators.required, Validators.min(-180), Validators.max(180)]),
    address: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    meeting_point: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    duration_hours: new FormControl<number | null>(2, [Validators.required, Validators.min(0.01), Validators.max(720)]),
    currency: new FormControl('USD', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[A-Z]{3}$/)] }),
    city_id: new FormControl<number | null>(null, [Validators.required, Validators.min(1), Validators.max(32767), Validators.pattern(/^\d+$/)]),
    operator_id: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[1-9]\d{0,18}$/)] }),
    free_cancellation: new FormControl(false, { nonNullable: true }),
    cancellation_hours: new FormControl<number | null>(24, [Validators.required, Validators.min(0), Validators.max(32767), Validators.pattern(/^\d+$/)]),
    featured: new FormControl(false, { nonNullable: true }),
  });
  private original: CreateAttractionRequest | null = null;

  constructor() {
    effect(() => {
      const item = this.attraction();
      if (item) {
        this.loading.set(true);
        this.api.obtenerAtraccion(item.id).pipe(takeUntilDestroyed(this.destroy)).subscribe({
          next: detail => {
            this.fillForm(detail);
            this.loading.set(false);
          },
          error: error => {
            this.fillForm(item);
            this.loading.set(false);
            this.error.set(this.admin.errorMessage(error));
          },
        });
      } else {
        this.fillForm(null);
      }
    });
  }

  private fillForm(item: Atraccion | null): void {
      this.form.controls.city_id.setValidators(item
        ? [Validators.min(1), Validators.max(32767), Validators.pattern(/^\d+$/)]
        : [Validators.required, Validators.min(1), Validators.max(32767), Validators.pattern(/^\d+$/)]);
      this.form.controls.operator_id.setValidators(item
        ? [Validators.pattern(/^[1-9]\d{0,18}$/)]
        : [Validators.required, Validators.pattern(/^[1-9]\d{0,18}$/)]);
      this.form.controls.city_id.updateValueAndValidity({ emitEvent: false });
      this.form.controls.operator_id.updateValueAndValidity({ emitEvent: false });
      const attractionType = item?.type
        ?? (item?.product_type === 'GUIDED_TOUR' ? 'GUIDED_TOUR'
          : item?.product_type === 'PACKAGE' ? 'PACKAGE' : 'ADMISSION');
      this.error.set('');
      this.form.reset({
        name: item?.name ?? '',
        description: item?.description ?? item?.long_description ?? '',
        short_description: item?.short_description ?? '',
        type: attractionType,
        latitude: item?.latitude ?? null,
        longitude: item?.longitude ?? null,
        address: item?.address ?? '',
        meeting_point: item?.meeting_point ?? '',
        duration_hours: item?.duration_hours ?? 2,
        currency: item?.bookingPrice?.currency ?? item?.price.currency ?? 'USD',
        city_id: item?.city_id ?? null,
        operator_id: item?.operator_id ?? '',
        free_cancellation: item?.free_cancellation ?? false,
        cancellation_hours: item?.cancellationHours ?? 24,
        featured: false,
      });
      this.original = item ? this.payload() : null;
      this.form.markAsPristine();
  }

  payload(): CreateAttractionRequest {
    const value = this.form.getRawValue();
    return {
      name: value.name.trim(),
      description: value.description.trim(),
      ...(value.short_description.trim() ? { short_description: value.short_description.trim() } : {}),
      type: value.type,
      latitude: Number(value.latitude),
      longitude: Number(value.longitude),
      ...(value.address.trim() ? { address: value.address.trim() } : {}),
      ...(value.meeting_point.trim() ? { meeting_point: value.meeting_point.trim() } : {}),
      duration_hours: Number(value.duration_hours),
      currency: value.currency,
      city_id: Number(value.city_id),
      operator_id: value.operator_id.trim(),
      free_cancellation: value.free_cancellation,
      cancellation_hours: Number(value.cancellation_hours),
      featured: value.featured,
    };
  }

  patchPayload(): UpdateAttractionRequest {
    const body = this.payload();
    const patch: UpdateAttractionRequest = {};
    if (!this.original) return patch;
    for (const key of Object.keys(body) as (keyof CreateAttractionRequest)[]) {
      if (JSON.stringify(body[key]) !== JSON.stringify(this.original[key])) {
        Object.assign(patch, { [key]: body[key] });
      }
    }
    return patch;
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.sending() || this.loading()) return;
    if (this.form.invalid) {
      this.error.set('Completa los campos obligatorios con los valores indicados por el contrato de Atracciones.');
      return;
    }
    const existing = this.attraction();
    const patch = existing ? this.patchPayload() : null;
    if (existing && patch && !Object.keys(patch).length) {
      this.error.set('No hay cambios para guardar.');
      return;
    }
    this.error.set('');
    this.sending.set(true);
    this.form.disable();
    (existing
      ? this.api.editarAtraccion(existing.id, patch!)
      : this.api.crearAtraccion(this.payload()))
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: item => {
          this.sending.set(false);
          this.form.enable();
          this.saved.emit(item);
        },
        error: error => {
          this.sending.set(false);
          this.form.enable();
          this.error.set(this.admin.errorMessage(error));
        },
      });
  }
}

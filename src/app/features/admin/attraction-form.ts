import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Atraccion, Location, ProductType } from '../../contracts/atracciones.contracts';
import { CreateAttractionRequest, UpdateAttractionRequest } from '../../contracts/admin.contracts';
import { AtraccionesService } from '../../services/atracciones.service';
import { AdminApiService } from './admin-api.service';

const CREATE_KEYS = [
  'name', 'long_description', 'duration', 'product_type', 'includes', 'categories',
  'locations', 'photos', 'supported_languages', 'free_cancellation', 'price', 'package_prices', 'operator', 'badges',
] as const;

const integer = (control: AbstractControl) => Number.isInteger(asNumber(control.value)) ? null : { integer: true };
const positive = (control: AbstractControl) => {
  const value = asNumber(control.value);
  return value !== null && value > 0 ? null : { positive: true };
};

function asNumber(value: unknown): number | null {
  if (value === '' || value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

const photoUrls = (control: AbstractControl) => lines(String(control.value ?? '')).every((url) => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'ftp:'].includes(parsed.protocol) && !!parsed.hostname;
  } catch {
    return false;
  }
}) ? null : { urls: true };

function locationGroup(location?: Location) {
  return new FormGroup({
    address: new FormControl(location?.address ?? '', { nonNullable: true }),
    city: new FormControl<number | null>(location?.city ?? null, [Validators.required, integer]),
    country: new FormControl(location?.country ?? '', { nonNullable: true }),
    latitude: new FormControl<number | null>(location?.coordinates.latitude ?? null, [Validators.required, Validators.min(-90), Validators.max(90)]),
    longitude: new FormControl<number | null>(location?.coordinates.longitude ?? null, [Validators.required, Validators.min(-180), Validators.max(180)]),
    type: new FormControl(location?.type ?? '', { nonNullable: true }),
  });
}

function asLocation(value: unknown): Location | null {
  if (!value || typeof value !== 'object') return null;
  const location = value as Location;
  if (typeof location.address !== 'string' || typeof location.city !== 'number' || !location.coordinates) return null;
  return location;
}

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
  readonly step = signal(0);
  readonly steps = ['Información básica', 'Fotos y detalles', 'Revisar y guardar'];
  readonly typeLabels: Record<ProductType, string> = { SINGLE_TICKET: 'Entrada individual', GUIDED_TOUR: 'Tour guiado', PACKAGE: 'Paquete de actividades' };
  readonly sending = signal(false);
  readonly error = signal('');
  readonly productTypes: ProductType[] = ['SINGLE_TICKET', 'GUIDED_TOUR', 'PACKAGE'];
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] }),
    long_description: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(10)] }),
    duration: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    product_type: new FormControl<ProductType>('SINGLE_TICKET', {
      nonNullable: true,
      validators: [Validators.required, (control: AbstractControl) => this.productTypes.includes(control.value) ? null : { enum: true }],
    }),
    includes: new FormControl('', { nonNullable: true }),
    categories: new FormControl('', { nonNullable: true }),
    supported_languages: new FormControl('', { nonNullable: true }),
    photos: new FormControl('', { nonNullable: true, validators: [photoUrls] }),
    locations: new FormArray<ReturnType<typeof locationGroup>>([]),
    free_cancellation: new FormControl(true, { nonNullable: true }),
    priceEnabled: new FormControl(false, { nonNullable: true }),
    currency: new FormControl('', { nonNullable: true }),
    total: new FormControl<number | null>(null),
  });
  private original: CreateAttractionRequest | null = null;

  constructor() {
    effect(() => {
      const attraction = this.attraction();
      this.error.set('');
      this.step.set(0);
      this.form.controls.locations.clear();
      this.form.reset({
        name: attraction?.name ?? '',
        long_description: attraction?.long_description ?? '',
        duration: attraction?.duration ?? 'PT2H',
        product_type: attraction?.product_type ?? 'SINGLE_TICKET',
        includes: attraction?.includes.join('\n') ?? '',
        categories: attraction?.categories.join('\n') ?? '',
        supported_languages: attraction?.supported_languages.join('\n') ?? 'es',
        photos: (attraction?.photos as { url?: string }[] | undefined)?.map((photo) => photo.url).filter(Boolean).join('\n') ?? '',
        free_cancellation: attraction?.free_cancellation ?? true,
        priceEnabled: !!attraction?.price,
        currency: attraction?.price?.currency ?? 'USD',
        total: attraction?.price?.total ?? null,
      });
      for (const location of (attraction?.locations ?? []).map(asLocation).filter((item): item is Location => !!item)) {
        this.form.controls.locations.push(locationGroup(location));
      }
      this.original = attraction ? this.payload() : null;
      this.form.markAsPristine();
    });
  }

  nextStep() {
    if (this.sending()) return;
    const keys = this.step() === 0 ? ['name', 'long_description', 'duration', 'product_type'] as const : ['photos', 'locations'] as const;
    for (const key of keys) this.form.controls[key].markAsTouched();
    if (keys.some(key => this.form.controls[key].invalid) || (this.step() === 0 && (this.form.controls.name.value.trim().length < 3 || this.form.controls.long_description.value.trim().length < 10))) {
      this.error.set(this.step() === 0 ? 'Completa el nombre, la descripción y la duración antes de continuar.' : 'Revisa las fotografías y los datos de las ubicaciones.');
      return;
    }
    this.error.set('');
    this.step.update(value => Math.min(2, value + 1));
  }

  previousStep() {
    if (!this.sending()) { this.step.update(value => Math.max(0, value - 1)); this.error.set(''); }
  }

  durationHours(): string {
    const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(this.form.controls.duration.value);
    return match ? String(Number(match[1] ?? 0) + Number(match[2] ?? 0) / 60) : '';
  }

  setDuration(value: string) {
    const hours = Number(value);
    this.form.controls.duration.setValue(value && Number.isInteger(hours) && hours > 0 ? `PT${hours}H` : '');
    this.form.controls.duration.markAsDirty();
  }

  previewPhotos(): string[] { return lines(this.form.controls.photos.value); }

  addLocation() {
    if (!this.sending()) this.form.controls.locations.push(locationGroup());
  }

  removeLocation(index: number) {
    if (!this.sending()) this.form.controls.locations.removeAt(index);
  }

  payload(): CreateAttractionRequest {
    const value = this.form.getRawValue();
    const body: CreateAttractionRequest = {
      name: value.name.trim(),
      long_description: value.long_description.trim(),
      duration: value.duration.trim(),
      product_type: value.product_type,
      includes: lines(value.includes),
      categories: lines(value.categories),
      supported_languages: lines(value.supported_languages),
      free_cancellation: value.free_cancellation,
      photos: lines(value.photos).map((url) => ({ url })),
      locations: value.locations.map((location) => ({
        address: location.address.trim(),
        city: asNumber(location.city)!,
        country: location.country.trim(),
        coordinates: { latitude: asNumber(location.latitude)!, longitude: asNumber(location.longitude)! },
        ...(location.type.trim() ? { type: location.type.trim() } : {}),
      })),
    };
    if (value.priceEnabled) body.price = { currency: value.currency.trim(), total: asNumber(value.total)! };
    return body;
  }

  patchPayload(): UpdateAttractionRequest {
    const body = this.payload();
    const patch: UpdateAttractionRequest = {};
    if (!this.original) return patch;
    for (const key of CREATE_KEYS) {
      if (!(key in body) && !(key in this.original)) continue;
      if (body[key] !== undefined && JSON.stringify(body[key]) !== JSON.stringify(this.original[key])) {
        Object.assign(patch, { [key]: body[key] });
      }
    }
    return patch;
  }

  submit() {
    if (this.sending()) return;
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    // The API normalizes an omitted optional price to zero. A name-only PATCH
    // must preserve that existing price without forcing an unrelated change.
    const unchangedPrice = !!this.attraction() && !!this.original?.price
      && value.currency.trim() === this.original.price.currency
      && asNumber(value.total) === this.original.price.total;
    if (this.form.invalid || value.name.trim().length < 3 || value.long_description.trim().length < 10 || (value.priceEnabled && (!value.currency.trim() || (!unchangedPrice && positive(this.form.controls.total))))) {
      if (this.form.controls.name.invalid || this.form.controls.long_description.invalid || this.form.controls.duration.invalid || value.name.trim().length < 3 || value.long_description.trim().length < 10) this.step.set(0);
      else if (this.form.controls.photos.invalid || this.form.controls.locations.invalid) this.step.set(1);
      else this.step.set(2);
      this.error.set('Revisa los campos: nombre mínimo 3, descripción mínimo 10; precio positivo y ubicaciones válidas.');
      return;
    }
    const existing = this.attraction();
    if (existing && this.original?.price && !value.priceEnabled) {
      this.error.set('La edición no permite borrar el precio existente. Mantén el precio o modifica su valor.');
      return;
    }
    const patch = existing ? this.patchPayload() : this.payload();
    if (existing && !Object.keys(patch).length) {
      this.error.set('No hay cambios para guardar.');
      return;
    }
    this.error.set('');
    this.sending.set(true);
    this.form.disable();
    (existing ? this.api.editarAtraccion(existing.id, patch) : this.api.crearAtraccion(this.payload()))
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (response) => {
          this.sending.set(false);
          this.form.enable();
          this.saved.emit(response);
        },
        error: (err) => {
          this.sending.set(false);
          this.form.enable();
          this.error.set(this.admin.errorMessage(err));
        },
      });
  }
}

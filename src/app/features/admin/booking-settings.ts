import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Atraccion, BookingProfile } from '../../contracts/atracciones.contracts';
import { httpErrorMessage } from '../../core/http-errors';
import { AtraccionesService } from '../../services/atracciones.service';
import { AdminApiService } from './admin-api.service';

const DEFAULT_ITINERARY = '[]';
const DEFAULT_RATINGS = '{"limpieza":0,"servicio":0,"calidad_precio":0,"puntualidad":0}';

function jsonValue<T>(source: string, field: string): T {
  try {
    return JSON.parse(source) as T;
  } catch {
    throw new Error(`${field} debe contener JSON válido.`);
  }
}

@Component({
  selector: 'app-booking-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './booking-settings.html',
})
export class BookingSettings {
  readonly attraction = input.required<Atraccion>();
  private readonly api = inject(AtraccionesService);
  private readonly admin = inject(AdminApiService);
  private readonly destroy = inject(DestroyRef);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly isPublished = signal(false);
  readonly profileSaved = signal(false);
  readonly allowProfileSave = signal(true);
  readonly form = new FormGroup({
    city: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    currency: new FormControl('USD', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[A-Z]{3}$/)] }),
    adult: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    child: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    senior: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    infant: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    student: new FormControl<number | null>(null, [Validators.min(0)]),
    includes_food: new FormControl(false, { nonNullable: true }),
    includes_transport: new FormControl(false, { nonNullable: true }),
    includes_guide: new FormControl(false, { nonNullable: true }),
    wheelchair_accessible: new FormControl(false, { nonNullable: true }),
    service_animals_allowed: new FormControl(false, { nonNullable: true }),
    permite_paquete: new FormControl(false, { nonNullable: true }),
    schedule_times: new FormControl('', { nonNullable: true }),
    itinerary_json: new FormControl(DEFAULT_ITINERARY, { nonNullable: true, validators: [Validators.required] }),
    ratings_json: new FormControl(DEFAULT_RATINGS, { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    effect(() => this.load(this.attraction()));
  }

  private load(attraction: Atraccion): void {
    this.error.set('');
    this.message.set('');
    this.isPublished.set(attraction.status === 'PUBLICADA');
    this.profileSaved.set(false);
    this.allowProfileSave.set(attraction.status !== 'PUBLICADA');
    this.patchFromAttraction(attraction);
    this.loading.set(true);
    this.api.obtenerAtraccion(attraction.id).pipe(
      takeUntilDestroyed(this.destroy),
    ).subscribe({
      next: detail => {
        this.patchFromAttraction(detail);
        this.isPublished.set(true);
        this.allowProfileSave.set(detail.bookingProfile?.schedule_times !== undefined);
        this.loading.set(false);
      },
      error: error => {
        this.loading.set(false);
        if (error instanceof HttpErrorResponse && error.status === 404) return;
        this.error.set(this.admin.errorMessage(error));
      },
    });
  }

  private patchFromAttraction(attraction: Atraccion): void {
    const profile = attraction.bookingProfile;
    this.form.patchValue({
      city: profile?.city ?? attraction.city ?? '',
      currency: profile?.price.currency ?? attraction.bookingPrice?.currency ?? 'USD',
      adult: profile?.price.adult ?? attraction.bookingPrice?.adult ?? 0,
      child: profile?.price.child ?? attraction.bookingPrice?.child ?? 0,
      senior: profile?.price.senior ?? attraction.bookingPrice?.senior ?? 0,
      infant: profile?.price.infant ?? attraction.bookingPrice?.infant ?? 0,
      student: profile?.price.student ?? attraction.bookingPrice?.student ?? null,
      includes_food: profile?.inclusions.includes_food ?? attraction.bookingInclusions?.includes_food ?? false,
      includes_transport: profile?.inclusions.includes_transport ?? attraction.bookingInclusions?.includes_transport ?? false,
      includes_guide: profile?.inclusions.includes_guide ?? attraction.bookingInclusions?.includes_guide ?? false,
      wheelchair_accessible: profile?.accessibility?.wheelchair_accessible ?? attraction.accessibility?.wheelchair_accessible ?? false,
      service_animals_allowed: profile?.accessibility?.service_animals_allowed ?? attraction.accessibility?.service_animals_allowed ?? false,
      permite_paquete: profile?.permite_paquete ?? attraction.bookingEnabled ?? false,
      schedule_times: (profile?.schedule_times ?? []).map(time => time.slice(0, 5)).join('\n'),
      itinerary_json: JSON.stringify(profile?.itinerary ?? attraction.itinerary ?? [], null, 2),
      ratings_json: JSON.stringify(profile?.ratings_breakdown ?? attraction.ratingsBreakdown ?? {
        limpieza: 0, servicio: 0, calidad_precio: 0, puntualidad: 0,
      }, null, 2),
    });
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.busy() || this.loading() || !this.allowProfileSave()) return;
    if (this.form.invalid) {
      this.error.set('Revisa ciudad, moneda y tarifas; los valores numéricos no pueden ser negativos.');
      return;
    }

    const value = this.form.getRawValue();
    let itinerary: BookingProfile['itinerary'];
    let ratingsBreakdown: Record<string, number>;
    try {
      itinerary = jsonValue<BookingProfile['itinerary']>(value.itinerary_json, 'El itinerario');
      ratingsBreakdown = jsonValue<Record<string, number>>(value.ratings_json, 'Las calificaciones');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'El perfil Booking no tiene un formato válido.');
      return;
    }
    if (!Array.isArray(itinerary) || itinerary.some(stop =>
      !Number.isInteger(stop.stop_number) || stop.stop_number < 1
      || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(stop.time) || !stop.title.trim()
      || !Number.isInteger(stop.duration_minutes) || stop.duration_minutes < 1,
    )) {
      this.error.set('Cada parada requiere stop_number, hora HH:MM, título y duración en minutos.');
      return;
    }
    if (!ratingsBreakdown || Array.isArray(ratingsBreakdown)
      || Object.values(ratingsBreakdown).some(score => typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 10)) {
      this.error.set('Las calificaciones deben ser un objeto JSON con puntajes numéricos de 0 a 10.');
      return;
    }
    const times = value.schedule_times.split(/\r?\n/).map(time => time.trim()).filter(Boolean);
    if (times.some(time => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      this.error.set('Los horarios deben usar formato HH:MM, uno por línea.');
      return;
    }

    const profile: BookingProfile = {
      city: value.city.trim(),
      price: {
        currency: value.currency,
        adult: value.adult,
        child: value.child,
        senior: value.senior,
        infant: value.infant,
        ...(value.student === null ? {} : { student: value.student }),
      },
      inclusions: {
        includes_food: value.includes_food,
        includes_transport: value.includes_transport,
        includes_guide: value.includes_guide,
      },
      itinerary,
      ratings_breakdown: ratingsBreakdown,
      accessibility: {
        wheelchair_accessible: value.wheelchair_accessible,
        service_animals_allowed: value.service_animals_allowed,
      },
      permite_paquete: value.permite_paquete,
      schedule_times: times.map(time => `${time}:00`),
    };

    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    this.api.guardarPerfilBooking(this.attraction().id, profile).pipe(
      takeUntilDestroyed(this.destroy),
    ).subscribe({
      next: () => {
        this.busy.set(false);
        this.profileSaved.set(true);
        this.message.set('Perfil Booking guardado. La búsqueda por fecha usa estos horarios junto con el aforo recibido desde Inventory.');
      },
      error: error => {
        this.busy.set(false);
        this.error.set(this.admin.errorMessage(error));
      },
    });
  }

  publish(): void {
    if (this.busy() || !this.profileSaved() || this.isPublished()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.actualizarEstado(this.attraction().id, 'PUBLICADA').pipe(
      takeUntilDestroyed(this.destroy),
    ).subscribe({
      next: () => {
        this.busy.set(false);
        this.isPublished.set(true);
        this.message.set('Atracción publicada. Ya puede aparecer en las búsquedas públicas cuando tenga aforo disponible.');
      },
      error: error => {
        this.busy.set(false);
        this.error.set(this.admin.errorMessage(error));
      },
    });
  }
}

import { photosOf } from '../../contracts/attraction-view';
import { reservationTotal } from '../../utils/reservation-total';
import { httpErrorMessage } from '../../core/http-errors';
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, filter, forkJoin, fromEvent, map, merge, of, Subject, switchMap, tap, timeout, timer } from 'rxjs';
import { Atraccion, DisponibilidadAtraccion, PaqueteExperiencia } from '../../contracts/atracciones.contracts';
import { AtraccionesService } from '../../services/atracciones.service';
import { BookingNavigationService } from '../../services/booking-navigation.service';
import { ObservabilityService } from '../../services/observability.service';
import { ReservasService } from '../../services/reservas.service';
const integer = Validators.pattern(/^\d+$/);
interface AvailabilityQuery { id: string; date: string; productType: PaqueteExperiencia['tipo_experiencia']; time?: string }
@Component({
  selector: 'app-attraction-detail', standalone: true,
  imports: [RouterLink, CurrencyPipe, ReactiveFormsModule], templateUrl: './attraction-detail.html',
})
export class AttractionDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(AtraccionesService);
  private readonly booking = inject(BookingNavigationService);
  private readonly observability = inject(ObservabilityService);
  private readonly reservas = inject(ReservasService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly availabilityQueries = new Subject<AvailabilityQuery | null>();
  private readonly bookingRefreshes = new Subject<void>();
  protected readonly attraction = signal<Atraccion | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly error = signal('');
  protected readonly packagesError = signal('');
  protected readonly packagesRefreshing = signal(false);
  protected readonly packages = signal<PaqueteExperiencia[]>([]);
  protected readonly selectedPackage = signal<PaqueteExperiencia | null>(null);
  protected readonly availability = signal<DisponibilidadAtraccion | null>(null);
  protected readonly availabilityLoading = signal(false);
  protected readonly availabilityError = signal('');
  protected readonly minDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  protected readonly scheduleForm = new FormGroup({
    date: new FormControl(this.minDate, { nonNullable: true, validators: [Validators.required, control => control.value < this.minDate ? { pastDate: true } : null] }),
    time: new FormControl('', { nonNullable: true, validators: Validators.required }),
  });
  protected readonly participantsForm = new FormGroup({
    num_adultos: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0), integer] }),
    num_ninos: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0), integer] }),
    ninos: new FormArray<FormControl<number | null>>([]),
  });
  private readonly participantValues = toSignal(this.participantsForm.valueChanges, { initialValue: this.participantsForm.value });
  private readonly scheduleValues = toSignal(this.scheduleForm.valueChanges, { initialValue: this.scheduleForm.value });
  protected readonly adults = computed(() => this.participantValues().num_adultos ?? 0);
  protected readonly children = computed(() => this.participantValues().num_ninos ?? 0);
  protected readonly quantity = computed(() => this.adults() + this.children());
  protected readonly total = computed(() => {
    const pkg = this.selectedPackage();
    const values = this.participantValues();
    return pkg ? reservationTotal(pkg, values.num_adultos ?? 0, values.ninos ?? []) : null;
  });
  protected readonly date = computed(() => this.scheduleValues().date ?? '');
  protected readonly selectedTime = computed(() => this.scheduleValues().time ?? '');
  protected readonly images = computed(() => this.attraction() ? photosOf(this.attraction()!).map(photo => photo.url) : []);
  protected readonly freeChildAge = computed(() => {
    const raw = this.selectedPackage()?.politicas_json['edad_nino_gratis_hasta'];
    if (raw === undefined) return null;
    const age = Number(raw);
    return Number.isInteger(age) && age >= 0 && age <= 17 ? age : null;
  });
  protected policiesOf(pkg: PaqueteExperiencia): string[] {
    const policies = pkg.politicas_json;
    const lines: string[] = [];
    const cancellation = policies['cancelacion'];
    if (cancellation && typeof cancellation === 'object' && !Array.isArray(cancellation)) {
      const rule = cancellation as Record<string, unknown>;
      if (rule['permitida'] === false) lines.push('Este paquete no permite cancelaciones.');
      if (rule['permitida'] === true) {
        const hours = rule['horas_antes'];
        lines.push(typeof hours === 'number' && Number.isFinite(hours) && hours >= 0
          ? `Cancelación permitida hasta ${hours} horas antes.` : 'Este paquete permite cancelaciones.');
      }
    }
    const freeAge = policies['edad_nino_gratis_hasta'];
    if (typeof freeAge === 'number' && Number.isInteger(freeAge) && freeAge >= 0 && freeAge <= 17)
      lines.push(`Niños hasta ${freeAge} años tienen tarifa gratuita.`);
    // Display textual information supplied by the server without exposing its JSON structure.
    for (const [key, value] of Object.entries(policies)) {
      if (key !== 'cancelacion' && key !== 'edad_nino_gratis_hasta' && typeof value === 'string') lines.push(value);
    }
    return lines;
  }
  protected readonly advanceMessage = computed(() => {
    this.participantValues(); this.scheduleValues();
    if (!this.selectedPackage()) return 'Selecciona un paquete para elegir fecha y participantes.';
    if (this.packagesRefreshing()) return 'Actualizando experiencias y disponibilidad.';
    if (this.packagesError()) return 'Reintenta la consulta de experiencias.';
    if (this.scheduleForm.controls.date.invalid) return 'Selecciona una fecha válida.';
    if (this.availabilityLoading()) return 'Espera la consulta de disponibilidad.';
    if (this.availabilityError()) return 'Reintenta la consulta de disponibilidad.';
    if (!this.selectedTime()) return 'Selecciona un horario disponible.';
    if (this.participantMessage()) return this.participantMessage();
    if (this.participantsForm.invalid) return 'Revisa los participantes y completa la edad de cada niño (0 a 17 años).';
    return '';
  });
  protected readonly participantMessage = computed(() => {
    const pkg = this.selectedPackage(); const total = this.quantity();
    if (!pkg) return 'Selecciona una experiencia.';
    if (total < pkg.min_participantes) return `Se requieren al menos ${pkg.min_participantes} participantes.`;
    if (pkg.max_participantes !== null && total > pkg.max_participantes) return `El paquete admite como máximo ${pkg.max_participantes} participantes.`;
    if (this.availability() && total > this.availability()!.available_spots) return 'No hay suficientes cupos para todos los participantes.';
    return '';
  });
  protected readonly canAdvance = computed(() => {
    this.participantValues(); this.scheduleValues();
    return Boolean(this.selectedPackage() && this.participantsForm.valid && this.scheduleForm.valid && !this.participantMessage()
      && !this.packagesRefreshing() && !this.packagesError() && !this.availabilityLoading() && !this.availabilityError() && this.availability()?.times.includes(this.selectedTime())
      && this.availability()!.available_spots >= this.quantity());
  });
  ngOnInit(): void {
    this.availabilityQueries.pipe(
      switchMap(query => {
        if (!query?.time) this.availability.set(null);
        this.availabilityError.set(''); this.availabilityLoading.set(Boolean(query));
        if (!query) return of(null);
        return this.service.obtenerDisponibilidad(query.id, query.date, query.productType, query.time).pipe(
          timeout({ first: 10000 }),
          map(result => ({ query, result, error: '' })),
          catchError(error => of({ query, result: null, error: httpErrorMessage(error) })),
        );
      }), takeUntilDestroyed(this.destroyRef),
    ).subscribe(response => {
      if (!response) return;
      this.availabilityLoading.set(false);
      this.availabilityError.set(response.error);
      this.availability.set(response.result);
      if (!response.result) return;
      const times = response.result.times;
      if (!response.query.time && times.length) {
        this.scheduleForm.controls.time.setValue(times[0]);
        this.loadAvailability();
      } else if (response.query.time && !times.includes(response.query.time)) {
        this.scheduleForm.controls.time.setValue('');
      }
    });
    this.participantsForm.controls.num_ninos.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(count => this.resizeChildren(count));
    this.reservas.disponibilidadCambiada$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(id => {
      if (this.attraction()?.id === id) this.loadAvailability();
    });
    this.route.paramMap.pipe(
      tap(() => {
        this.loading.set(true); this.error.set(''); this.notFound.set(false); this.packagesError.set(''); this.packagesRefreshing.set(false);
        this.attraction.set(null); this.packages.set([]); this.selectedPackage.set(null);
        this.availabilityQueries.next(null); this.scheduleForm.controls.time.setValue('');
      }),
      switchMap(params => forkJoin({
        attraction: this.service.obtenerAtraccion(params.get('id') ?? ''),
        packages: this.service.obtenerPaquetes(params.get('id') ?? '').pipe(
          map(packages => ({ packages, error: '' })), catchError(error => of({ packages: [] as PaqueteExperiencia[], error: httpErrorMessage(error) })),
        ),
      }).pipe(catchError(error => {
        this.notFound.set(error instanceof HttpErrorResponse && error.status === 404);
        this.error.set(httpErrorMessage(error)); return of(null);
      }))), takeUntilDestroyed(this.destroyRef),
    ).subscribe(response => {
      this.loading.set(false);
      if (!response) return;
      this.attraction.set(response.attraction); this.packages.set(response.packages.packages); this.packagesError.set(response.packages.error);
      if (response.packages.packages.length === 1) this.choose(response.packages.packages[0]);
      this.observability.trackEvent('VIEW_ATTRACTION', { attractionId: response.attraction.id, attractionName: response.attraction.name });
    });
    merge(
      timer(15000, 15000),
      this.bookingRefreshes,
      fromEvent(window, 'focus'),
      fromEvent(document, 'visibilitychange').pipe(filter(() => document.visibilityState === 'visible')),
    ).pipe(
      filter(() => document.visibilityState !== 'hidden' && !!this.attraction() && !this.loading()),
      switchMap(() => {
        const id = this.attraction()!.id;
        this.packagesRefreshing.set(true);
        return this.service.obtenerPaquetes(id).pipe(
          timeout({ first: 10000 }),
          map(packages => ({ id, packages, error: '' })),
          catchError(error => of({ id, packages: null, error: httpErrorMessage(error) })),
        );
      }), takeUntilDestroyed(this.destroyRef),
    ).subscribe(response => {
      if (response.id !== this.attraction()?.id) return;
      this.packagesRefreshing.set(false);
      this.packagesError.set(response.error);
      if (!response.packages) return;
      const previous = this.selectedPackage();
      this.packages.set(response.packages);
      const selected = response.packages.find(pkg => pkg.id === previous?.id);
      if (selected) this.choose(selected, false);
      else if (response.packages.length === 1) this.choose(response.packages[0]);
      else {
        this.selectedPackage.set(null);
        this.participantsForm.clearValidators();
        this.participantsForm.updateValueAndValidity();
        this.scheduleForm.controls.time.setValue('');
        this.availabilityQueries.next(null);
      }
    });
  }
  protected refreshBooking(): void { this.bookingRefreshes.next(); }
  private resizeChildren(count: number): void {
    const ages = this.participantsForm.controls.ninos;
    if (!Number.isInteger(count) || count < 0) { ages.clear(); return; }
    while (ages.length > count) ages.removeAt(ages.length - 1);
    while (ages.length < count) ages.push(new FormControl<number | null>(null, [Validators.required, Validators.min(0), Validators.max(17), integer]));
  }
  protected nameOf(item: Atraccion): string { return item.name; }
  protected cityOf(item: Atraccion): string { return item.provincia; }
  protected provinceOf(item: Atraccion): string { return item.provincia; }
  protected categoryOf(item: Atraccion): string { return item.categoria; }
  protected includesOf(item: Atraccion): string[] { return item.includes; }
  protected choose(pkg: PaqueteExperiencia, resetSchedule = true): void {
    if (!this.packages().some(candidate => candidate.id === pkg.id)) return;
    this.selectedPackage.set(pkg);
    this.participantsForm.setValidators(control => {
      const pkg = this.selectedPackage()!;
      if (!pkg) return null;
      const count = control.get('num_adultos')!.value + control.get('num_ninos')!.value;
      return count < pkg.min_participantes ? { minimumParticipants: true }
        : pkg.max_participantes !== null && count > pkg.max_participantes ? { maximumParticipants: true } : null;
    });
    this.participantsForm.updateValueAndValidity();
    if (resetSchedule) this.scheduleForm.controls.time.setValue('');
    this.loadAvailability();
    if (resetSchedule) this.observability.trackEvent('SELECT_PACKAGE', { attractionId: this.attraction()?.id, packageId: pkg.id, productType: pkg.tipo_experiencia });
  }
  protected decrementAdult(): void { this.participantsForm.controls.num_adultos.setValue(Math.max(0, this.adults() - 1)); }
  protected incrementAdult(): void { this.participantsForm.controls.num_adultos.setValue(this.adults() + 1); }
  protected decrementChild(): void { this.participantsForm.controls.num_ninos.setValue(Math.max(0, this.children() - 1)); }
  protected incrementChild(): void { this.participantsForm.controls.num_ninos.setValue(this.children() + 1); }
  protected loadAvailability(): void {
    const item = this.attraction(); const pkg = this.selectedPackage();
    if (!item || !pkg || this.scheduleForm.controls.date.invalid) { this.availabilityQueries.next(null); return; }
    this.availabilityQueries.next({ id: item.id, date: this.date(), productType: pkg.tipo_experiencia, time: this.selectedTime() || undefined });
  }
  protected selectTime(time: string): void { this.scheduleForm.controls.time.setValue(time); this.loadAvailability(); }
  protected selectDate(date: string): void { this.scheduleForm.controls.date.setValue(date); this.scheduleForm.controls.time.setValue(''); this.loadAvailability(); }
  protected next(): void {
    this.participantsForm.markAllAsTouched(); this.scheduleForm.markAllAsTouched();
    if (!this.canAdvance()) return;
    const pkg = structuredClone(this.selectedPackage()!);
    this.booking.requestBooking(this.attraction()!, {
      experience: pkg, product_type: pkg.tipo_experiencia, date: this.date(), time: this.selectedTime(),
      num_adultos: this.adults(), ninos: this.participantsForm.controls.ninos.getRawValue().map(edad => ({ edad: edad! })),
    });
  }
}

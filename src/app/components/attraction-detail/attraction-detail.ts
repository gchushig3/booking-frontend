import { CurrencyPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Atraccion, AtraccionesService, DisponibilidadAtraccion, ProductType } from '../../services/atracciones.service';
import { BookingNavigationService } from '../../services/booking-navigation.service';
import { ObservabilityService } from '../../services/observability.service';
import { ReservasService } from '../../services/reservas.service';

const PACKAGES: { type: ProductType; name: string; description: string }[] = [
  { type: 'SINGLE_TICKET', name: 'Básico · Entrada general', description: 'Entrada general con acceso a las instalaciones.' },
  { type: 'GUIDED_TOUR', name: 'Tour guiado', description: 'Incluye guía especializado y recorrido completo.' },
  { type: 'PACKAGE', name: 'Paquete completo', description: 'Experiencia guiada con accesos VIP o actividad extra según lo incluido por el operador.' },
];

@Component({
  selector: 'app-attraction-detail', standalone: true, imports: [RouterLink, CurrencyPipe], templateUrl: './attraction-detail.html',
})
export class AttractionDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(AtraccionesService);
  private readonly booking = inject(BookingNavigationService);
  private readonly observability = inject(ObservabilityService);
  private readonly reservas = inject(ReservasService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly attraction = signal<Atraccion | null>(null);
  protected readonly loading = signal(true);
  protected readonly date = signal(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
  protected readonly availability = signal<DisponibilidadAtraccion | null>(null);
  protected readonly availabilityLoading = signal(false);
  protected readonly selectedType = signal<ProductType | null>(null);
  protected readonly adults = signal(0);
  protected readonly children = signal(0);
  protected readonly quantity = computed(() => this.adults() + this.children());
  protected readonly selectedTime = signal('');
  protected readonly error = signal('');
  protected readonly packages = PACKAGES;
  protected readonly guidedGroupLimit = 10;
  protected readonly minimumQuantity = computed(() => this.selectedType() === 'GUIDED_TOUR' ? 2 : 1);
  protected readonly maximumQuantity = computed(() => {
    const spots = this.availability()?.available_spots ?? 0;
    return this.selectedType() === 'GUIDED_TOUR' ? Math.min(spots, this.guidedGroupLimit) : spots;
  });
  protected readonly quantityValid = computed(() => this.adults() >= 1 && this.quantity() >= this.minimumQuantity() && this.quantity() <= this.maximumQuantity());
  protected readonly totalPrice = computed(() => {
    const item = this.attraction();
    const type = this.selectedType();
    if (!item || !type) return 0;
    if (type === 'GUIDED_TOUR') return Math.floor(this.adults() / 2) * 57 + (this.adults() % 2) * 50;
    return this.priceOf(item, type) * this.adults();
  });
  protected readonly currencyCode = computed(() => {
    const item = this.attraction();
    const type = this.selectedType();
    return (type && item?.package_prices?.[type]?.currency) || item?.price?.currency || 'USD';
  });
  protected readonly minDate = this.date();
  protected readonly images = computed(() => {
    const attraction = this.attraction();
    return attraction ? [...(attraction.images ?? []), ...(attraction.photos ?? [])].map((photo) => photo.url).filter(Boolean) : [];
  });

  ngOnInit(): void {
    this.reservas.reservaConfirmada$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ attractionId, date, time }) => {
      const item = this.attraction();
      if (!item || item.id !== attractionId || this.date() !== date) return;
      if (time && this.selectedTime() !== time) return;
      this.loadAvailability();
    });
    this.service.obtenerAtracciones().subscribe({
      next: (items) => {
        const attraction = items.find((item) => item.id === this.route.snapshot.paramMap.get('id')) ?? null;
        this.attraction.set(attraction);
        if (attraction?.product_type) this.selectedType.set(attraction.product_type);
        if (attraction) this.observability.trackEvent('VIEW_ATTRACTION', { attractionId: attraction.id, attractionName: this.nameOf(attraction) });
        this.loading.set(false);
        if (attraction) this.loadAvailability();
      },
      error: () => { this.error.set('No se pudo cargar la ficha de la atracción.'); this.loading.set(false); },
    });
  }

  protected nameOf(item: Atraccion): string { return item.name ?? item.nombre ?? 'Atracción'; }
  protected cityOf(item: Atraccion): string { return item.ciudad ?? item.locations?.find((location) => location.city)?.city ?? 'Ecuador'; }
  protected provinceOf(item: Atraccion): string {
    const text = `${item.region ?? ''} ${this.cityOf(item)} ${item.locations?.map((location) => location.address ?? '').join(' ') ?? ''}`.toLowerCase();
    return ['Guayas', 'Pichincha', 'Azuay', 'Manabí', 'Tungurahua', 'Imbabura', 'Napo', 'Pastaza', 'Cotopaxi', 'Esmeraldas', 'Chimborazo', 'Galápagos'].find((province) => text.includes(province.toLowerCase())) ?? this.cityOf(item);
  }
  protected categoryOf(item: Atraccion): string { return item.categories?.[0]?.replaceAll('_', ' ') ?? 'Experiencia'; }
  protected priceOf(item: Atraccion, type: ProductType): number {
    const base = Number(item.price?.total ?? item.precioTicket ?? 0);
    const multiplier: Record<ProductType, number> = { SINGLE_TICKET: 1, GUIDED_TOUR: 1.5, PACKAGE: 2 };
    const configured = item.package_prices ?? {};
    const single = Number(configured.SINGLE_TICKET?.total ?? base);
    const guided = Math.max(Number(configured.GUIDED_TOUR?.total ?? base * multiplier.GUIDED_TOUR), single + 0.01);
    const complete = Math.max(Number(configured.PACKAGE?.total ?? base * multiplier.PACKAGE), guided + 0.01);
    return Math.round(({ SINGLE_TICKET: single, GUIDED_TOUR: guided, PACKAGE: complete })[type] * 100) / 100;
  }
  protected priceLabel(item: Atraccion, type: ProductType): string {
    const configured = item.package_prices?.[type];
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: configured?.currency ?? item.price?.currency ?? 'USD' }).format(this.priceOf(item, type));
  }
  protected totalPriceLabel(item: Atraccion, type: ProductType, quantity: number): string {
    const currency = item.package_prices?.[type]?.currency ?? item.price?.currency ?? 'USD';
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency }).format(this.priceOf(item, type) * quantity);
  }
  protected includesOf(item: Atraccion): string[] { return item.includes?.length ? item.includes : ['Acceso a las instalaciones']; }
  protected choose(type: ProductType): void {
    if (this.selectedType() !== type) {
      this.adults.set(type === 'GUIDED_TOUR' ? 2 : 1);
      this.children.set(0);
    }
    this.selectedType.set(type);
    this.selectedTime.set('');
    this.trackPackageSelection(type);
    this.error.set('');
    this.loadAvailability();
  }
  protected decrementAdult(): void {
    const groupMinimum = this.selectedType() === 'GUIDED_TOUR' ? 2 : 1;
    if (this.quantity() <= groupMinimum || this.adults() <= 0) return;
    this.adults.update((value) => value - 1);
  }
  protected incrementAdult(): void {
    if (this.quantity() >= this.maximumQuantity()) { this.trackCapacityAttempt(); return; }
    if (this.quantity() < this.maximumQuantity()) {
      this.adults.update((value) => value + 1);
      this.trackPackageSelection();
    }
  }
  protected decrementChild(): void {
    const groupMinimum = this.selectedType() === 'GUIDED_TOUR' ? 2 : 1;
    if (this.quantity() <= groupMinimum || this.children() <= 0) return;
    this.children.update((value) => value - 1);
    this.trackPackageSelection();
  }
  protected incrementChild(): void {
    if (this.quantity() >= this.maximumQuantity()) { this.trackCapacityAttempt(); return; }
    if (this.quantity() < this.maximumQuantity()) {
      this.children.update((value) => value + 1);
      this.trackPackageSelection();
    }
  }
  private trackPackageSelection(type = this.selectedType()): void {
    if (!type) return;
    this.observability.trackEvent('SELECT_PACKAGE', {
      attractionId: this.attraction()?.id,
      tipoExperiencia: type,
      adultCount: this.adults(),
      childCount: this.children(),
      ticketCount: this.quantity(),
    });
  }
  private trackCapacityAttempt(): void {
    this.observability.track('booking', 'capacity_selection_rejected', { attractionId: this.attraction()?.id, date: this.date(), time: this.selectedTime(), requestedCount: this.quantity() + 1, availableSpots: this.maximumQuantity() });
  }
  protected loadAvailability(): void {
    const item = this.attraction();
    if (!item || !this.date()) return;
    const requestedTime = this.selectedTime();
    this.availabilityLoading.set(true); this.availability.set(null);
    this.service.obtenerDisponibilidad(item.id, this.date(), this.selectedType() ?? undefined, requestedTime || undefined).subscribe({
      next: (result) => {
        this.availability.set(result);
        if (!requestedTime && result.times?.[0]) {
          this.selectedTime.set(result.times[0]);
          this.loadAvailability();
          return;
        }
        if (requestedTime && result.times?.length && !result.times.includes(requestedTime)) {
          this.selectedTime.set(result.times[0]);
          this.loadAvailability();
          return;
        }
        this.selectedTime.set(requestedTime && result.times?.includes(requestedTime) ? requestedTime : result.times?.[0] ?? '');
        if (result.available_spots === 0) this.observability.track('booking', 'slot_sold_out', { attractionId: item.id, date: this.date(), time: this.selectedTime(), productType: this.selectedType() ?? undefined });
        const maximum = this.selectedType() === 'GUIDED_TOUR' ? Math.min(result.available_spots, this.guidedGroupLimit) : result.available_spots;
        if (this.quantity() > maximum) {
          const excess = this.quantity() - maximum;
          const removedChildren = Math.min(this.children(), excess);
          this.children.update((value) => value - removedChildren);
          this.adults.update((value) => Math.max(0, value - (excess - removedChildren)));
        }
        this.availabilityLoading.set(false);
      },
      error: () => { this.availability.set(null); this.availabilityLoading.set(false); this.error.set('No se pudo consultar la disponibilidad para esta fecha.'); },
    });
  }
  protected selectTime(time: string): void {
    this.selectedTime.set(time);
    this.loadAvailability();
  }
  protected selectDate(date: string): void {
    this.date.set(date);
    this.selectedTime.set('');
    this.loadAvailability();
  }
  protected next(): void {
    const item = this.attraction();
    if (!item || !this.selectedType() || !this.quantityValid() || !this.date() || !this.selectedTime()) return;
    this.booking.requestBooking(item, {
      date: this.date(), time: this.selectedTime(), ticket_count: this.quantity(), product_type: this.selectedType()!,
      adult_count: this.adults(), child_count: this.children(), checkout_total: this.totalPrice(),
    });
  }
}

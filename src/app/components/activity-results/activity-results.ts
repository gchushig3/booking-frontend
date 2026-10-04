import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { Atraccion, AtraccionesService } from '../../services/atracciones.service';
import { ObservabilityService } from '../../services/observability.service';

type SortOption = 'featured' | 'price' | 'rating';

@Component({
  selector: 'app-activity-results',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './activity-results.html',
})
export class ActivityResults {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly attractionsService = inject(AtraccionesService);
  private readonly observability = inject(ObservabilityService);
  protected readonly attractions = signal<Atraccion[]>([]);
  protected readonly loading = signal(true);
  protected readonly searching = signal(false);
  protected readonly availabilityLoading = signal(false);
  protected readonly destination = signal('');
  protected readonly date = signal('');
  protected readonly searchText = signal('');
  protected readonly availableIds = signal<string[] | null>(null);
  protected readonly selectedCities = signal<string[]>([]);
  protected readonly selectedCategories = signal<string[]>([]);
  protected readonly sort = signal<SortOption>('featured');
  protected readonly categories = ['Tours', 'Naturaleza y aire libre', 'Museos y cultura'];
  protected readonly provinceNames = ['Pichincha', 'Guayas', 'Imbabura', 'Tungurahua', 'Galápagos', 'Napo', 'Azuay', 'Manabí', 'Pastaza', 'Cotopaxi', 'Esmeraldas', 'Chimborazo'];

  protected readonly results = computed(() => {
    const query = this.normalize(this.destination());
    const selectedCities = this.selectedCities();
    const categories = this.selectedCategories();
    const filtered = this.attractions().filter((attraction) => {
      const city = this.cityOf(attraction);
      const searchable = this.normalize([
        attraction.name, attraction.nombre, attraction.ciudad, attraction.region,
        ...(attraction.locations ?? []).flatMap((location) => [location.city, location.address]),
        attraction.long_description, attraction.descripcion,
      ].filter(Boolean).join(' '));
      return (!query || searchable.includes(query) || this.normalize(this.provinceOf(attraction) ?? '').includes(query)) &&
        (!this.availableIds() || this.availableIds()!.includes(attraction.id)) &&
        (selectedCities.length === 0 || selectedCities.includes(city)) &&
        (categories.length === 0 || categories.some((category) => this.categoryMatches(attraction, category)));
    });
    return filtered.sort((a, b) => {
      if (this.sort() === 'price') return this.price(a) - this.price(b);
      if (this.sort() === 'rating') return (b.ratings?.score ?? 0) - (a.ratings?.score ?? 0);
      return (b.ratings?.number_of_reviews ?? 0) - (a.ratings?.number_of_reviews ?? 0) || (b.ratings?.score ?? 0) - (a.ratings?.score ?? 0);
    });
  });
  protected readonly cities = computed(() => [...new Set(this.attractions()
    .filter((attraction) => !this.destination() || this.normalize(this.provinceOf(attraction) ?? '') === this.normalize(this.destination()) || this.normalize(this.cityOf(attraction)).includes(this.normalize(this.destination())))
    .map((attraction) => this.cityOf(attraction)).filter(Boolean))].sort());

  ngOnInit(): void {
    this.attractionsService.obtenerAtracciones().subscribe({
      next: (attractions) => {
        this.attractions.set(attractions);
        this.loading.set(false);
        this.readQuery();
      },
      error: () => this.loading.set(false),
    });
    this.route.queryParamMap.subscribe(() => this.readQuery());
  }

  protected search(): void {
    const destino = this.searchText().trim();
    if (this.searching()) return;
    this.observability.trackEvent('SEARCH', { destination: destino || null, date: this.date() || null, action: 'search_submitted' });
    this.searching.set(true);
    void this.router.navigate(['/actividades'], { queryParams: { destino: destino || null, fecha: this.date() || null } })
      .finally(() => this.searching.set(false));
  }
  protected toggleCity(city: string): void {
    this.selectedCities.update((selected) => selected.includes(city) ? selected.filter((item) => item !== city) : [...selected, city]);
  }
  protected toggleCategory(category: string): void {
    this.selectedCategories.update((selected) => selected.includes(category) ? selected.filter((item) => item !== category) : [...selected, category]);
  }
  protected book(attraction: Atraccion): void { void this.router.navigate(['/actividades', attraction.id]); }
  protected cityOf(attraction: Atraccion): string { return attraction.ciudad ?? attraction.locations?.find((location) => location.city)?.city ?? 'Ecuador'; }
  protected nameOf(attraction: Atraccion): string { return attraction.name ?? attraction.nombre ?? 'Experiencia'; }
  protected imageOf(attraction: Atraccion): string {
    return attraction.images?.[0]?.url ?? attraction.photos?.[0]?.url ?? 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=900&q=85';
  }
  protected priceLabel(attraction: Atraccion): string {
    if (attraction.price?.total == null && attraction.precioTicket == null) return 'Consultar precio';
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: attraction.price?.currency ?? 'USD' }).format(this.price(attraction));
  }
  protected ratingLabel(attraction: Atraccion): string {
    const score = Number(attraction.ratings?.score ?? 0);
    return score > 0 ? score.toFixed(1) : 'Nuevo';
  }
  protected ratingDescription(attraction: Atraccion): string {
    const score = Number(attraction.ratings?.score ?? 0);
    return score >= 8.5 ? 'Muy bien' : score > 0 ? 'Bien' : 'Sin comentarios';
  }
  protected categoryOf(attraction: Atraccion): string {
    const text = this.normalize([attraction.product_type, ...(attraction.categories ?? []), attraction.name, attraction.long_description].filter(Boolean).join(' '));
    if (/museum|museo|culture|cultura|historia/.test(text)) return 'Museos y cultura';
    if (/nature|naturaleza|wildlife|fauna|forest|bosque|cascada|volcan/.test(text)) return 'Naturaleza y aire libre';
    return 'Tours';
  }
  protected durationOf(attraction: Atraccion): string {
    if (attraction.duration) return attraction.duration.replace(/^PT/i, '').replace('H', ' h ').replace('M', ' min').trim();
    const hours = Number(attraction.duracionHoras ?? 0);
    return hours ? `${hours} ${hours === 1 ? 'hora' : 'horas'}` : 'Duración variable';
  }
  private price(attraction: Atraccion): number { return Number(attraction.price?.total ?? attraction.precioTicket ?? 0); }

  private readQuery(): void {
    const params = this.route.snapshot.queryParamMap;
    this.destination.set(params.get('destino') ?? '');
    this.searchText.set(params.get('destino') ?? '');
    const date = params.get('fecha') ?? '';
    this.date.set(date);
    this.availableIds.set(null);
    if (!date || this.attractions().length === 0) return;
    const attractions = this.attractions();
    const requests = attractions.map((attraction) => this.attractionsService.obtenerDisponibilidad(attraction.id, date).pipe(catchError(() => of(null))));
    if (!requests.length) { this.availableIds.set([]); return; }
    this.availabilityLoading.set(true);
    forkJoin(requests).subscribe((availability) => {
      this.availableIds.set(availability.flatMap((item, index) => item && item.available_spots > 0 ? [attractions[index].id] : []));
      this.availabilityLoading.set(false);
    });
  }

  private provinceOf(attraction: Atraccion): string | null {
    if (attraction.provincia?.trim()) return attraction.provincia.trim();
    const text = this.normalize([attraction.provincia, attraction.region, attraction.ciudad, attraction.name, attraction.nombre,
      ...(attraction.locations ?? []).flatMap((location) => [location.city, location.address])].filter(Boolean).join(' '));
    const province = this.provinceNames.find((name) => text.includes(this.normalize(name)));
    if (province) return province;
    const cityToProvince: Record<string, string> = {
      quito: 'Pichincha', cayambe: 'Pichincha', mindo: 'Pichincha', guayaquil: 'Guayas', ibarra: 'Imbabura', otavalo: 'Imbabura',
      ambato: 'Tungurahua', banos: 'Tungurahua', 'puerto ayora': 'Galápagos', galapagos: 'Galápagos', tena: 'Napo', cuenca: 'Azuay',
      manta: 'Manabí', portoviejo: 'Manabí', montanita: 'Manabí', puyo: 'Pastaza', latacunga: 'Cotopaxi', esmeraldas: 'Esmeraldas', riobamba: 'Chimborazo',
      'santa cruz': 'Galápagos', 'san cristobal': 'Galápagos', isabela: 'Galápagos',
    };
    for (const [city, provinceName] of Object.entries(cityToProvince)) if (text.includes(this.normalize(city))) return provinceName;
    return null;
  }
  private categoryMatches(attraction: Atraccion, category: string): boolean { return this.categoryOf(attraction) === category; }
  private normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase(); }
}

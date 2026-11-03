import { photosOf, locationsOf } from '../../contracts/attraction-view';
import { httpErrorMessage } from '../../core/http-errors';
import { esProvincia, provinciaDeCiudad } from '../../core/provincias';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, catchError, combineLatest, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { Atraccion, AtraccionesService } from '../../services/atracciones.service';
import { AttractionCategory } from '../../contracts/atracciones.contracts';
import { ObservabilityService } from '../../services/observability.service';

type SortOption = 'featured' | 'price' | 'rating';
const SORTS = { featured: 'POPULARITY', price: 'PRICE_ASC', rating: 'RATING_DESC' } as const;

@Component({
  selector: 'app-activity-results',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './activity-results.html',
})
export class ActivityResults {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly attractionsService = inject(AtraccionesService);
  private readonly observability = inject(ObservabilityService);
  protected readonly attractions = signal<Atraccion[]>([]);
  protected readonly error = signal('');
  protected readonly loading = signal(true);
  protected readonly searching = signal(false);
  protected readonly availabilityLoading = signal(false);
  protected readonly destination = signal('');
  protected readonly date = signal('');
  protected readonly searchText = signal('');
  protected readonly selectedCities = signal<string[]>([]);
  protected readonly selectedCategory = signal<string | null>(null);
  protected readonly sort = signal<SortOption>('featured');
  protected readonly categories = signal<AttractionCategory[]>([]);
  private readonly filters$ = new BehaviorSubject<{ categoryId: string | null; sort: SortOption }>({ categoryId: null, sort: 'featured' });

  protected readonly results = computed(() => {
    const destination = this.normalize(this.destination());
    const query = destination === 'ecuador' ? '' : destination;
    const selectedCities = this.selectedCities();
    return this.attractions().filter((attraction) => {
      const city = this.cityOf(attraction);
      const searchable = this.normalize([
        attraction.name, attraction.provincia, attraction.region,
        ...locationsOf(attraction).flatMap((location) => [location.city, location.address]),
        attraction.long_description,
      ].filter(Boolean).join(' '));
      return (!query || searchable.includes(query) || this.normalize(this.provinceOf(attraction) ?? '').includes(query)) &&
        (selectedCities.length === 0 || selectedCities.includes(city));
    });
  });
  protected readonly cities = computed(() => [...new Set(this.attractions()
    .filter((attraction) => !this.destination() || this.normalize(this.provinceOf(attraction) ?? '') === this.normalize(this.destination()) || this.normalize(this.cityOf(attraction)).includes(this.normalize(this.destination())))
    .map((attraction) => this.cityOf(attraction)).filter(Boolean))].sort());

  ngOnInit(): void {
    this.attractionsService.obtenerCategorias().pipe(
      catchError(() => of([] as AttractionCategory[])),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(categories => this.categories.set(categories));
    combineLatest([
      this.route.queryParamMap.pipe(
        map(params => ({
          destination: params.get('destino') ?? '',
          date: params.get('fecha') ?? '',
          category: params.get('categoria'),
        })),
        distinctUntilChanged((a, b) => a.destination === b.destination && a.date === b.date && a.category === b.category),
        tap(({ category }) => {
          if (category !== this.filters$.value.categoryId) {
            this.selectedCategory.set(category);
            this.filters$.next({ ...this.filters$.value, categoryId: category });
          }
        }),
      ),
      this.filters$,
    ]).pipe(
      tap(([{ destination, date }]) => {
        this.destination.set(destination);
        this.searchText.set(destination);
        this.date.set(date);
        this.loading.set(true);
        this.error.set('');
      }),
      switchMap(([{ destination, date }, filters]) => this.attractionsService.buscarDisponibles({
        page: 1,
        limit: 50,
        sort: SORTS[filters.sort],
        ...(filters.categoryId ? { categoria_id: filters.categoryId } : {}),
        ...(destination.trim() && this.normalize(destination) !== 'ecuador' && !esProvincia(destination) ? { city: destination.trim() } : {}),
        ...(date ? { fecha_inicio: date, adult_count: 1 } : {}),
      }).pipe(
        map(response => ({ attractions: response.data, error: '' })),
        catchError(error => of({ attractions: [] as Atraccion[], error: httpErrorMessage(error) })),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ attractions, error }) => {
      this.attractions.set(attractions);
      this.error.set(error);
      this.loading.set(false);
      this.availabilityLoading.set(false);
    });
  }

  protected search(): void {
    const destination = this.searchText().trim();
    if (this.searching()) return;
    this.observability.trackEvent('SEARCH', {
      destination: destination || null,
      date: this.date() || null,
      action: 'search_submitted',
    });
    this.searching.set(true);
    void this.router.navigate(['/actividades'], {
      queryParams: { destino: destination || null, fecha: this.date() || null, categoria: this.selectedCategory() },
    }).finally(() => this.searching.set(false));
  }

  protected toggleCity(city: string): void {
    this.selectedCities.update(selected => selected.includes(city)
      ? selected.filter(item => item !== city) : [...selected, city]);
  }

  protected toggleCategory(id: string): void {
    const categoryId = this.selectedCategory() === id ? null : id;
    this.selectedCategory.set(categoryId);
    this.filters$.next({ ...this.filters$.value, categoryId });
  }

  protected setSort(sort: SortOption): void {
    this.sort.set(sort);
    this.filters$.next({ ...this.filters$.value, sort });
  }

  protected book(attraction: Atraccion): void {
    void this.router.navigate(['/actividades', attraction.id]);
  }

  protected cityOf(attraction: Atraccion): string { return attraction.city ?? attraction.provincia ?? 'Ecuador'; }
  protected nameOf(attraction: Atraccion): string { return attraction.name; }
  protected imageOf(attraction: Atraccion): string {
    return photosOf(attraction)[0]?.url ?? 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=900&q=85';
  }
  protected priceLabel(attraction: Atraccion): string {
    if (attraction.bookingPrice) {
      return new Intl.NumberFormat('es-EC', { style: 'currency', currency: attraction.bookingPrice.currency })
        .format(attraction.bookingPrice.adult);
    }
    return 'Consultar precio';
  }
  protected ratingLabel(attraction: Atraccion): string {
    const score = Number(attraction.ratings?.score ?? 0);
    return score > 0 ? score.toFixed(1) : 'Nuevo';
  }
  protected ratingDescription(attraction: Atraccion): string {
    return attraction.ratings?.score ? 'Calificación promedio' : 'Sin calificación';
  }
  protected categoryOf(attraction: Atraccion): string {
    const text = this.normalize([attraction.type, ...(attraction.categories ?? []), attraction.name, attraction.long_description].filter(Boolean).join(' '));
    if (/museum|museo|culture|cultura|historia/.test(text)) return 'Museos y cultura';
    if (/nature|naturaleza|wildlife|fauna|forest|bosque|cascada|volcan/.test(text)) return 'Naturaleza y aire libre';
    return attraction.categoria || 'Tours';
  }
  protected durationOf(attraction: Atraccion): string {
    return attraction.duration || 'Duración no informada';
  }
  private provinceOf(attraction: Atraccion): string | null { return provinciaDeCiudad(attraction.city ?? attraction.provincia); }
  private normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase(); }
}

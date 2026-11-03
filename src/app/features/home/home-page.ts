import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { Atraccion, AtraccionesService } from '../../services/atracciones.service';
import { AttractionCategory } from '../../contracts/atracciones.contracts';
import { photosOf } from '../../contracts/attraction-view';
import { httpErrorMessage } from '../../core/http-errors';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=80';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="bg-slate-950 bg-cover bg-center" style="background-image: linear-gradient(rgba(2,6,23,.55), rgba(2,6,23,.65)), url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2000&q=85')">
      <div class="mx-auto max-w-5xl px-5 py-20 text-center text-white sm:px-8 sm:py-28">
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-teal-200">Vívelo Ecuador</p>
        <h1 class="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">Descubre algo extraordinario</h1>
        <p class="mx-auto mt-4 max-w-2xl text-base text-slate-100 sm:text-lg">Reserva experiencias, tours y aventuras en todo el Ecuador.</p>
        <form (ngSubmit)="buscar()" class="mx-auto mt-8 grid max-w-3xl gap-3 rounded-2xl bg-white p-3 text-left shadow-xl sm:grid-cols-[1fr_auto_auto]">
          <label class="block"><span class="sr-only">Destino</span>
            <input name="destino" [(ngModel)]="destino" type="search" placeholder="¿A dónde quieres ir? (ciudad o experiencia)" class="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100">
          </label>
          <label class="block"><span class="sr-only">Fecha</span>
            <input name="fecha" [(ngModel)]="fecha" [min]="hoy" type="date" class="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100">
          </label>
          <button type="submit" class="rounded-xl bg-teal-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-800">Buscar</button>
        </form>
      </div>
    </section>

    <main class="mx-auto max-w-7xl space-y-14 px-5 py-12 sm:px-8">
      @if (categorias().length > 0) {
        <section aria-labelledby="home-categorias">
          <h2 id="home-categorias" class="text-2xl font-bold">Explora por categoría</h2>
          <div class="mt-4 flex flex-wrap gap-3">
            @for (categoria of categorias(); track categoria.id) {
              <a [routerLink]="['/actividades']" [queryParams]="{ categoria: categoria.id }" class="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-teal-700 hover:text-teal-800">{{ categoria.nombre }}</a>
            }
          </div>
        </section>
      }

      @if (ciudades().length > 0) {
        <section aria-labelledby="home-ciudades">
          <h2 id="home-ciudades" class="text-2xl font-bold">Destinos con experiencias</h2>
          <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            @for (ciudad of ciudades(); track ciudad.nombre) {
              <a [routerLink]="['/actividades']" [queryParams]="{ destino: ciudad.nombre }" class="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-teal-700 hover:shadow-md">
                <p class="font-bold">{{ ciudad.nombre }}</p>
                <p class="mt-1 text-sm text-slate-500">{{ ciudad.total }} {{ ciudad.total === 1 ? 'experiencia' : 'experiencias' }}</p>
              </a>
            }
          </div>
        </section>
      }

      <section aria-labelledby="home-destacadas">
        <div class="flex items-end justify-between gap-4">
          <h2 id="home-destacadas" class="text-2xl font-bold">Experiencias destacadas</h2>
          <a routerLink="/actividades" class="text-sm font-semibold text-teal-800 hover:underline">Ver todas</a>
        </div>
        @if (cargando()) {
          <p class="mt-6 text-slate-500" role="status">Cargando experiencias…</p>
        } @else if (error()) {
          <p class="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{{ error() }}</p>
        } @else if (destacadas().length === 0) {
          <p class="mt-6 text-slate-500">Aún no hay experiencias publicadas.</p>
        } @else {
          <div class="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            @for (atraccion of destacadas(); track atraccion.id) {
              <a [routerLink]="['/actividades', atraccion.id]" class="group overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-lg">
                <img [src]="imagen(atraccion)" [alt]="atraccion.name" loading="lazy" class="h-44 w-full object-cover">
                <div class="p-4">
                  <p class="text-xs font-semibold uppercase tracking-wide text-teal-700">{{ atraccion.city ?? 'Ecuador' }}</p>
                  <h3 class="mt-1 line-clamp-2 font-bold group-hover:underline">{{ atraccion.name }}</h3>
                  <div class="mt-3 flex items-center justify-between text-sm">
                    <span class="text-slate-500">{{ calificacion(atraccion) }}</span>
                    <span class="font-bold">{{ precio(atraccion) }}</span>
                  </div>
                </div>
              </a>
            }
          </div>
        }
      </section>
    </main>
  `,
})
export class HomePage {
  private readonly service = inject(AtraccionesService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  protected destino = '';
  protected fecha = '';
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly categorias = signal<AttractionCategory[]>([]);
  private readonly atracciones = signal<Atraccion[]>([]);
  protected readonly destacadas = computed(() => this.atracciones().slice(0, 8));
  protected readonly ciudades = computed(() => {
    const total = new Map<string, number>();
    for (const atraccion of this.atracciones()) {
      if (atraccion.city) total.set(atraccion.city, (total.get(atraccion.city) ?? 0) + 1);
    }
    return [...total].map(([nombre, cantidad]) => ({ nombre, total: cantidad }))
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre)).slice(0, 10);
  });

  constructor() {
    forkJoin({
      categorias: this.service.obtenerCategorias().pipe(catchError(() => of([] as AttractionCategory[]))),
      pagina: this.service.buscarDisponibles({ page: 1, limit: 50, sort: 'POPULARITY' }).pipe(
        catchError(error => of({ data: [] as Atraccion[], error: httpErrorMessage(error) })),
      ),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ categorias, pagina }) => {
      this.categorias.set(categorias);
      this.atracciones.set(pagina.data);
      this.error.set('error' in pagina ? pagina.error : '');
      this.cargando.set(false);
    });
  }

  protected buscar(): void {
    void this.router.navigate(['/actividades'], {
      queryParams: { destino: this.destino.trim() || null, fecha: this.fecha || null },
    });
  }

  protected imagen(atraccion: Atraccion): string { return photosOf(atraccion)[0]?.url ?? FALLBACK_IMAGE; }
  protected calificacion(atraccion: Atraccion): string {
    const score = Number(atraccion.ratings?.score ?? 0);
    return score > 0 ? `★ ${score.toFixed(1)}` : 'Nuevo';
  }
  protected precio(atraccion: Atraccion): string {
    const price = atraccion.bookingPrice;
    return price ? new Intl.NumberFormat('es-EC', { style: 'currency', currency: price.currency }).format(price.adult) : 'Consultar';
  }
}

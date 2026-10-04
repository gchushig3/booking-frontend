import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';

export interface AtraccionImage {
  url: string;
}

export type ProductType = 'SINGLE_TICKET' | 'GUIDED_TOUR' | 'PACKAGE';

export interface DisponibilidadAtraccion {
  date: string;
  available_spots: number;
  times: string[];
  product_type?: ProductType;
}

export interface Atraccion {
  id: string;
  nombre?: string;
  descripcion?: string;
  ciudad?: string;
  precioTicket?: number;
  duracionHoras?: number;
  product_type?: ProductType;
  images?: AtraccionImage[];
  photos?: AtraccionImage[];
  imagenes?: AtraccionImage[];
  price?: { currency: string; total: number } | null;
  package_prices?: Partial<Record<ProductType, { currency: string; total: number }>> | null;
  operator?: { id: number; name: string } | null;
  name?: string;
  long_description?: string;
  duration?: string;
  region?: string;
  provincia?: string;
  categoria?: string;
  precioBase?: number;
  cuposTotales?: number;
  horariosDisponibles?: string[];
  locations?: { address?: string; city?: string }[];
  categories?: string[];
  includes?: string[];
  supported_languages?: string[];
  badges?: string[];
  free_cancellation?: boolean;
  ratings?: { number_of_reviews?: number; score?: number };
}

interface AtraccionesResponse {
  data: Atraccion[];
  meta?: { total: number; page: number; lastPage: number };
}

@Injectable({ providedIn: 'root' })
export class AtraccionesService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = 'http://localhost:3000/api/v1/atracciones';

  obtenerAtracciones(): Observable<Atraccion[]> {
    const limit = '100';
    return this.http.get<AtraccionesResponse | Atraccion[]>(this.endpoint, { params: { page: '1', limit } }).pipe(
      switchMap((response) => {
        if (Array.isArray(response)) return of(response);
        const firstPage = response.data ?? [];
        const lastPage = Math.max(1, Number(response.meta?.lastPage ?? 1));
        if (lastPage <= 1) return of(firstPage);
        const laterPages = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
        return forkJoin(laterPages.map((page) => this.http.get<AtraccionesResponse | Atraccion[]>(this.endpoint, {
          params: { page: String(page), limit },
        }))).pipe(map((pages) => [
          ...firstPage,
          ...pages.flatMap((item) => Array.isArray(item) ? item : item.data ?? []),
        ]));
      }),
    );
  }

  obtenerDisponibilidad(atraccionId: string, date: string, productType?: ProductType, time?: string): Observable<DisponibilidadAtraccion> {
    const params: Record<string, string> = { date };
    if (productType) params['product_type'] = productType;
    if (time) params['time'] = time;
    return this.http.get<DisponibilidadAtraccion>(`${this.endpoint}/${encodeURIComponent(atraccionId)}/availability`, { params });
  }
}

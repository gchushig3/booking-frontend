import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';

export interface AtraccionImage {
  url: string;
}

export interface Atraccion {
  id: string;
  nombre?: string;
  descripcion?: string;
  ciudad?: string;
  precioTicket?: number;
  duracionHoras?: number;
  product_type?: string;
  images?: AtraccionImage[];
  photos?: AtraccionImage[];
  price?: { currency: string; total: number } | null;
  operator?: { id: number; name: string } | null;
  name?: string;
  long_description?: string;
  duration?: string;
  region?: string;
  locations?: { address?: string; city?: string }[];
  categories?: string[];
  badges?: string[];
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
    return this.http.get<AtraccionesResponse | Atraccion[]>(this.endpoint).pipe(
      map((response) => Array.isArray(response) ? response : response.data ?? []),
    );
  }
}

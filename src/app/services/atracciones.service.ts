import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';

import { CreateAttractionRequest, UpdateAttractionRequest } from '../contracts/admin.contracts';
import { API_URL } from '../core/api.config';
import { Atraccion, AtraccionesListResponse, DisponibilidadAtraccion, PaqueteExperiencia, ProductType } from '../contracts/atracciones.contracts';
export type { Atraccion, DisponibilidadAtraccion, ProductType } from '../contracts/atracciones.contracts';

@Injectable({ providedIn: 'root' })
export class AtraccionesService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${inject(API_URL)}/atracciones`;

  obtenerPagina(page = 1, limit = 10): Observable<AtraccionesListResponse> {
    return this.http.get<AtraccionesListResponse>(this.endpoint, { params: { page: String(page), limit: String(limit) } });
  }
  crearAtraccion(body: CreateAttractionRequest): Observable<Atraccion> { return this.http.post<Atraccion>(this.endpoint, body); }
  editarAtraccion(id: string, body: UpdateAttractionRequest): Observable<Atraccion> { return this.http.patch<Atraccion>(`${this.endpoint}/${encodeURIComponent(id)}`, body); }
  desactivarAtraccion(id: string): Observable<void> { return this.http.delete<void>(`${this.endpoint}/${encodeURIComponent(id)}`); }

  obtenerAtracciones(): Observable<Atraccion[]> {
    const limit = '100';
    return this.http.get<AtraccionesListResponse>(this.endpoint, { params: { page: '1', limit } }).pipe(
      switchMap((response) => {
        const firstPage = response.data;
        const lastPage = Math.max(1, Number(response.meta.lastPage));
        if (lastPage <= 1) return of(firstPage);
        const laterPages = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
        return forkJoin(laterPages.map((page) => this.http.get<AtraccionesListResponse>(this.endpoint, {
          params: { page: String(page), limit },
        }))).pipe(map((pages) => [
          ...firstPage,
          ...pages.flatMap((item) => item.data),
        ]));
      }),
    );
  }

  obtenerAtraccion(id: string): Observable<Atraccion> {
    return this.http.get<Atraccion>(`${this.endpoint}/${encodeURIComponent(id)}`);
  }

  obtenerPaquetes(id: string): Observable<PaqueteExperiencia[]> {
    return this.http.get<PaqueteExperiencia[]>(`${this.endpoint}/${encodeURIComponent(id)}/paquetes`);
  }

  obtenerDisponibilidad(atraccionId: string, date: string, productType?: ProductType, time?: string): Observable<DisponibilidadAtraccion> {
    const params: Record<string, string> = { date };
    if (productType) params['product_type'] = productType;
    if (time) params['time'] = time;
    return this.http.get<DisponibilidadAtraccion>(`${this.endpoint}/${encodeURIComponent(atraccionId)}/availability`, { params });
  }
}

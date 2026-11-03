import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';

import {
  AttractionCategory,
  AttractionType,
  Atraccion,
  AtraccionesListResponse,
  BookingInclusions,
  BookingPrice,
  BookingProfile,
  BookingSearchRequest,
  CreateAttractionRequest,
  ProductType,
  UpdateAttractionRequest,
} from '../contracts/atracciones.contracts';
import { CATALOG_API_URL } from '../core/api.config';

export type {
  Atraccion,
  AttractionType,
  BookingInclusions,
  BookingPrice,
  BookingProfile,
  ProductType,
} from '../contracts/atracciones.contracts';

interface ApiPage<T> {
  data: T[];
  metadata: { total_results: number; page: number; limit: number; total_pages: number };
}

interface ApiAttraction {
  id: string;
  atr_id?: string | number;
  name: string;
  slug?: string;
  description?: string;
  short_description?: string | null;
  type?: AttractionType;
  status?: string;
  city?: string;
  duration?: string;
  duration_hours?: number;
  city_id?: number;
  operator?: { id: string; name: string };
  operator_id?: string;
  address?: string | null;
  meeting_point?: string | null;
  latitude?: number;
  longitude?: number;
  meeting_point_geo?: { address: string; city: string; latitude: number; longitude: number };
  price?: BookingPrice;
  rating?: { score: number; review_count: number; breakdown?: Record<string, number> };
  inclusions?: BookingInclusions;
  inclusions_list?: string[];
  itinerary?: BookingProfile['itinerary'];
  accessibility?: BookingProfile['accessibility'];
  guide_languages?: string[];
  cancellation_policy?: { free_cancellation: boolean; deadline_hours: number };
  free_cancellation?: boolean;
  free_cancellation_hours?: number;
  permite_paquete?: boolean;
  photos?: (string | { url: string; id?: string })[];
  categories?: (string | { name: string })[];
  languages?: (string | { name: string })[];
  includes?: string[];
  currency?: string;
  cancellation_hours?: number;
}

function attractionFromApi(item: ApiAttraction): Atraccion {
  const price = item.price;
  const inclusionNames = item.inclusions_list ?? item.includes ?? [
    ...(item.inclusions?.includes_food ? ['Alimentación'] : []),
    ...(item.inclusions?.includes_transport ? ['Transporte'] : []),
    ...(item.inclusions?.includes_guide ? ['Guía'] : []),
  ];
  const city = item.city ?? item.meeting_point_geo?.city ?? '';
  const type = item.type;
  const productType = type === 'GUIDED_TOUR' ? 'GUIDED_TOUR'
    : type === 'PACKAGE' ? 'PACKAGE' : 'SINGLE_TICKET';
  const photos = (item.photos ?? []).map(photo =>
    typeof photo === 'string' ? { url: photo } : photo,
  );
  const categories = (item.categories ?? []).map(category =>
    typeof category === 'string' ? category : category.name,
  );
  const languages = (item.guide_languages ?? item.languages ?? []).map(language =>
    typeof language === 'string' ? language : language.name,
  );
  const rating = item.rating;
  return {
    id: item.id,
    numericId: item.atr_id === undefined ? undefined : String(item.atr_id),
    name: item.name,
    provincia: city,
    region: city,
    categoria: categories[0] ?? type ?? 'Experiencia',
    precioBase: price?.adult ?? 0,
    cuposTotales: 0,
    horariosDisponibles: [],
    tipoExperienciaPermitidos: [productType],
    long_description: item.description ?? item.short_description ?? '',
    description: item.description,
    short_description: item.short_description ?? undefined,
    city,
    duration: item.duration ?? `${item.duration_hours ?? 0} horas`,
    duration_hours: item.duration_hours,
    city_id: item.city_id,
    operator_id: item.operator_id ?? item.operator?.id,
    address: item.address,
    meeting_point: item.meeting_point ?? item.meeting_point_geo?.address,
    latitude: item.latitude ?? item.meeting_point_geo?.latitude,
    longitude: item.longitude ?? item.meeting_point_geo?.longitude,
    price: { currency: price?.currency ?? item.currency ?? 'USD', total: price?.adult ?? 0 },
    bookingPrice: price,
    bookingInclusions: item.inclusions,
    package_prices: undefined,
    operator: item.operator && /^\d+$/.test(item.operator.id)
      ? { id: Number(item.operator.id), name: item.operator.name }
      : undefined,
    product_type: productType,
    type,
    status: item.status,
    includes: inclusionNames,
    categories,
    badges: item.free_cancellation || item.cancellation_policy?.free_cancellation
      ? ['free_cancellation'] : [],
    locations: item.meeting_point_geo ? [item.meeting_point_geo] : [],
    photos,
    supported_languages: languages,
    free_cancellation: item.free_cancellation
      ?? item.cancellation_policy?.free_cancellation ?? false,
    cancellationHours: item.cancellation_policy?.deadline_hours
      ?? item.free_cancellation_hours ?? item.cancellation_hours,
    ratings: rating ? {
      number_of_reviews: rating.review_count,
      score: rating.score,
    } : undefined,
    itinerary: item.itinerary,
    bookingProfile: price && item.inclusions && item.itinerary && rating?.breakdown
      ? {
          city,
          price,
          inclusions: item.inclusions,
          itinerary: item.itinerary,
          ratings_breakdown: rating.breakdown,
          accessibility: item.accessibility,
          permite_paquete: item.permite_paquete,
        }
      : undefined,
    meetingPoint: item.meeting_point_geo
      ? {
          address: item.meeting_point_geo.address,
          latitude: item.meeting_point_geo.latitude,
          longitude: item.meeting_point_geo.longitude,
        }
      : undefined,
    accessibility: item.accessibility,
    ratingsBreakdown: rating?.breakdown,
    bookingEnabled: item.permite_paquete,
    _links: undefined,
  };
}

function pageFromApi(response: ApiPage<ApiAttraction>): AtraccionesListResponse {
  return {
    data: response.data.map(attractionFromApi),
    meta: {
      total: response.metadata.total_results,
      page: response.metadata.page,
      lastPage: response.metadata.total_pages,
    },
  };
}

@Injectable({ providedIn: 'root' })
export class AtraccionesService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${inject(CATALOG_API_URL)}/atracciones`;

  obtenerPagina(page = 1, limit = 10, q = ''): Observable<AtraccionesListResponse> {
    const body: BookingSearchRequest = {
      page,
      limit: Math.min(limit, 50),
      sort: 'POPULARITY',
      ...(q.trim() ? { query: q.trim() } : {}),
    };
    return this.http.post<ApiPage<ApiAttraction>>(`${this.endpoint}/search`, body)
      .pipe(map(pageFromApi));
  }

  crearAtraccion(body: CreateAttractionRequest): Observable<Atraccion> {
    return this.http.post<ApiAttraction>(this.endpoint, body).pipe(map(attractionFromApi));
  }

  editarAtraccion(id: string, body: UpdateAttractionRequest): Observable<Atraccion> {
    return this.http.patch<ApiAttraction>(`${this.endpoint}/${encodeURIComponent(id)}`, body)
      .pipe(map(attractionFromApi));
  }

  actualizarEstado(id: string, status: 'BORRADOR' | 'PUBLICADA' | 'INACTIVA'): Observable<Atraccion> {
    return this.http.patch<ApiAttraction>(
      `${this.endpoint}/${encodeURIComponent(id)}/estado`,
      { status },
    ).pipe(map(attractionFromApi));
  }

  desactivarAtraccion(id: string): Observable<Atraccion> {
    return this.actualizarEstado(id, 'INACTIVA');
  }

  obtenerAtracciones(): Observable<Atraccion[]> {
    const limit = 50;
    return this.http.post<ApiPage<ApiAttraction>>(`${this.endpoint}/search`, { page: 1, limit, sort: 'POPULARITY' }).pipe(
      switchMap(response => {
        const firstPage = pageFromApi(response).data;
        const lastPage = Math.max(1, Number(response.metadata.total_pages));
        if (lastPage <= 1) return of(firstPage);
        const laterPages = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
        return forkJoin(laterPages.map(page => this.http.post<ApiPage<ApiAttraction>>(
          `${this.endpoint}/search`,
          { page, limit, sort: 'POPULARITY' },
        ))).pipe(map(pages => [
          ...firstPage,
          ...pages.flatMap(item => pageFromApi(item).data),
        ]));
      }),
    );
  }

  buscarDisponibles(
    query: BookingSearchRequest,
  ): Observable<AtraccionesListResponse> {
    return this.http.post<ApiPage<ApiAttraction>>(`${this.endpoint}/search`, query)
      .pipe(map(pageFromApi));
  }

  obtenerCategorias(): Observable<AttractionCategory[]> {
    return this.http.get<AttractionCategory[]>(`${this.endpoint}/categorias`);
  }

  obtenerAtraccion(id: string): Observable<Atraccion> {
    return this.http.get<ApiAttraction>(`${this.endpoint}/${encodeURIComponent(id)}`)
      .pipe(map(attractionFromApi));
  }

  guardarPerfilBooking(id: string, profile: BookingProfile): Observable<BookingProfile> {
    return this.http.put<BookingProfile>(
      `${this.endpoint}/${encodeURIComponent(id)}/booking`,
      profile,
    );
  }
}

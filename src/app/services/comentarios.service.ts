import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from '../core/api.config';
import { ComentarioResponse, CreateComentarioRequest } from '../contracts/atracciones.contracts';
@Injectable({ providedIn: 'root' })
export class ComentariosService {
  private readonly http = inject(HttpClient);
  private readonly api = `${inject(API_URL)}/atracciones`;
  listar(id: string) { return this.http.get<ComentarioResponse[]>(`${this.api}/${encodeURIComponent(id)}/comentarios`); }
  crear(id: string, body: CreateComentarioRequest) { return this.http.post<ComentarioResponse>(`${this.api}/${encodeURIComponent(id)}/comentarios`, body); }
}

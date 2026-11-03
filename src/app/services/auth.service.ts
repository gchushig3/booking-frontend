import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, map, Observable, of, switchMap, tap, throwError } from 'rxjs';

import { IDENTITY_API_URL } from '../core/api.config';
import { httpErrorMessage } from '../core/http-errors';
import {
  AuthMeResponse,
  AuthUser,
  IdentityUser,
  LoginCredentials,
  RegisterCredentials,
  RegisterResponse,
  Role,
  TokenPairResponse,
} from '../contracts/atracciones.contracts';
export type { AuthUser, LoginCredentials, RegisterCredentials, RegisterResponse } from '../contracts/atracciones.contracts';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${inject(IDENTITY_API_URL)}/auth`;
  private readonly tokenKey = 'access_token';
  private readonly refreshTokenKey = 'refresh_token';
  private readonly userKey = 'auth_user';
  readonly authenticated = signal(Boolean(localStorage.getItem(this.tokenKey)));
  readonly user = signal<AuthUser | null>(this.readStoredUser());

  login(credentials: LoginCredentials): Observable<AuthUser> {
    return this.createSession(this.http.post<TokenPairResponse>(`${this.apiUrl}/login`, credentials));
  }

  register(credentials: RegisterCredentials): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.apiUrl}/register`, credentials);
  }

  private createSession(response$: Observable<TokenPairResponse>): Observable<AuthUser> {
    return response$.pipe(
      tap(({ access_token, refresh_token }) => {
        if (!access_token || !refresh_token) throw new Error('Respuesta de autenticación inválida.');
        localStorage.setItem(this.tokenKey, access_token);
        localStorage.setItem(this.refreshTokenKey, refresh_token);
        this.authenticated.set(true);
      }),
      switchMap(() => this.http.get<AuthMeResponse>(`${this.apiUrl}/me`).pipe(
        map(response => this.mapUser(response.user)),
        tap(user => {
          localStorage.setItem(this.userKey, JSON.stringify(user));
          this.user.set(user);
        }),
        catchError(error => {
          this.clearSession();
          return throwError(() => error);
        }),
      )),
    );
  }

  logout(): Observable<void> {
    const token = this.getToken();
    this.clearSession();
    if (!token) return of(void 0);
    return this.http.post<void>(`${this.apiUrl}/logout`, {}, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
    });
  }

  logoutLocally(): void {
    this.clearSession();
  }

  private clearSession(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.userKey);
    this.authenticated.set(false);
    this.user.set(null);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return this.authenticated();
  }

  isAdmin(): boolean {
    return this.getRole() === 'ADMIN';
  }

  getRole(): Role | null {
    if (!this.isLoggedIn()) return null;
    const roles = this.readJwtClaims()?.['roles'];
    if (!Array.isArray(roles)) return null;
    return roles.includes('ADMIN') ? 'ADMIN' : roles.includes('CLIENTE') ? 'CLIENTE' : null;
  }

  private mapUser(user: IdentityUser): AuthUser {
    if (
      !user?.id || !user.email || typeof user.first_name !== 'string'
      || typeof user.last_name !== 'string' || typeof user.verified !== 'boolean'
      || !Array.isArray(user.roles) || !user.roles.every(role => typeof role === 'string')
    ) {
      throw new Error('Respuesta de identidad inválida.');
    }
    return {
      id: user.id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`.trim(),
      roles: user.roles,
      verified: user.verified,
    };
  }

  private readJwtClaims(): Record<string, unknown> | null {
    try {
      const token = this.getToken();
      if (!token) return null;
      const payload = token.split('.')[1];
      if (!payload) return null;
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  getLoginErrorMessage(error: unknown): string { return httpErrorMessage(error); }

  private readStoredUser(): AuthUser | null {
    const storedUser = localStorage.getItem(this.userKey);
    if (!storedUser) return null;

    try {
      return JSON.parse(storedUser) as AuthUser;
    } catch {
      localStorage.removeItem(this.userKey);
      return null;
    }
  }
}

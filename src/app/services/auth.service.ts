import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';

import { API_URL } from '../core/api.config';
import { httpErrorMessage } from '../core/http-errors';
import { AuthUser, AuthResponse, LoginCredentials, RegisterCredentials, Role } from '../contracts/atracciones.contracts';
export type { AuthUser, LoginCredentials, RegisterCredentials } from '../contracts/atracciones.contracts';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${inject(API_URL)}/auth`;
  private readonly tokenKey = 'access_token';
  private readonly userKey = 'auth_user';
  readonly authenticated = signal(Boolean(localStorage.getItem(this.tokenKey)));
  readonly user = signal<AuthUser | null>(this.readStoredUser());

  login(credentials: LoginCredentials): Observable<AuthUser> {
    return this.createSession(this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials));
  }

  register(credentials: RegisterCredentials): Observable<AuthUser> {
    return this.createSession(this.http.post<AuthResponse>(`${this.apiUrl}/register`, credentials));
  }

  private createSession(response$: Observable<AuthResponse>): Observable<AuthUser> {
    return response$.pipe(
      tap(({ accessToken, user }) => {
        if (!accessToken || !user?.id) throw new Error('Respuesta de autenticación inválida.');
        localStorage.setItem(this.tokenKey, accessToken);
        localStorage.setItem(this.userKey, JSON.stringify(user));
        this.authenticated.set(true);
        this.user.set(user);
      }),
      map(({ user }) => user),
    );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
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
    if (!this.isLoggedIn()) return false;
    return this.getRole() === 'ADMIN';
  }

  getRole(): Role | null {
    if (!this.isLoggedIn()) return null;
    const role = this.readJwtClaims()?.['role'];
    return role === 'CLIENTE' || role === 'ADMIN' ? role : null;
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

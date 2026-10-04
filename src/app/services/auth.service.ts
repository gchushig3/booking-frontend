import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';

export interface AuthUser {
  id?: string;
  name: string;
  email: string;
  role?: string | string[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  name: string;
}

interface LoginApiUser {
  id?: string;
  userId?: string;
  name?: string;
  email?: string;
  role?: string | string[];
  roles?: string[];
}

interface LoginApiResponse {
  accessToken?: string;
  access_token?: string;
  token?: string;
  userId?: string;
  name?: string;
  email?: string;
  user?: LoginApiUser;
  role?: string | string[];
  roles?: string[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:3000/api/v1/auth';
  private readonly tokenKey = 'access_token';
  private readonly userKey = 'auth_user';
  readonly authenticated = signal(Boolean(localStorage.getItem(this.tokenKey)));
  readonly user = signal<AuthUser | null>(this.readStoredUser());

  login(credentials: LoginCredentials): Observable<AuthUser> {
    return this.createSession(this.http.post<LoginApiResponse>(`${this.apiUrl}/login`, credentials), credentials.email);
  }

  register(credentials: RegisterCredentials): Observable<AuthUser> {
    return this.createSession(this.http.post<LoginApiResponse>(`${this.apiUrl}/register`, credentials), credentials.email);
  }

  private createSession(response$: Observable<LoginApiResponse>, fallbackEmail: string): Observable<AuthUser> {
    return response$.pipe(
      map((response) => {
        const token = response.accessToken ?? response.access_token ?? response.token;
        if (!token) {
          throw new Error('La respuesta de autenticación no contiene un token JWT.');
        }

        const apiUser: LoginApiUser = response.user ?? response;
        const user: AuthUser = {
          id: apiUser.id ?? apiUser.userId ?? response.userId,
          name: apiUser.name ?? apiUser.email ?? response.email ?? fallbackEmail,
          email: apiUser.email ?? response.email ?? fallbackEmail,
          role: apiUser.role ?? apiUser.roles ?? response.role ?? response.roles,
        };

        return { token, user };
      }),
      tap(({ token, user }) => {
        localStorage.setItem(this.tokenKey, token);
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
    const claims = this.readJwtClaims();
    const roles = [this.user()?.role, claims?.['role'], claims?.['roles']]
      .flatMap((role) => Array.isArray(role) ? role : [role])
      .filter((role): role is string => typeof role === 'string');
    return roles.some((role) => role.trim().toLocaleUpperCase() === 'ADMIN');
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

  getLoginErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 404) {
      return 'No se encontró la ruta de autenticación. Verifica que el backend esté actualizado y en ejecución.';
    }
    if (error instanceof HttpErrorResponse && error.status === 401) {
      return 'El correo o la contraseña no son correctos.';
    }
    if (error instanceof HttpErrorResponse && error.status === 409) {
      return 'Ya existe una cuenta con ese correo electrónico.';
    }
    if (error instanceof Error && !(error instanceof HttpErrorResponse)) {
      return error.message;
    }

    return 'No pudimos iniciar sesión. Comprueba tus datos y vuelve a intentarlo.';
  }

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

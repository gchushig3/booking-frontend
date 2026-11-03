import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';
export const API_URL = new InjectionToken<string>('API_URL', { providedIn: 'root', factory: () => environment.apiUrl });
export const IDENTITY_API_URL = new InjectionToken<string>('IDENTITY_API_URL', { providedIn: 'root', factory: () => environment.identityApiUrl });
export const CATALOG_API_URL = new InjectionToken<string>('CATALOG_API_URL', { providedIn: 'root', factory: () => environment.catalogApiUrl });
export const CART_API_URL = new InjectionToken<string>('CART_API_URL', { providedIn: 'root', factory: () => environment.cartApiUrl });
export const TELEMETRY_ENABLED = new InjectionToken<boolean>('TELEMETRY_ENABLED', { providedIn: 'root', factory: () => true });
export function isApiRequest(url: string, baseUrl: string): boolean {
  try {
    const base = new URL(baseUrl, document.baseURI);
    const target = new URL(url, document.baseURI);
    const path = base.pathname.replace(/\/$/, '');
    return target.origin === base.origin && (target.pathname === path || target.pathname.startsWith(path + '/'));
  } catch { return false; }
}

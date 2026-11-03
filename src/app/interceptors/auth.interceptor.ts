import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_URL, CART_API_URL, CATALOG_API_URL, IDENTITY_API_URL, isApiRequest } from '../core/api.config';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const isBookingApi = isApiRequest(request.url, inject(API_URL))
    || isApiRequest(request.url, inject(IDENTITY_API_URL))
    || isApiRequest(request.url, inject(CART_API_URL))
    || isApiRequest(request.url, inject(CATALOG_API_URL));
  if (!isBookingApi) return next(request);
  const token = inject(AuthService).getToken();
  if (!token) return next(request);

  return next(request.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  }));
};
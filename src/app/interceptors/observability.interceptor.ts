import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, tap, throwError } from 'rxjs';
import { ObservabilityService } from '../services/observability.service';

export const observabilityInterceptor: HttpInterceptorFn = (request, next) => {
  if (!/\/api\//i.test(request.url)) return next(request);
  const observability = inject(ObservabilityService);
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let status = 0;
  let failed = false;
  return next(request).pipe(
    tap((event) => { if (event instanceof HttpResponse) status = event.status; }),
    catchError((error: unknown) => {
      failed = true;
      status = error instanceof HttpErrorResponse ? error.status : 0;
      return throwError(() => error);
    }),
    finalize(() => {
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      observability.recordHttp(request.method, request.urlWithParams, endedAt - startedAt, status, failed);
    }),
  );
};

import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { authInterceptor } from './interceptors/auth.interceptor';
import { routes } from './app.routes';
import { GlobalErrorHandler } from './core/global-error-handler';
import { observabilityInterceptor } from './interceptors/observability.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideHttpClient(withInterceptors([authInterceptor, observabilityInterceptor])),
    provideRouter(routes)
  ]
};

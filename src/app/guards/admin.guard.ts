import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/acceso-denegado'], { queryParams: { motivo: '401' } });
  }
  if (!auth.isAdmin()) {
    return router.createUrlTree(['/acceso-denegado'], { queryParams: { motivo: '403' } });
  }
  return true;
};

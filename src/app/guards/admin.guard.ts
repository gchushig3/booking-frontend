import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  if (authService.isAdmin()) return true;

  inject(ToastService).mostrar('error', 'Acceso Denegado: Se requieren permisos de administrador');
  void inject(Router).navigateByUrl('/');
  return false;
};

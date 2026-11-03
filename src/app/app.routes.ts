import { Routes } from '@angular/router';
import { ActivityResults } from './components/activity-results/activity-results';
import { AttractionDetail } from './components/attraction-detail/attraction-detail';
import { HomePage } from './features/home/home-page';
import { CheckoutPage } from './features/booking/checkout-page';
import { MyReservations } from './features/booking/my-reservations';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: HomePage },
  { path: 'reservar/:id', component: CheckoutPage },
  { path: 'reservas', component: MyReservations },
  { path: 'historial', redirectTo: 'reservas' },
  { path: 'actividades', component: ActivityResults },
  { path: 'actividades/:id', component: AttractionDetail },
  { path: 'atracciones/:id', component: AttractionDetail },
  { path: 'acceso-denegado', loadComponent: () => import('./features/admin/admin-layout').then(m => m.AdminAccessDenied) },
  { path: 'admin', canActivate: [adminGuard], loadComponent: () => import('./features/admin/admin-layout').then(m => m.AdminLayout), children: [
    { path: '', pathMatch: 'full', redirectTo: 'atracciones' },
    { path: 'atracciones', canActivate: [adminGuard], loadComponent: () => import('./features/admin/admin-attractions').then(m => m.AdminAttractions) },
    { path: 'reservas', canActivate: [adminGuard], loadComponent: () => import('./features/admin/admin-reservations').then(m => m.AdminReservations) },
    { path: 'observabilidad', canActivate: [adminGuard], loadComponent: () => import('./features/admin/admin-observability').then(m => m.AdminObservability) },
  ] },
  { path: 'observabilidad', pathMatch: 'full', redirectTo: 'admin/observabilidad' },
  { path: '**', redirectTo: '' },
];

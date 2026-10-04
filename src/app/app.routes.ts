import { Routes } from '@angular/router';
import { Component } from '@angular/core';
import { ObservabilityDashboard } from './components/observability-dashboard/observability-dashboard';
import { ActivityResults } from './components/activity-results/activity-results';
import { AttractionDetail } from './components/attraction-detail/attraction-detail';
import { adminGuard } from './guards/admin.guard';

@Component({ standalone: true, template: '' })
class HomeRouteMarker {}

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: HomeRouteMarker },
  { path: 'reservas', component: HomeRouteMarker },
  { path: 'historial', component: HomeRouteMarker },
  { path: 'actividades', component: ActivityResults },
  { path: 'actividades/:id', component: AttractionDetail },
  { path: 'atracciones/:id', component: AttractionDetail },
  { path: 'observabilidad', component: ObservabilityDashboard, canActivate: [adminGuard] },
  { path: '**', redirectTo: '' },
];

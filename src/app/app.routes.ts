import { Routes } from '@angular/router';
import { ObservabilityDashboard } from './components/observability-dashboard/observability-dashboard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: 'observabilidad', component: ObservabilityDashboard, canActivate: [adminGuard] },
];

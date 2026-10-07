import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <main class="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <h1 class="text-3xl font-bold tracking-tight">Panel de administración</h1>
      <p class="mt-2 text-sm text-slate-600">Administra tu catálogo, prepara las experiencias y consulta las reservas desde un solo lugar.</p>
      <nav aria-label="Administración" class="my-6 flex flex-wrap gap-3">
        <a routerLink="/admin/atracciones" routerLinkActive="bg-teal-100" class="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Atracciones</a>
        <a routerLink="/admin/reservas" routerLinkActive="bg-teal-100" class="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Reservas</a>
        <a routerLink="/admin/observabilidad" routerLinkActive="bg-teal-100" class="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Observabilidad</a>
      </nav>
      <router-outlet />
    </main>
  `,
})
export class AdminLayout {}

@Component({
  selector: 'app-admin-access-denied',
  imports: [RouterLink],
  template: `
    <main class="mx-auto max-w-xl px-5 py-12 sm:px-8">
      <h1 class="text-2xl font-bold">Acceso denegado</h1>
      <p role="alert" class="my-4 leading-6 text-slate-700">{{ message() }}</p>
      <a routerLink="/" class="inline-block rounded-lg border border-stone-300 px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Volver al catálogo</a>
    </main>
  `,
})
export class AdminAccessDenied {
  private readonly auth = inject(AuthService);
  private readonly motivo = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('motivo'))),
    { initialValue: inject(ActivatedRoute).snapshot.queryParamMap.get('motivo') },
  );
  protected readonly message = () => {
    const unauthenticated = this.motivo() === '401' || !this.auth.isLoggedIn();
    return unauthenticated
      ? 'Tu sesión no es válida o no has iniciado sesión. Inicia sesión desde la cabecera para continuar.'
      : 'Tu cuenta está autenticada, pero no tiene permisos ADMIN para esta sección.';
  };
}

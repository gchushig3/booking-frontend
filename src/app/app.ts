import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AuthService } from './services/auth.service';
import { AtraccionesService, Atraccion } from './services/atracciones.service';
import { CrearReservaDto, ReservaUsuario, ReservasService } from './services/reservas.service';
import { ToastService } from './services/toast.service';
import { ToastContainer } from './toast-container';
import { ObservabilityService } from './services/observability.service';

function fechaLocalActual(): string {
  const ahora = new Date();
  const offset = ahora.getTimezoneOffset();
  return new Date(ahora.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function fechaNoPasada(control: AbstractControl): ValidationErrors | null {
  return control.value && control.value < fechaLocalActual() ? { fechaPasada: true } : null;
}

type Region = 'TODAS' | 'COSTA' | 'SIERRA' | 'ORIENTE' | 'GALAPAGOS';
interface RegionCard { id: Exclude<Region, 'TODAS'>; name: string; description: string; image: string; }

@Component({
  imports: [ReactiveFormsModule, ToastContainer, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly authService = inject(AuthService);
  private readonly atraccionesService = inject(AtraccionesService);
  private readonly reservasService = inject(ReservasService);
  private readonly toastService = inject(ToastService);
  private readonly observability = inject(ObservabilityService);
  private readonly router = inject(Router);
  protected readonly eventosObservabilidad = this.observability.events;
  protected readonly autenticado = this.authService.authenticated;
  protected readonly usuario = this.authService.user;
  protected readonly loginModalAbierto = signal(false);
  protected readonly modoRegistro = signal(false);
  protected readonly loginEnviando = signal(false);
  protected readonly errorLogin = signal('');
  private readonly atraccionPendienteDeReserva = signal<Atraccion | null>(null);
  protected readonly atracciones = signal<Atraccion[]>([]);
  protected readonly terminoBusqueda = signal('');
  protected readonly tipoSeleccionado = signal('TODOS');
  protected readonly regionSeleccionada = signal<Region>('TODAS');
  protected readonly ordenPrecio = signal<'ninguno' | 'asc' | 'desc'>('ninguno');
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly atraccionParaReservar = signal<Atraccion | null>(null);
  protected readonly reservaEnviando = signal(false);
  protected readonly errorReserva = signal('');
  protected readonly vistaActual = signal<'catalogo' | 'reservas'>('catalogo');
  protected readonly misReservas = signal<ReservaUsuario[]>([]);
  protected readonly cargandoReservas = signal(false);
  protected readonly errorReservas = signal('');
  protected readonly reservaPorCancelar = signal<ReservaUsuario | null>(null);
  protected readonly cancelandoReserva = signal(false);
  protected readonly fechaMinima = fechaLocalActual();
  protected readonly regiones: RegionCard[] = [
    { id: 'COSTA', name: 'Costa', description: 'Playas, sabores y ruta del Spondylus', image: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=900&q=80' },
    { id: 'SIERRA', name: 'Sierra', description: 'Los Andes, volcanes y ciudades patrimoniales', image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=80' },
    { id: 'ORIENTE', name: 'Oriente / Amazonía', description: 'Selva viva y biodiversidad extraordinaria', image: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=900&q=80' },
    { id: 'GALAPAGOS', name: 'Islas Galápagos', description: 'Fauna única y paisajes insulares', image: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=900&q=80' },
  ];
  protected readonly regionesConConteo = computed(() => this.regiones.map((region) => ({
    ...region,
    count: this.atracciones().filter((atraccion) => this.regionDe(atraccion) === region.id).length,
  })));
  protected readonly loginForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  protected readonly registerForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8), Validators.maxLength(72)] }),
  });
  protected readonly reservaForm = new FormGroup({
    customer_name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    customer_email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    date: new FormControl(this.fechaMinima, { nonNullable: true, validators: [Validators.required, fechaNoPasada] }),
    ticket_count: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.pattern(/^[1-9]\d*$/)],
    }),
  });
  protected readonly atraccionesFiltradas = computed(() => {
    const term = this.terminoBusqueda().trim().toLocaleLowerCase();
    const tipo = this.tipoSeleccionado();
    const region = this.regionSeleccionada();
    const resultado = this.atracciones().filter((atraccion) => {
      const texto = `${this.nombreDe(atraccion)} ${this.descripcionDe(atraccion)}`.toLocaleLowerCase();
      return (!term || texto.includes(term)) && (tipo === 'TODOS' || atraccion.product_type === tipo) &&
        (region === 'TODAS' || this.regionDe(atraccion) === region);
    });
    const orden = this.ordenPrecio();
    if (orden !== 'ninguno') {
      resultado.sort((a, b) => {
        const precioA = Number(a.price?.total ?? a.precioTicket ?? Number.POSITIVE_INFINITY);
        const precioB = Number(b.price?.total ?? b.precioTicket ?? Number.POSITIVE_INFINITY);
        return orden === 'asc' ? precioA - precioB : precioB - precioA;
      });
    }
    return resultado;
  });

  ngOnInit(): void {
    this.atraccionesService.obtenerAtracciones().subscribe({
      next: (atracciones) => {
        this.atracciones.set(atracciones);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No pudimos cargar las atracciones. Comprueba que el API esté disponible e inténtalo de nuevo.');
        this.cargando.set(false);
      },
    });
  }

  protected imagenDe(atraccion: Atraccion): string {
    return atraccion.images?.[0]?.url ?? atraccion.photos?.[0]?.url ??
      'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=900&q=80';
  }

  protected nombreDe(atraccion: Atraccion): string {
    return atraccion.name ?? atraccion.nombre ?? 'Atracción';
  }

  protected descripcionDe(atraccion: Atraccion): string {
    return atraccion.long_description ?? atraccion.descripcion ?? 'Descubre una experiencia inolvidable.';
  }

  protected duracionDe(atraccion: Atraccion): string {
    if (atraccion.duracionHoras != null) return `${atraccion.duracionHoras} h`;
    const hours = atraccion.duration?.match(/(\d+)H/i)?.[1];
    return hours ? `${hours} h` : 'Duración variable';
  }

  protected precioDe(atraccion: Atraccion): string {
    const total = atraccion.price?.total ?? atraccion.precioTicket;
    if (total == null) return 'Consultar precio';
    return new Intl.NumberFormat('es-EC', {
      style: 'currency', currency: atraccion.price?.currency ?? 'USD', maximumFractionDigits: 2,
    }).format(total);
  }

  protected reservar(atraccion: Atraccion): void {
    this.observability.track('click', 'reserve_click', { attractionId: atraccion.id });
    this.errorReserva.set('');
    if (!this.authService.isLoggedIn()) {
      this.atraccionPendienteDeReserva.set(atraccion);
      this.abrirLogin();
      return;
    }

    this.abrirReserva(atraccion);
  }

  protected abrirLogin(): void {
    this.observability.track('modal', 'login_modal_opened');
    this.errorLogin.set('');
    this.modoRegistro.set(false);
    this.loginModalAbierto.set(true);
  }

  protected mostrarRegistro(): void {
    this.errorLogin.set('');
    this.registerForm.reset({
      name: '',
      email: this.loginForm.controls.email.value,
      password: '',
    });
    this.modoRegistro.set(true);
  }

  protected mostrarLogin(): void {
    this.errorLogin.set('');
    this.loginForm.controls.email.setValue(this.registerForm.controls.email.value);
    this.loginForm.controls.email.markAsUntouched();
    this.modoRegistro.set(false);
  }

  protected cerrarLogin(): void {
    if (this.loginEnviando()) return;
    this.loginModalAbierto.set(false);
    this.atraccionPendienteDeReserva.set(null);
    this.errorLogin.set('');
  }

  protected cerrarSesion(): void {
    this.observability.track('auth', 'logout');
    this.authService.logout();
    this.vistaActual.set('catalogo');
    this.misReservas.set([]);
    this.toastService.mostrar('info', 'Has cerrado sesión correctamente.');
  }

  protected mostrarVista(vista: 'catalogo' | 'reservas'): void {
    this.vistaActual.set(vista);
    if (vista === 'reservas') this.cargarMisReservas();
  }

  protected cargarMisReservas(): void {
    if (!this.autenticado()) return;
    this.cargandoReservas.set(true);
    this.errorReservas.set('');
    this.reservasService.obtenerMisReservas().subscribe({
      next: (reservas) => { this.misReservas.set(reservas); this.cargandoReservas.set(false); },
      error: (error: unknown) => {
        this.cargandoReservas.set(false);
        if (error instanceof HttpErrorResponse && error.status === 401) this.authService.logout();
        this.errorReservas.set('No pudimos cargar tus reservas. Inténtalo nuevamente.');
      },
    });
  }

  protected fechaReserva(fecha: string): string {
    const date = new Date(`${fecha}T00:00:00`);
    return Number.isNaN(date.getTime()) ? fecha : new Intl.DateTimeFormat('es-EC', { dateStyle: 'long' }).format(date);
  }

  protected totalReservaDe(reserva: ReservaUsuario): string {
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: reserva.total_price?.currency ?? 'USD' }).format(reserva.total_price?.total ?? 0);
  }

  protected confirmarCancelacion(): void {
    const reserva = this.reservaPorCancelar();
    if (!reserva || this.cancelandoReserva()) return;
    this.cancelandoReserva.set(true);
    this.reservasService.cancelarReserva(reserva.reservation_id).subscribe({
      next: () => {
        this.cancelandoReserva.set(false);
        this.reservaPorCancelar.set(null);
        this.toastService.mostrar('exito', 'La reserva se canceló correctamente.');
        this.cargarMisReservas();
      },
      error: () => {
        this.cancelandoReserva.set(false);
        this.errorReservas.set('No pudimos cancelar la reserva. Inténtalo nuevamente.');
        this.toastService.mostrar('error', 'No pudimos cancelar la reserva. Inténtalo nuevamente.');
        this.reservaPorCancelar.set(null);
      },
    });
  }

  protected iniciarSesion(): void {
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid || this.loginEnviando()) return;

    this.loginEnviando.set(true);
    this.observability.track('auth', 'login_attempt');
    this.errorLogin.set('');
    this.authService.login(this.loginForm.getRawValue()).subscribe({
      next: (usuario) => this.completarAutenticacion(usuario),
      error: (error: unknown) => {
        this.loginEnviando.set(false);
        const mensaje = this.authService.getLoginErrorMessage(error);
        this.errorLogin.set(mensaje);
        this.toastService.mostrar('error', mensaje);
      },
    });
  }

  protected registrarse(): void {
    this.registerForm.markAllAsTouched();
    if (this.registerForm.invalid || this.loginEnviando()) return;

    this.loginEnviando.set(true);
    this.observability.track('auth', 'registration_attempt');
    this.errorLogin.set('');
    this.authService.register(this.registerForm.getRawValue()).subscribe({
      next: (usuario) => this.completarAutenticacion(usuario),
      error: (error: unknown) => {
        this.loginEnviando.set(false);
        const mensaje = this.authService.getLoginErrorMessage(error);
        this.errorLogin.set(mensaje);
        this.toastService.mostrar('error', mensaje);
      },
    });
  }

  private completarAutenticacion(usuario: { email: string }): void {
    this.observability.track('auth', 'login_success');
    this.loginEnviando.set(false);
    this.loginModalAbierto.set(false);
    this.modoRegistro.set(false);
    this.loginForm.reset({ email: usuario.email, password: '' });
    this.toastService.mostrar('exito', 'Sesión iniciada correctamente. ¡Bienvenido!');
    const atraccion = this.atraccionPendienteDeReserva();
    this.atraccionPendienteDeReserva.set(null);
    if (atraccion) this.abrirReserva(atraccion);
  }

  private abrirReserva(atraccion: Atraccion): void {
    this.observability.track('modal', 'booking_modal_opened', { attractionId: atraccion.id });
    this.reservaForm.reset({
      customer_name: this.usuario()?.name ?? '',
      customer_email: this.usuario()?.email ?? '',
      date: this.fechaMinima,
      ticket_count: 1,
    });
    this.atraccionParaReservar.set(atraccion);
  }

  protected cerrarModal(): void {
    if (this.reservaEnviando()) return;
    this.atraccionParaReservar.set(null);
    this.errorReserva.set('');
  }

  protected totalReserva(): number {
    const atraccion = this.atraccionParaReservar();
    const cantidad = Number(this.reservaForm.controls.ticket_count.value) || 0;
    return (atraccion ? this.precioUnitario(atraccion) : 0) * cantidad;
  }

  protected totalReservaFormateado(): string {
    const atraccion = this.atraccionParaReservar();
    return new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: atraccion?.price?.currency ?? 'USD',
      maximumFractionDigits: 2,
    }).format(this.totalReserva());
  }

  private precioUnitario(atraccion: Atraccion): number {
    return Number(atraccion.price?.total ?? atraccion.precioTicket ?? 0);
  }

  protected confirmarReserva(): void {
    const atraccion = this.atraccionParaReservar();
    if (!atraccion || this.reservaEnviando()) return;

    if (!this.authService.isLoggedIn()) {
      this.atraccionPendienteDeReserva.set(atraccion);
      this.atraccionParaReservar.set(null);
      this.abrirLogin();
      return;
    }

    this.reservaForm.markAllAsTouched();
    if (this.reservaForm.invalid) return;

    const datos = this.reservaForm.getRawValue() as CrearReservaDto;
    this.observability.track('booking', 'booking_attempt', { attractionId: atraccion.id, ticketCount: datos.ticket_count });
    this.errorReserva.set('');
    this.reservaEnviando.set(true);
    this.reservasService.crearReserva(atraccion.id, datos).subscribe({
      next: () => {
        this.observability.track('booking', 'booking_success', { attractionId: atraccion.id });
        this.reservaEnviando.set(false);
        this.atraccionParaReservar.set(null);
        this.reservaForm.reset({
          customer_name: '', customer_email: '', date: this.fechaMinima, ticket_count: 1,
        });
        this.toastService.mostrar('exito', '¡Reserva confirmada exitosamente!');
        if (this.vistaActual() === 'reservas') this.cargarMisReservas();
      },
      error: (error: unknown) => {
        this.reservaEnviando.set(false);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.authService.logout();
          this.atraccionPendienteDeReserva.set(atraccion);
          this.atraccionParaReservar.set(null);
          this.errorLogin.set('Tu sesión venció. Inicia sesión nuevamente para continuar con la reserva.');
          this.loginModalAbierto.set(true);
          return;
        }
        const apiMessage = error instanceof HttpErrorResponse ? error.error?.message : error instanceof Error ? error.message : '';
        const mensaje = Array.isArray(apiMessage) ? apiMessage.join(' ') : apiMessage || 'No pudimos crear la reserva. Verifica los datos y vuelve a intentarlo.';
        this.errorReserva.set(mensaje);
        this.toastService.mostrar('error', mensaje);
      },
    });
  }

  protected registrarBusqueda(): void {
    this.observability.track('search', 'search_changed', { queryLength: this.terminoBusqueda().length });
  }

  protected registrarFiltro(): void {
    this.observability.track('filter', 'filter_changed', { productType: this.tipoSeleccionado(), sort: this.ordenPrecio() });
  }

  protected seleccionarRegion(region: Region): void {
    this.regionSeleccionada.set(region);
    this.observability.track('filter', 'region_filter_changed', { region });
  }

  protected regionDe(atraccion: Atraccion): Exclude<Region, 'TODAS'> | null {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase();
    const explicit = normalize(atraccion.region ?? '');
    const text = normalize([
      atraccion.region, atraccion.name, atraccion.nombre, atraccion.long_description,
      atraccion.descripcion, atraccion.ciudad, ...(atraccion.categories ?? []), ...(atraccion.badges ?? []),
      ...(atraccion.locations ?? []).flatMap((location) => [location.address, location.city]),
    ].filter(Boolean).join(' '));

    if (/GALAPAGOS|GALAPAGO|PUERTO AYORA|SAN CRISTOBAL|ISABELA ISLAND/.test(explicit)) return 'GALAPAGOS';
    if (/ORIENTE|AMAZON|SELVA|RAINFOREST|JUNGLE/.test(explicit)) return 'ORIENTE';
    if (/COSTA|COAST/.test(explicit)) return 'COSTA';
    if (/SIERRA|ANDES|HIGHLAND/.test(explicit)) return 'SIERRA';
    if (/GALAPAGOS|GALAPAGO|PUERTO AYORA|SAN CRISTOBAL|ISLA ISABELA|SANTA CRUZ.*ISLA/.test(text)) return 'GALAPAGOS';
    if (/AMAZON|SELVA|RAINFOREST|JUNGLE|YASUNI|NAPO|TENA|PUYO|PASTAZA|ORELLANA|SUCUMBIOS|MORONA/.test(text)) return 'ORIENTE';
    if (/COSTA|COAST|SPONDYLUS|PLAYA|MANABI|ESMERALDAS|ATACAMES|MANTA|SALINAS|MONTANITA|PUERTO LOPEZ|GUAYAQUIL|SANTA ELENA|MACHALA|PLAYAS/.test(text)) return 'COSTA';
    if (/SIERRA|ANDES|VOLCAN|COTOPAXI|QUILOTOA|ZUMBAHUA|LATACUNGA|QUITO|CUENCA|RIOBAMBA|CAJAS|BANOS|IBARRA|OTAVALO|CHIMBORAZO|MINDO|GUARANDA|SALINAS DE GUARANDA|HIGHLAND/.test(text)) return 'SIERRA';
    return null;
  }

  protected abrirObservabilidad(): void {
    if (!this.authService.isAdmin()) return;
    this.observability.track('click', 'observability_dashboard_opened');
    void this.router.navigateByUrl('/observabilidad');
  }

}

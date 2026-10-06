import { ReservationDetail } from './components/reservation-detail/reservation-detail';
import { ReservationRequest, ReservationResponse } from './contracts/atracciones.contracts';
import { photosOf, locationsOf } from './contracts/attraction-view';
import { httpErrorMessage } from './core/http-errors';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AuthService } from './services/auth.service';
import { AtraccionesService, Atraccion, ProductType } from './services/atracciones.service';
import { ReservasService } from './services/reservas.service';
import { ToastService } from './services/toast.service';
import { ToastContainer } from './toast-container';
import { ObservabilityService } from './services/observability.service';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BookingNavigationService, BookingSelection } from './services/booking-navigation.service';
import { creditCardAsyncValidator, ecuadorianIdAsyncValidator } from './utils/async-validators';

function fechaLocalActual(): string {
  const ahora = new Date();
  const offset = ahora.getTimezoneOffset();
  return new Date(ahora.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function fechaNoPasada(control: AbstractControl): ValidationErrors | null {
  return control.value && control.value < fechaLocalActual() ? { fechaPasada: true } : null;
}

function caducidadTarjetaNoPasada(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(value)) return null;
  const [monthText, yearText] = value.split('/');
  const month = Number(monthText);
  const year = 2000 + Number(yearText);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return year < currentYear || (year === currentYear && month < currentMonth)
    ? { caducidadPasada: true }
    : null;
}

type Region = 'TODAS' | 'COSTA' | 'SIERRA' | 'ORIENTE' | 'GALAPAGOS';
interface RegionCard { id: Exclude<Region, 'TODAS'>; name: string; description: string; image: string; }
interface DestinationCard { name: string; region: Exclude<Region, 'TODAS'>; image: string; aliases: string[]; }
interface ProvinceCard { name: string; image: string; }
interface VoucherData {
  reservation: ReservationResponse;
  attraction: Atraccion;
  customerName: string;
  date: string;
}

@Component({
  imports: [ReactiveFormsModule, ToastContainer, RouterLink, RouterOutlet, ReservationDetail],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly photosOf = photosOf;
  private catalogoSolicitado = false;
  private checkoutKey = '';
  private submittedRequest: ReservationRequest | null = null;
  protected readonly checkoutLocked = signal(false);
  protected readonly checkoutBlocked = signal(false);
  protected readonly refreshingCheckoutAvailability = signal(false);
  protected readonly checkoutAvailabilityMessage = signal('');
  private readonly destroyRef = inject(DestroyRef);
  private readonly cancellationKeys = new Map<string, string>();
  protected readonly authService = inject(AuthService);
  private readonly atraccionesService = inject(AtraccionesService);
  private readonly reservasService = inject(ReservasService);
  private readonly toastService = inject(ToastService);
  private readonly observability = inject(ObservabilityService);
  private readonly bookingNavigation = inject(BookingNavigationService);
  private readonly router = inject(Router);
  protected readonly rutaResultados = signal(!['/', '/reservas', '/historial'].includes(this.router.url.split('?')[0]));
  protected readonly eventosObservabilidad = this.observability.events;
  protected readonly autenticado = this.authService.authenticated;
  protected readonly usuario = this.authService.user;
  protected readonly loginModalAbierto = signal(false);
  protected readonly modoRegistro = signal(false);
  protected readonly loginEnviando = signal(false);
  protected readonly errorLogin = signal('');
  private readonly atraccionPendienteDeReserva = signal<Atraccion | null>(null);
  private readonly seleccionPendiente = signal<BookingSelection | null>(null);
  private readonly seleccionActiva = signal<BookingSelection | null>(null);
  protected readonly atracciones = signal<Atraccion[]>([]);
  protected readonly terminoBusqueda = signal('');
  protected readonly fechaBusqueda = signal('');
  protected readonly idsDisponiblesPorFecha = signal<string[] | null>(null);
  protected readonly buscandoDisponibilidad = signal(false);
  protected readonly sugerenciasAbiertas = signal(false);
  protected readonly tipoSeleccionado = signal('TODOS');
  protected readonly regionSeleccionada = signal<Region>('TODAS');
  protected readonly destinoSeleccionado = signal<string | null>(null);
  protected readonly provinciaSeleccionada = signal<string | null>(null);
  protected readonly precioMaximo = signal(500);
  protected readonly categoriasSeleccionadas = signal<string[]>([]);
  protected readonly ordenCatalogo = signal<'popular' | 'precio' | 'rating'>('popular');
  protected readonly filtrosMovilesAbiertos = signal(false);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly atraccionParaReservar = signal<Atraccion | null>(null);
  protected readonly reservaConfirmada = signal<VoucherData | null>(null);
  protected readonly reservaEnviando = signal(false);
  protected readonly reservaPaso = signal<1 | 2>(1);
  protected readonly metodoPago = signal<'tarjeta' | 'paypal'>('tarjeta');
  protected readonly errorReserva = signal('');
  protected readonly vistaActual = signal<'catalogo' | 'reservas'>(['/reservas', '/historial'].includes(this.router.url.split('?')[0]) ? 'reservas' : 'catalogo');
  protected readonly misReservas = signal<ReservationResponse[]>([]);
  protected readonly codigoCopiado = signal<string | null>(null);
  protected readonly cargandoReservas = signal(false);
  protected readonly errorReservas = signal('');
  protected readonly reservaPorCancelar = signal<ReservationResponse | null>(null);
  protected readonly detalleReservaId = signal<string | null>(null);
  protected readonly errorCancelacion = signal('');
  protected readonly cancelandoReserva = signal(false);
  protected readonly fechaMinima = fechaLocalActual();
  protected readonly categoriasExperiencia = [
    { id: 'aventura', label: 'Aventura' },
    { id: 'naturaleza', label: 'Naturaleza' },
    { id: 'cultura', label: 'Cultura' },
    { id: 'gastronomia', label: 'Gastronomía' },
  ];
  protected readonly regiones: RegionCard[] = [
    { id: 'COSTA', name: 'Costa', description: 'Playas, sabores y ruta del Spondylus', image: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=900&q=80' },
    { id: 'SIERRA', name: 'Sierra', description: 'Los Andes, volcanes y ciudades patrimoniales', image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=80' },
    { id: 'ORIENTE', name: 'Oriente / Amazonía', description: 'Selva viva y biodiversidad extraordinaria', image: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=900&q=80' },
    { id: 'GALAPAGOS', name: 'Islas Galápagos', description: 'Fauna única y paisajes insulares', image: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=900&q=80' },
  ];
  protected readonly destinos: DestinationCard[] = [
    { name: 'Quito', region: 'SIERRA', aliases: ['quito'], image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Baños', region: 'SIERRA', aliases: ['baños', 'banos'], image: 'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Cuenca', region: 'SIERRA', aliases: ['cuenca'], image: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Cotopaxi', region: 'SIERRA', aliases: ['cotopaxi'], image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Montañita', region: 'COSTA', aliases: ['montañita', 'montanita'], image: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Guayaquil', region: 'COSTA', aliases: ['guayaquil'], image: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Manta', region: 'COSTA', aliases: ['manta'], image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Puerto López', region: 'COSTA', aliases: ['puerto lópez', 'puerto lopez'], image: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Tena', region: 'ORIENTE', aliases: ['tena'], image: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Yasuní', region: 'ORIENTE', aliases: ['yasuni', 'yasuní'], image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Puyo', region: 'ORIENTE', aliases: ['puyo'], image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Papallacta', region: 'ORIENTE', aliases: ['papallacta'], image: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Galápagos', region: 'GALAPAGOS', aliases: ['galápagos', 'galapagos', 'puerto ayora', 'santa cruz'], image: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Isla Isabela', region: 'GALAPAGOS', aliases: ['isabela'], image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=85' },
    { name: 'San Cristóbal', region: 'GALAPAGOS', aliases: ['san cristóbal', 'san cristobal'], image: 'https://images.unsplash.com/photo-1473116763249-2acabf3d1d49?auto=format&fit=crop&w=1000&q=85' },
  ];
  protected readonly provincias: ProvinceCard[] = [
    { name: 'Pichincha', image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Guayas', image: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Imbabura', image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Tungurahua', image: 'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Galápagos', image: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Napo', image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Azuay', image: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Manabí', image: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Pastaza', image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Cotopaxi', image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Esmeraldas', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Chimborazo', image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Orellana', image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1000&q=85' },
    { name: 'Santa Elena', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=85' },
  ];
  protected readonly provinciasVisibles = computed(() => this.provincias.map((province) => ({
    ...province,
    count: this.atracciones().filter((attraction) => this.provinciaDe(attraction) === province.name).length,
  })));
  protected readonly regionesVisibles = computed(() => this.regiones);
  protected readonly destinosVisibles = computed(() => this.destinos.filter((destination) => this.regionSeleccionada() === 'TODAS' || destination.region === this.regionSeleccionada()).map((destination) => ({
    ...destination,
    count: this.atracciones().filter((attraction) => this.coincideDestino(attraction, destination)).length,
  })));
  protected readonly sugerenciasBusqueda = computed(() => {
    const term = this.normalizarTexto(this.terminoBusqueda().trim());
    if (term.length < 2) return [];
    return this.atracciones().filter((atraccion) => {
      const content = this.normalizarTexto(`${this.nombreDe(atraccion)} ${atraccion.provincia ?? ''} ${this.descripcionDe(atraccion)}`);
      return content.includes(term);
    }).slice(0, 5);
  });
  protected readonly loginForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  protected readonly registerForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)] }),
    cedula_dni: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{10}$/)], asyncValidators: [ecuadorianIdAsyncValidator()] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(255)] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8), Validators.maxLength(72)] }),
  });
  protected readonly reservaForm = new FormGroup({
    customer_name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    first_name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(50), Validators.pattern(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/)] }),
    last_name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(50), Validators.pattern(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/)] }),
    customer_email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    identity_number: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{10}$/)], asyncValidators: [ecuadorianIdAsyncValidator()] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^09\d{8}$/)] }),
    cardholder: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(50), Validators.pattern(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/)] }),
    card_number: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{13,19}$/)], asyncValidators: [creditCardAsyncValidator()] }),
    card_expiry: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^(0[1-9]|1[0-2])\/\d{2}$/), caducidadTarjetaNoPasada] }),
    card_cvc: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{3}$/)] }),
    date: new FormControl(this.fechaMinima, { nonNullable: true, validators: [Validators.required, fechaNoPasada] }),

  });
  protected readonly atraccionesFiltradas = computed(() => {
    const term = this.normalizarTexto(this.terminoBusqueda().trim());
    const tipo = this.tipoSeleccionado();
    const region = this.regionSeleccionada();
    const maxPrice = this.precioMaximo();
    const resultado = this.atracciones().filter((atraccion) => {
      const texto = this.normalizarTexto([
        this.nombreDe(atraccion), this.descripcionDe(atraccion), atraccion.provincia, atraccion.region,
        ...(atraccion.categories ?? []), ...locationsOf(atraccion).flatMap((location) => [location.city, location.address]),
      ].filter(Boolean).join(' '));
      return (!term || texto.includes(term) || this.normalizarTexto(this.provinciaDe(atraccion) ?? '').includes(term)) &&
        (!this.provinciaSeleccionada() || this.provinciaDe(atraccion) === this.provinciaSeleccionada()) &&
        (this.idsDisponiblesPorFecha() === null || this.idsDisponiblesPorFecha()!.includes(atraccion.id)) &&
        (tipo === 'TODOS' || atraccion.product_type === tipo) &&
        (region === 'TODAS' || this.regionDe(atraccion) === region) &&
        (!this.destinoSeleccionado() || this.coincideDestino(atraccion, this.destinos.find((destination) => destination.name === this.destinoSeleccionado())!)) &&
        this.precioUnitario(atraccion) <= maxPrice && this.categoriaCoincide(atraccion);
    });
    const orden = this.ordenCatalogo();
    resultado.sort((a, b) => {
      if (orden === 'precio') return this.precioUnitario(a) - this.precioUnitario(b);
      if (orden === 'rating') return (b.ratings?.score ?? 0) - (a.ratings?.score ?? 0);
      return (b.ratings?.number_of_reviews ?? 0) - (a.ratings?.number_of_reviews ?? 0) ||
        (b.ratings?.score ?? 0) - (a.ratings?.score ?? 0);
    });
    return resultado;
  });

  ngOnInit(): void {
    if (['/reservas', '/historial'].includes(this.router.url.split('?')[0])) this.cargarMisReservas();
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      const path = (event as NavigationEnd).urlAfterRedirects.split('?')[0];
      const esHistorial = path === '/reservas' || path === '/historial';
      this.rutaResultados.set(path !== '/' && !esHistorial);
      if (esHistorial) {
        this.vistaActual.set('reservas');
        this.cargarMisReservas();
      } else if (path === '/') {
        this.vistaActual.set('catalogo');
        this.provinciaSeleccionada.set(null);
        this.cargarCatalogo();
      }
    });
    this.bookingNavigation.bookingRequested$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ attraction, selection }) => {
      if (selection) {
        this.seleccionActiva.set(selection);
        this.seleccionPendiente.set(selection);
        if (!this.authService.isLoggedIn()) {
          this.atraccionPendienteDeReserva.set(attraction);
          this.abrirLogin();
        } else {
          this.abrirReserva(attraction, selection);
        }
      } else this.reservar(attraction);
    });
    if (this.router.url === '/' && location.pathname === '/') this.cargarCatalogo();
  }

  private cargarCatalogo(): void {
    if (this.catalogoSolicitado) return;
    this.catalogoSolicitado = true;
    this.cargando.set(true);
    this.atraccionesService.obtenerAtracciones().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (atracciones) => {
        this.atracciones.set(atracciones);
        this.cargando.set(false);
      },
      error: (error: unknown) => {
        this.error.set(httpErrorMessage(error));
        this.cargando.set(false);
      },
    });
  }

  protected imagenDe(atraccion: Atraccion): string {
    return photosOf(atraccion)[0]?.url ??
      'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=900&q=80';
  }

  protected nombreDe(atraccion: Atraccion): string {
    return atraccion.name ?? 'Atracción';
  }

  protected descripcionDe(atraccion: Atraccion): string {
    return atraccion.long_description ?? 'Descubre una experiencia inolvidable.';
  }

  protected duracionDe(atraccion: Atraccion): string {
    const hours = Number(atraccion.duration?.match(/PT(?:(\d+)H)?/i)?.[1] ?? 0);
    const minutes = Number(atraccion.duration?.match(/PT(?:\d+H)?(?:(\d+)M)/i)?.[1] ?? 0);
    if (hours >= 7) return 'Full Day';
    if (hours === 0 && minutes === 0) return 'Duración variable';
    if (minutes > 0) return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
    return hours === 1 ? '1 hora' : `${hours} horas`;
  }

  protected ratingDe(atraccion: Atraccion): number | null {
    const score = Number(atraccion.ratings?.score);
    return Number.isFinite(score) && score > 0 ? score : null;
  }

  protected opinionesDe(atraccion: Atraccion): number { return atraccion.ratings?.number_of_reviews ?? 0; }

  protected insigniaDe(atraccion: Atraccion): string {
    const badges = (atraccion.badges ?? []).map((badge) => badge.toLocaleLowerCase());
    return atraccion.free_cancellation || badges.includes('free_cancellation')
      ? 'Cancelación gratuita'
      : 'Ver disponibilidad';
  }

  protected precioDe(atraccion: Atraccion): string {
    const total = atraccion.price?.total ?? atraccion.precioBase;
    if (total == null) return 'Consultar precio';
    return new Intl.NumberFormat('es-EC', {
      style: 'currency', currency: atraccion.price?.currency ?? 'USD', maximumFractionDigits: 2,
    }).format(total);
  }

  protected reservar(atraccion: Atraccion): void {
    void this.router.navigate(['/actividades', atraccion.id]);
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
    this.seleccionPendiente.set(null);
    this.errorLogin.set('');
  }

  protected cerrarSesion(): void {
    this.observability.track('auth', 'logout');
    this.cerrarModal();
    this.authService.logout();
    this.vistaActual.set('catalogo');
    this.misReservas.set([]);
    this.detalleReservaId.set(null); this.reservaPorCancelar.set(null); this.cancellationKeys.clear();
    this.toastService.mostrar('info', 'Has cerrado sesión correctamente.');
  }

  protected mostrarVista(vista: 'catalogo' | 'reservas'): void {
    this.vistaActual.set(vista);
    void this.router.navigateByUrl(vista === 'reservas' ? '/reservas' : '/');
    if (vista === 'reservas') this.cargarMisReservas();
  }

  protected cargarMisReservas(): void {
    if (!this.autenticado() || this.cargandoReservas()) return;
    this.cargandoReservas.set(true);
    this.errorReservas.set('');
    this.reservasService.obtenerMisReservas().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (reservas) => { this.misReservas.set(reservas); this.cargandoReservas.set(false); },
      error: (error: unknown) => {
        this.cargandoReservas.set(false);
        if (error instanceof HttpErrorResponse && error.status === 401) { this.authService.logout(); this.abrirLogin(); }
        this.errorReservas.set(httpErrorMessage(error));
      },
    });
  }

  protected iniciarCancelacion(reserva: ReservationResponse): void {
    if (this.cancelandoReserva() || reserva.status === 'CANCELADA') return;
    if (this.reservaPorCancelar()?.reservation_id === reserva.reservation_id) return;
    this.errorCancelacion.set('');
    this.cancellationKeys.set(reserva.reservation_id, crypto.randomUUID());
    this.reservaPorCancelar.set(reserva);
  }
  protected cerrarCancelacion(): void {
    if (this.cancelandoReserva()) return;
    const id = this.reservaPorCancelar()?.reservation_id;
    if (id) this.cancellationKeys.delete(id);
    this.reservaPorCancelar.set(null);
    this.errorCancelacion.set('');
  }
  private cancellationKey(id: string): string {
    if (!this.cancellationKeys.has(id)) this.cancellationKeys.set(id, crypto.randomUUID());
    return this.cancellationKeys.get(id)!;
  }

  protected fechaReserva(fecha: string): string {
    const date = new Date(`${fecha}T00:00:00`);
    return Number.isNaN(date.getTime()) ? fecha : new Intl.DateTimeFormat('es-EC', { dateStyle: 'long' }).format(date);
  }

  protected totalReservaDe(reserva: ReservationResponse): string {
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: reserva.total_price?.currency ?? 'USD' }).format(reserva.total_price?.total ?? 0);
  }

  protected tipoPaqueteLabel(tipo?: ProductType): string {
    if (tipo === 'GUIDED_TOUR') return 'Tour guiado';
    if (tipo === 'PACKAGE') return 'Paquete completo';
    return 'Entrada general';
  }

  protected async copiarCodigo(codigo: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(codigo);
      this.codigoCopiado.set(codigo);
      this.toastService.mostrar('exito', 'Código copiado al portapapeles.');
      setTimeout(() => { if (this.codigoCopiado() === codigo) this.codigoCopiado.set(null); }, 2200);
    } catch {
      this.toastService.mostrar('error', 'No se pudo copiar el código. Selecciónalo y cópialo manualmente.');
    }
  }

  protected confirmarCancelacion(): void {
    const reserva = this.reservaPorCancelar();
    if (!reserva || this.cancelandoReserva() || reserva.status === 'CANCELADA') return;
    this.errorCancelacion.set('');
    this.cancelandoReserva.set(true);
    this.reservasService.cancelarReserva(reserva.reservation_id, this.cancellationKey(reserva.reservation_id)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.misReservas.update(items => items.map(item => item.reservation_id === response.reservation_id ? response : item));
        this.detalleReservaId.set(null);
        this.cancelandoReserva.set(false);
        this.cancellationKeys.delete(reserva.reservation_id);
        this.reservaPorCancelar.set(null);
        this.toastService.mostrar('exito', 'La reserva se canceló correctamente.');
        this.cargarMisReservas();
      },
      error: (error: unknown) => {
        this.cancelandoReserva.set(false);
        if (error instanceof HttpErrorResponse && error.status === 401) { this.authService.logout(); this.abrirLogin(); }
        const message = error instanceof HttpErrorResponse && error.status === 409
          ? (error.error?.code === 'IDEMPOTENCY_KEY_REUSED' ? 'La clave de cancelacion ya pertenece a otra operacion. Revisa la reserva.' : httpErrorMessage(error))
          : httpErrorMessage(error);
        this.errorCancelacion.set(message);
        this.toastService.mostrar('error', message);
      },
    });
  }

  protected iniciarSesion(): void {
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid || this.loginEnviando()) return;

    this.loginEnviando.set(true);
    this.observability.track('auth', 'login_attempt');
    this.errorLogin.set('');
    this.authService.login(this.loginForm.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    if (this.registerForm.invalid || this.registerForm.pending || this.loginEnviando()) return;

    this.loginEnviando.set(true);
    this.observability.track('auth', 'registration_attempt');
    this.errorLogin.set('');
    this.authService.register(this.registerForm.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    if (this.vistaActual() === 'reservas') this.cargarMisReservas();
    this.toastService.mostrar('exito', 'Sesión iniciada correctamente. ¡Bienvenido!');
    const atraccion = this.atraccionPendienteDeReserva();
    this.atraccionPendienteDeReserva.set(null);
    const seleccion = this.seleccionPendiente();
    this.seleccionPendiente.set(null);
    if (atraccion && this.atraccionParaReservar()?.id !== atraccion.id) this.abrirReserva(atraccion, seleccion ?? undefined);
  }

  private abrirReserva(atraccion: Atraccion, seleccion?: BookingSelection): void {
    if (!seleccion) { this.reservar(atraccion); return; }
    this.checkoutKey = crypto.randomUUID();
    this.submittedRequest = null; this.checkoutLocked.set(false); this.checkoutBlocked.set(false);
    this.checkoutAvailabilityMessage.set(''); this.refreshingCheckoutAvailability.set(false); this.errorReserva.set('');
    this.reservaForm.enable();
    this.seleccionActiva.set(structuredClone(seleccion));
    this.reservaForm.reset({
      customer_name: this.usuario()?.name ?? '', first_name: this.usuario()?.name?.split(' ')[0] ?? '',
      last_name: this.usuario()?.name?.split(' ').slice(1).join(' ') ?? '', customer_email: this.usuario()?.email ?? '',
      identity_number: '', phone: '', cardholder: '', card_number: '', card_expiry: '', card_cvc: '', date: seleccion.date,
    });
    this.seleccionarMetodoPago('tarjeta');
    this.reservaPaso.set(1); this.atraccionParaReservar.set(atraccion);
  }

  private limpiarPagoTemporal(): void {
    for (const field of ['card_number', 'card_cvc', 'card_expiry', 'cardholder'] as const) this.reservaForm.controls[field].reset();
  }

  protected cerrarModal(): void {
    if (this.reservaEnviando()) return;
    this.limpiarPagoTemporal(); this.submittedRequest = null; this.checkoutKey = '';
    this.checkoutLocked.set(false); this.checkoutBlocked.set(false); this.refreshingCheckoutAvailability.set(false);
    this.atraccionParaReservar.set(null); this.seleccionActiva.set(null); this.errorReserva.set('');
  }

  protected editarSeleccion(): void {
    if (this.reservaEnviando() || this.checkoutLocked()) return;
    const id = this.atraccionParaReservar()?.id;
    this.cerrarModal();
    if (id) void this.router.navigate(['/actividades', id]);
  }

  protected seleccionCheckout(): BookingSelection | null { return this.seleccionActiva(); }
  protected desgloseParticipantesCheckout(): string {
    const selection = this.seleccionActiva();
    return selection ? `${selection.num_adultos} adultos + ${selection.ninos.length} ni\u00f1os` : '';
  }

  protected filtrarDigitos(event: Event, maxDigits: number, control: 'identity_number' | 'phone' | 'card_number' | 'card_cvc'): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(0, maxDigits);
    input.value = value;
    this.reservaForm.controls[control].setValue(value, { emitEvent: false });
  }

  protected filtrarLetras(event: Event, control: 'first_name' | 'last_name' | 'cardholder'): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s]/g, '').slice(0, 50);
    input.value = value;
    this.reservaForm.controls[control].setValue(value, { emitEvent: false });
  }

  protected formatearCaducidad(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    const value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    input.value = value;
    this.reservaForm.controls.card_expiry.setValue(value, { emitEvent: false });
  }

  protected seleccionarMetodoPago(metodo: 'tarjeta' | 'paypal'): void {
    if (this.checkoutLocked()) return;
    this.metodoPago.set(metodo);
    const camposTarjeta = [this.reservaForm.controls.cardholder, this.reservaForm.controls.card_number, this.reservaForm.controls.card_expiry, this.reservaForm.controls.card_cvc];
    for (const campo of camposTarjeta) {
      if (metodo === 'tarjeta') campo.setValidators([Validators.required]);
      else campo.clearValidators();
      campo.updateValueAndValidity();
    }
    if (metodo === 'tarjeta') {
      this.reservaForm.controls.cardholder.setValidators([Validators.required, Validators.maxLength(50), Validators.pattern(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/)]);
      this.reservaForm.controls.card_number.setValidators([Validators.required, Validators.pattern(/^\d{13,19}$/)]);
      this.reservaForm.controls.card_number.setAsyncValidators([creditCardAsyncValidator()]);
      this.reservaForm.controls.card_expiry.setValidators([Validators.required, Validators.pattern(/^(0[1-9]|1[0-2])\/\d{2}$/), caducidadTarjetaNoPasada]);
      this.reservaForm.controls.card_cvc.setValidators([Validators.required, Validators.pattern(/^\d{3}$/)]);
      camposTarjeta.forEach((campo) => campo.updateValueAndValidity());
    } else {
      this.limpiarPagoTemporal();
      this.reservaForm.controls.card_number.clearAsyncValidators();
      this.reservaForm.controls.card_number.updateValueAndValidity();
    }
  }

  protected validacionCheckoutPendiente(): boolean {
    return this.reservaForm.controls.identity_number.pending ||
      (this.metodoPago() === 'tarjeta' && this.reservaForm.controls.card_number.pending);
  }

  protected pagoCheckoutInvalido(): boolean {
    if (this.submittedRequest) return false;
    return !this.reservaForm.controls.identity_number.valid ||
      (this.metodoPago() === 'tarjeta' && (
        !this.reservaForm.controls.cardholder.valid ||
        !this.reservaForm.controls.card_number.valid ||
        !this.reservaForm.controls.card_expiry.valid ||
        !this.reservaForm.controls.card_cvc.valid
      ));
  }

  protected registrarErrorValidacionCheckout(field: 'identity_number' | 'card_number'): void {
    const control = this.reservaForm.controls[field];
    setTimeout(() => {
      if (control.invalid && !control.pending) this.observability.trackEvent('CHECKOUT_STEP', {
        step: field === 'identity_number' ? 'CUSTOMER_DATA' : 'PAYMENT', validation: field, result: 'invalid',
      });
    }, 0);
  }

  protected continuarPasoReserva(): void {
    const paso = this.reservaPaso();
    if (paso === 1) {
      const nombre = `${this.reservaForm.controls.first_name.value.trim()} ${this.reservaForm.controls.last_name.value.trim()}`.trim();
      this.reservaForm.controls.customer_name.setValue(nombre);
      ['first_name', 'last_name', 'customer_email', 'identity_number', 'phone'].forEach((campo) => this.reservaForm.controls[campo as 'first_name' | 'last_name' | 'customer_email' | 'identity_number' | 'phone'].markAsTouched());
      if (!this.reservaForm.controls.identity_number.valid && !this.reservaForm.controls.identity_number.pending) {
        this.observability.trackEvent('CHECKOUT_STEP', { step: 'CUSTOMER_DATA', validation: 'identity_number', result: 'invalid' });
      }
      if (this.reservaForm.controls.first_name.invalid || this.reservaForm.controls.last_name.invalid || this.reservaForm.controls.customer_email.invalid || !this.reservaForm.controls.identity_number.valid || this.reservaForm.controls.phone.invalid) return;
      this.observability.trackEvent('CHECKOUT_STEP', { step: 'CUSTOMER_DATA', action: 'completed' });
      this.reservaPaso.set(2);
    }
  }

  protected nombreTitular(): string { return this.reservaForm.controls.customer_name.value.trim(); }

  private precioUnitario(atraccion: Atraccion): number {
    return Number(atraccion.price?.total ?? atraccion.precioBase ?? 0);
  }

  protected confirmarReserva(): void {
    const attraction = this.atraccionParaReservar(); const selection = this.seleccionActiva();
    if (!attraction || !selection || this.reservaEnviando() || this.checkoutBlocked() || this.refreshingCheckoutAvailability()) return;
    if (!this.authService.isLoggedIn()) {
      this.atraccionPendienteDeReserva.set(attraction); this.seleccionPendiente.set(selection); this.abrirLogin(); return;
    }
    if (!this.submittedRequest) {
      this.reservaForm.markAllAsTouched();
      if (this.validacionCheckoutPendiente() || this.pagoCheckoutInvalido() || this.reservaForm.invalid) return;
      const count = selection.num_adultos + selection.ninos.length;
      if (!Number.isInteger(selection.num_adultos) || selection.num_adultos < 0 || count < selection.experience.min_participantes
        || (selection.experience.max_participantes !== null && count > selection.experience.max_participantes)
        || selection.ninos.some(child => !Number.isInteger(child.edad) || child.edad < 0 || child.edad > 17)
        || selection.experience.atraccion_id !== attraction.id || selection.product_type !== selection.experience.tipo_experiencia
        || !selection.date || !selection.time) {
        this.errorReserva.set('Revisa la experiencia y los participantes seleccionados.'); return;
      }
      const form = this.reservaForm.getRawValue();
      this.submittedRequest = {
        paquete_id: selection.experience.id, date: selection.date, time: selection.time,
        num_adultos: selection.num_adultos, ninos: selection.ninos.map(child => ({ edad: child.edad })),
        customer_name: form.customer_name.trim(), customer_email: form.customer_email.trim(),
        metodo_pago: this.metodoPago() === 'tarjeta' ? 'CREDIT_CARD' : 'PAYPAL',
        ...(this.metodoPago() === 'tarjeta' ? { titular_tarjeta: form.cardholder.trim(), ultimos_cuatro_digitos: form.card_number.slice(-4) } : {}),
      };
      // Freeze the logical operation after its first submission, including retries after uncertain errors.
      this.checkoutLocked.set(true); this.reservaForm.disable(); this.limpiarPagoTemporal();
    }
    const request = this.submittedRequest;
    this.errorReserva.set(''); this.reservaEnviando.set(true);
    this.reservasService.crearReserva(attraction.id, request, this.checkoutKey).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        this.reservaEnviando.set(false);
        this.reservaConfirmada.set({ reservation: response, attraction, customerName: request.customer_name, date: response.date });
        this.reservasService.notificarReservaConfirmada(attraction.id, response.date, response.time, response.total_cupos_ocupados);
        this.cerrarModal(); this.reservaForm.reset();
        this.toastService.mostrar('exito', `Reserva ${response.status.toLowerCase()}.`);
        if (this.vistaActual() === 'reservas') this.cargarMisReservas();
      },
      error: (error: unknown) => {
        this.reservaEnviando.set(false);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.authService.logout(); this.atraccionPendienteDeReserva.set(attraction); this.seleccionPendiente.set(selection); this.abrirLogin();
        }
        let message = httpErrorMessage(error);
        if (error instanceof HttpErrorResponse && error.status === 409) {
          if (error.error?.code === 'INSUFFICIENT_AVAILABILITY') {
            message = 'Los cupos cambiaron. Estamos actualizando la disponibilidad; no se cre\u00f3 otra reserva.';
            this.refrescarDisponibilidadCheckout(attraction.id, selection);
          } else if (typeof error.error?.code === 'string' && error.error.code.startsWith('IDEMPOTENCY_')) {
            this.checkoutBlocked.set(true);
            message = 'Esta operaci\u00f3n est\u00e1 asociada a otra solicitud. Revisa tus reservas antes de iniciar otra.';
          } else message = `Conflicto al confirmar: ${message}`;
        }
        this.errorReserva.set(message); this.toastService.mostrar('error', message);
      },
    });
  }

  private refrescarDisponibilidadCheckout(id: string, selection: BookingSelection): void {
    this.checkoutBlocked.set(true); this.refreshingCheckoutAvailability.set(true);
    this.reservasService.notificarDisponibilidadCambiada(id);
    const operationKey = this.checkoutKey;
    this.atraccionesService.obtenerDisponibilidad(id, selection.date, selection.product_type, selection.time).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: availability => {
        if (operationKey !== this.checkoutKey) return;
        this.refreshingCheckoutAvailability.set(false);
        this.checkoutAvailabilityMessage.set(`${availability.available_spots} cupos disponibles para el turno seleccionado.`);
        this.checkoutBlocked.set(!availability.times.includes(selection.time) || availability.available_spots < selection.num_adultos + selection.ninos.length);
      },
      error: error => {
        if (operationKey !== this.checkoutKey) return;
        this.refreshingCheckoutAvailability.set(false); this.checkoutAvailabilityMessage.set(httpErrorMessage(error));
      },
    });
  }

  protected registrarBusqueda(): void {
    this.observability.track('search', 'search_changed', { queryLength: this.terminoBusqueda().length });
  }

  protected registrarFiltro(): void {
    this.observability.track('filter', 'filter_changed', { productType: this.tipoSeleccionado(), sort: this.ordenCatalogo(), maxPrice: this.precioMaximo() });
  }

  protected cambiarPrecio(event: Event): void {
    this.precioMaximo.set(Number((event.target as HTMLInputElement).value));
    this.registrarFiltro();
  }

  protected toggleCategoria(category: string): void {
    this.categoriasSeleccionadas.update((selected) => selected.includes(category)
      ? selected.filter((value) => value !== category)
      : [...selected, category]);
    this.registrarFiltro();
  }

  protected limpiarFiltros(): void {
    this.tipoSeleccionado.set('TODOS');
    this.regionSeleccionada.set('TODAS');
    this.precioMaximo.set(500);
    this.categoriasSeleccionadas.set([]);
    this.ordenCatalogo.set('popular');
    this.terminoBusqueda.set('');
    this.registrarFiltro();
  }

  protected seleccionarSugerencia(atraccion: Atraccion): void {
    this.terminoBusqueda.set(this.nombreDe(atraccion));
    this.provinciaSeleccionada.set(null);
    this.sugerenciasAbiertas.set(false);
    this.registrarBusqueda();
  }

  protected cerrarSugerencias(): void { setTimeout(() => this.sugerenciasAbiertas.set(false), 120); }

  protected buscarExperiencias(): void {
    if (this.buscandoDisponibilidad()) return;
    this.sugerenciasAbiertas.set(false);
    const destino = this.terminoBusqueda().trim();
    this.observability.trackEvent('SEARCH', { destination: destino || null, province: this.provinciaSeleccionada(), date: this.fechaBusqueda() || null });
    this.buscandoDisponibilidad.set(true);
    void this.router.navigate(['/actividades'], { queryParams: { destino: destino || null, fecha: this.fechaBusqueda() || null } })
      .finally(() => this.buscandoDisponibilidad.set(false));
  }

  private irAResultados(): void {
    document.getElementById('resultados-atracciones')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected cerrarVoucher(): void { this.reservaConfirmada.set(null); }

  protected totalVoucher(reservation: ReservationResponse): string {
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: reservation.total_price?.currency ?? 'USD' })
      .format(reservation.total_price?.total ?? 0);
  }

  protected seleccionarRegion(region: Region): void {
    this.regionSeleccionada.set(region);
    this.destinoSeleccionado.set(null);
    this.observability.track('filter', 'region_filter_changed', { region });
  }

  protected seleccionarDestino(destination: DestinationCard): void {
    this.regionSeleccionada.set(destination.region);
    this.destinoSeleccionado.set(destination.name);
    this.terminoBusqueda.set('');
    this.observability.track('filter', 'destination_filter_changed', { destination: destination.name, region: destination.region });
    document.getElementById('resultados-atracciones')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected seleccionarProvincia(province: ProvinceCard): void {
    this.provinciaSeleccionada.set(province.name);
    this.observability.track('filter', 'province_filter_changed', { province: province.name });
    this.observability.trackEvent('SEARCH', { destination: province.name, province: province.name, action: 'province_selected' });
    void this.router.navigate(['/actividades'], { queryParams: { destino: province.name, fecha: this.fechaBusqueda() || null } });
  }

  protected limpiarDestino(): void {
    this.destinoSeleccionado.set(null);
    this.terminoBusqueda.set('');
  }

  private coincideDestino(attraction: Atraccion, destination: DestinationCard): boolean {
    const fields = [attraction.provincia, attraction.region, ...locationsOf(attraction).flatMap((location) => [location.city, location.address]), attraction.name]
      .filter(Boolean).join(' ');
    const normalized = this.normalizarTexto(fields);
    return destination.aliases.some((alias) => normalized.includes(this.normalizarTexto(alias)));
  }

  private provinciaDe(attraction: Atraccion): string | null {
    if (attraction.provincia?.trim()) {
      const explicitProvince = attraction.provincia.trim();
      return this.provincias.find((province) => this.normalizarTexto(province.name) === this.normalizarTexto(explicitProvince))?.name ?? explicitProvince;
    }
    const text = this.normalizarTexto([
      attraction.region, attraction.provincia, attraction.name,
      ...locationsOf(attraction).flatMap((location) => [location.city, location.address]),
    ].filter(Boolean).join(' '));
    const explicit = this.provincias.find((province) => text.includes(this.normalizarTexto(province.name)));
    if (explicit) return explicit.name;
    const cityToProvince: Record<string, string> = {
      quito: 'Pichincha', cayambe: 'Pichincha', mindo: 'Pichincha', guayaquil: 'Guayas', daule: 'Guayas', salitre: 'Guayas',
      ibarra: 'Imbabura', otavalo: 'Imbabura', cotacachi: 'Imbabura', ambato: 'Tungurahua', banos: 'Tungurahua', baños: 'Tungurahua',
      'puerto ayora': 'Galápagos', galapagos: 'Galápagos', galápagos: 'Galápagos', tena: 'Napo', 'el chaco': 'Napo', cuenca: 'Azuay',
      manta: 'Manabí', portoviejo: 'Manabí', montanita: 'Manabí', montañita: 'Manabí', puyo: 'Pastaza', latacunga: 'Cotopaxi',
      esmeraldas: 'Esmeraldas', riobamba: 'Chimborazo',
    };
    for (const [city, province] of Object.entries(cityToProvince)) if (text.includes(this.normalizarTexto(city))) return province;
    return null;
  }

  private categoriaCoincide(atraccion: Atraccion): boolean {
    const selected = this.categoriasSeleccionadas();
    if (selected.length === 0) return true;
    const content = this.normalizarTexto([
      ...(atraccion.categories ?? []), ...(atraccion.badges ?? []), this.nombreDe(atraccion), this.descripcionDe(atraccion),
    ].join(' '));
    const keywords: Record<string, string[]> = {
      aventura: ['aventura', 'adventure', 'hiking', 'trekking', 'rafting', 'zipline', 'ciclismo'],
      naturaleza: ['naturaleza', 'nature', 'fauna', 'wildlife', 'aves', 'bird', 'ecoturismo', 'forest', 'bosque', 'cascada'],
      cultura: ['cultura', 'culture', 'cultural', 'historia', 'history', 'patrimonio', 'museo'],
      gastronomia: ['gastronomia', 'gastronomy', 'food', 'drink', 'comida', 'cocina', 'degustacion'],
    };
    return selected.some((category) => (keywords[category] ?? [category]).some((word) => content.includes(this.normalizarTexto(word))));
  }

  private normalizarTexto(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
  }

  protected regionDe(atraccion: Atraccion): Exclude<Region, 'TODAS'> | null {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase();
    const explicit = normalize(atraccion.region ?? '');
    const text = normalize([
      atraccion.region, atraccion.name, atraccion.long_description, atraccion.provincia, ...(atraccion.categories ?? []), ...(atraccion.badges ?? []),
      ...locationsOf(atraccion).flatMap((location) => [location.address, location.city]),
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

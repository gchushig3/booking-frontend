import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AuthService } from './services/auth.service';
import { AtraccionesService, Atraccion, ProductType } from './services/atracciones.service';
import { CrearReservaDto, ReservaCreada, ReservaUsuario, ReservasService } from './services/reservas.service';
import { ToastService } from './services/toast.service';
import { ToastContainer } from './toast-container';
import { ObservabilityService } from './services/observability.service';
import { filter } from 'rxjs';
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
  reservation: ReservaCreada;
  attraction: Atraccion;
  customerName: string;
  date: string;
}

@Component({
  imports: [ReactiveFormsModule, ToastContainer, RouterLink, RouterOutlet],
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
  private readonly tipoExperienciaReserva = signal<ProductType | null>(null);
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
  protected readonly reservaPaso = signal<-1 | 0 | 1 | 2>(-1);
  protected readonly metodoPago = signal<'tarjeta' | 'paypal'>('tarjeta');
  protected readonly errorReserva = signal('');
  protected readonly vistaActual = signal<'catalogo' | 'reservas'>(['/reservas', '/historial'].includes(this.router.url.split('?')[0]) ? 'reservas' : 'catalogo');
  protected readonly misReservas = signal<ReservaUsuario[]>([]);
  protected readonly codigoCopiado = signal<string | null>(null);
  protected readonly cargandoReservas = signal(false);
  protected readonly errorReservas = signal('');
  protected readonly reservaPorCancelar = signal<ReservaUsuario | null>(null);
  protected readonly reservaParaQr = signal<ReservaUsuario | null>(null);
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
      const content = this.normalizarTexto(`${this.nombreDe(atraccion)} ${atraccion.ciudad ?? ''} ${this.descripcionDe(atraccion)}`);
      return content.includes(term);
    }).slice(0, 5);
  });
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
    time: new FormControl('10:00', { nonNullable: true, validators: [Validators.required] }),
    ticket_count: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.pattern(/^[1-9]\d*$/)],
    }),
  });
  protected readonly atraccionesFiltradas = computed(() => {
    const term = this.normalizarTexto(this.terminoBusqueda().trim());
    const tipo = this.tipoSeleccionado();
    const region = this.regionSeleccionada();
    const maxPrice = this.precioMaximo();
    const resultado = this.atracciones().filter((atraccion) => {
      const texto = this.normalizarTexto([
        this.nombreDe(atraccion), this.descripcionDe(atraccion), atraccion.provincia, atraccion.region, atraccion.ciudad,
        ...(atraccion.categories ?? []), ...(atraccion.locations ?? []).flatMap((location) => [location.city, location.address]),
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
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      const path = (event as NavigationEnd).urlAfterRedirects.split('?')[0];
      const esHistorial = path === '/reservas' || path === '/historial';
      this.rutaResultados.set(path !== '/' && !esHistorial);
      if (esHistorial) {
        this.vistaActual.set('reservas');
        this.cargarMisReservas();
      } else if (path === '/') {
        this.vistaActual.set('catalogo');
        this.provinciaSeleccionada.set(null);
      }
    });
    this.bookingNavigation.bookingRequested$.subscribe(({ attraction, selection }) => {
      if (selection) {
        this.tipoExperienciaReserva.set(selection.product_type);
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
    const hoursFromField = Number(atraccion.duracionHoras ?? 0);
    const hours = hoursFromField > 0 ? hoursFromField : Number(atraccion.duration?.match(/PT(?:(\d+)H)?/i)?.[1] ?? 0);
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
      : 'Confirmación inmediata';
  }

  protected precioDe(atraccion: Atraccion): string {
    const total = atraccion.price?.total ?? atraccion.precioTicket;
    if (total == null) return 'Consultar precio';
    return new Intl.NumberFormat('es-EC', {
      style: 'currency', currency: atraccion.price?.currency ?? 'USD', maximumFractionDigits: 2,
    }).format(total);
  }

  protected nombrePaquete(atraccion: Atraccion): string {
    if (atraccion.product_type === 'GUIDED_TOUR') return 'Tour guiado';
    if (atraccion.product_type === 'PACKAGE') return 'Paquete completo';
    return 'Entrada general';
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
    void this.router.navigateByUrl(vista === 'reservas' ? '/reservas' : '/');
    if (vista === 'reservas') this.cargarMisReservas();
  }

  protected cargarMisReservas(): void {
    if (!this.autenticado() || this.cargandoReservas()) return;
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

  protected mostrarQrReserva(reserva: ReservaUsuario): void {
    this.reservaParaQr.set(reserva);
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
    const seleccion = this.seleccionPendiente();
    this.seleccionPendiente.set(null);
    if (atraccion) this.abrirReserva(atraccion, seleccion ?? undefined);
  }

  private abrirReserva(atraccion: Atraccion, seleccion?: BookingSelection): void {
    this.observability.track('modal', 'booking_modal_opened', { attractionId: atraccion.id });
    this.reservaForm.reset({
      customer_name: this.usuario()?.name ?? '',
      first_name: this.usuario()?.name?.split(' ')[0] ?? '',
      last_name: this.usuario()?.name?.split(' ').slice(1).join(' ') ?? '',
      customer_email: this.usuario()?.email ?? '',
      identity_number: '',
      phone: '',
      cardholder: '', card_number: '', card_expiry: '', card_cvc: '',
      date: seleccion?.date ?? this.fechaMinima,
      time: seleccion?.time ?? '10:00',
      ticket_count: seleccion?.ticket_count ?? 1,
    });
    this.seleccionarMetodoPago('tarjeta');
    this.reservaPaso.set(seleccion ? 1 : -1);
    this.tipoExperienciaReserva.set(seleccion?.product_type ?? null);
    this.seleccionActiva.set(seleccion ?? null);
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
    const seleccion = this.seleccionActiva();
    if (seleccion) {
      if (seleccion.product_type === 'GUIDED_TOUR') {
        return Math.floor(seleccion.adult_count / 2) * 57 + (seleccion.adult_count % 2) * 50;
      }
      return atraccion ? this.precioPaquete(atraccion, seleccion.product_type) * seleccion.adult_count : seleccion.checkout_total;
    }
    return (atraccion ? this.precioPaquete(atraccion, this.tipoExperienciaReserva() ?? atraccion.product_type ?? 'SINGLE_TICKET') : 0) * cantidad;
  }

  protected desgloseParticipantesCheckout(): string | null {
    const seleccion = this.seleccionActiva();
    if (!seleccion) return null;
    return `${seleccion.adult_count} adulto(s) pagante(s) + ${seleccion.child_count} niño(s) sin costo`;
  }

  protected tieneDesgloseParticipantes(): boolean { return this.seleccionActiva() !== null; }

  protected desgloseTourCheckout(): string | null {
    const seleccion = this.seleccionActiva();
    if (!seleccion || seleccion.product_type !== 'GUIDED_TOUR') return null;
    const parejas = Math.floor(seleccion.adult_count / 2);
    const impar = seleccion.adult_count % 2;
    return `${parejas} pareja(s) × $57.00${impar ? ' + 1 persona × $50.00' : ''} = ${this.totalReservaFormateado()}`;
  }

  protected precioPaqueteFormateado(atraccion: Atraccion): string {
    return new Intl.NumberFormat('es-EC', {
      style: 'currency', currency: atraccion.package_prices?.[this.tipoExperienciaReserva() ?? atraccion.product_type ?? 'SINGLE_TICKET']?.currency ?? atraccion.price?.currency ?? 'USD', maximumFractionDigits: 2,
    }).format(this.precioPaquete(atraccion, this.tipoExperienciaReserva() ?? atraccion.product_type ?? 'SINGLE_TICKET'));
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
      this.reservaForm.controls.card_number.clearAsyncValidators();
      this.reservaForm.controls.card_number.updateValueAndValidity();
    }
  }

  protected validacionCheckoutPendiente(): boolean {
    return this.reservaForm.controls.identity_number.pending ||
      (this.metodoPago() === 'tarjeta' && this.reservaForm.controls.card_number.pending);
  }

  protected pagoCheckoutInvalido(): boolean {
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

  private precioPaquete(atraccion: Atraccion, tipo: ProductType): number {
    const base = this.precioUnitario(atraccion);
    const multiplicador: Record<ProductType, number> = { SINGLE_TICKET: 1, GUIDED_TOUR: 1.5, PACKAGE: 2 };
    const configurado = atraccion.package_prices ?? {};
    const basico = Number(configurado.SINGLE_TICKET?.total ?? base);
    const guiado = Math.max(Number(configurado.GUIDED_TOUR?.total ?? base * multiplicador.GUIDED_TOUR), basico + 0.01);
    const completo = Math.max(Number(configurado.PACKAGE?.total ?? base * multiplicador.PACKAGE), guiado + 0.01);
    return Math.round(({ SINGLE_TICKET: basico, GUIDED_TOUR: guiado, PACKAGE: completo })[tipo] * 100) / 100;
  }

  protected continuarPasoReserva(): void {
    const paso = this.reservaPaso();
    if (paso === -1) {
      this.observability.trackEvent('CHECKOUT_STEP', { step: 'ATTRACTION', action: 'continue_to_availability' });
      this.reservaPaso.set(0);
      return;
    }
    if (paso === 0) {
      ['date', 'time', 'ticket_count'].forEach((campo) => this.reservaForm.controls[campo as 'date' | 'time' | 'ticket_count'].markAsTouched());
      if (this.reservaForm.controls.date.invalid || this.reservaForm.controls.time.invalid || this.reservaForm.controls.ticket_count.invalid) return;
      this.observability.trackEvent('CHECKOUT_STEP', { step: 'AVAILABILITY', action: 'completed', ticketCount: this.reservaForm.controls.ticket_count.value });
      this.reservaPaso.set(1);
      return;
    }
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
    if (this.validacionCheckoutPendiente()) return;
    if (this.reservaForm.controls.identity_number.invalid) {
      this.observability.trackEvent('CHECKOUT_STEP', { step: 'CUSTOMER_DATA', validation: 'identity_number', result: 'invalid' });
      return;
    }
    if (this.metodoPago() === 'tarjeta' && this.reservaForm.controls.card_number.invalid) {
      this.observability.trackEvent('CHECKOUT_STEP', { step: 'PAYMENT', validation: 'card_number', result: 'invalid' });
      return;
    }
    if (this.pagoCheckoutInvalido()) return;
    if (this.reservaForm.invalid) return;

    const formulario = this.reservaForm.getRawValue();
    const datos: CrearReservaDto = {
      date: formulario.date,
      time: formulario.time,
      ticket_count: formulario.ticket_count,
      customer_name: formulario.customer_name.trim(),
      customer_email: formulario.customer_email.trim(),
      ...(this.tipoExperienciaReserva() ? { product_type: this.tipoExperienciaReserva()! } : {}),
    };
    this.observability.track('booking', 'booking_attempt', { attractionId: atraccion.id, ticketCount: datos.ticket_count });
    this.observability.trackEvent('CHECKOUT_STEP', { step: 'PAYMENT', action: 'reservation_submitted', productType: datos.product_type, ticketCount: datos.ticket_count });
    this.errorReserva.set('');
    this.reservaEnviando.set(true);
    this.reservasService.crearReserva(atraccion.id, datos).subscribe({
      next: (reservation) => {
        this.reservasService.notificarReservaConfirmada(
          atraccion.id,
          reservation.date ?? datos.date,
          reservation.time ?? datos.time,
          reservation.ticket_count,
        );
        this.observability.trackEvent('RESERVATION_SUCCESS', { attractionId: atraccion.id, reservationCode: reservation.reservation_id, productType: reservation.product_type ?? datos.product_type, ticketCount: reservation.ticket_count });
        this.reservaEnviando.set(false);
        this.reservaConfirmada.set({ reservation, attraction: atraccion, customerName: datos.customer_name, date: reservation.date ?? datos.date });
        this.atraccionParaReservar.set(null);
        this.reservaForm.reset({
          customer_name: '', customer_email: '', phone: '', date: this.fechaMinima, time: '10:00', ticket_count: 1,
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

  protected qrUrl(reservationId: string): string {
    const payload = encodeURIComponent(`BOOKING-RESERVATION:${reservationId}`);
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${payload}`;
  }

  protected cerrarVoucher(): void { this.reservaConfirmada.set(null); }

  protected totalVoucher(reservation: ReservaCreada): string {
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
    const fields = [attraction.provincia, attraction.region, attraction.ciudad, ...(attraction.locations ?? []).flatMap((location) => [location.city, location.address]), attraction.name, attraction.nombre]
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
      attraction.region, attraction.ciudad, attraction.name, attraction.nombre,
      ...(attraction.locations ?? []).flatMap((location) => [location.city, location.address]),
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

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AttractionDetail } from './attraction-detail';
import { API_URL } from '../../core/api.config';
import { BookingNavigationService, BookingSelection } from '../../services/booking-navigation.service';
import { attraction, experience } from '../../testing/booking.fixtures';
import { PaqueteExperiencia } from '../../contracts/atracciones.contracts';

describe('Attraction booking detail', () => {
  let fixture: ComponentFixture<AttractionDetail>;
  let component: AttractionDetail;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const base = '/api/v1/atracciones/' + attraction.id;
  beforeEach(() => {
    localStorage.clear(); params = new BehaviorSubject(convertToParamMap({ id: attraction.id }));
    TestBed.configureTestingModule({ imports: [AttractionDetail], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }, { provide: ActivatedRoute, useValue: { paramMap: params.asObservable(), snapshot: { paramMap: params.value } } }] });
    fixture = TestBed.createComponent(AttractionDetail); component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); localStorage.clear(); });
  function load(packages: PaqueteExperiencia[] = [experience]) {
    http.expectOne(base).flush(attraction);
    http.expectOne(base + '/paquetes').flush(packages);
    if (packages.length === 1) {
      http.expectOne(req => req.url === base + '/availability').flush({ date: component['date'](), times: [], available_spots: 0 });
    }
    fixture.detectChanges();
  }
  function available(pkg = experience) {
    component['selectDate']('2099-10-10');
    if (component['selectedPackage']()) http.expectOne(req => req.url === base + '/availability');
    component['choose'](pkg);
    const initial = http.expectOne(req => req.url === base + '/availability' && !req.params.has('time'));
    expect(initial.request.params.get('product_type')).toBe(pkg.tipo_experiencia);
    initial.flush({ date: '2099-10-10', times: ['11:15', '15:45'], available_spots: 7, product_type: pkg.tipo_experiencia });
    http.expectOne(req => req.url === base + '/availability' && req.params.get('time') === '11:15').flush({ date: '2099-10-10', time: '11:15', times: ['11:15', '15:45'], available_spots: 7, product_type: pkg.tipo_experiencia });
    fixture.detectChanges();
  }
  function participants(adults = 2, ages: (number | null)[] = [6]) {
    component['participantsForm'].controls.num_adultos.setValue(adults);
    component['participantsForm'].controls.num_ninos.setValue(ages.length);
    component['participantsForm'].controls.ninos.setValue(ages);
    fixture.detectChanges();
  }
  it('shows loading and renders only real packages with their data', () => {
    expect(fixture.nativeElement.textContent).toContain('Cargando ficha');
    load();
    expect(fixture.nativeElement.textContent).toContain(experience.nombre_paquete);
    expect(fixture.nativeElement.textContent).toContain(experience.descripcion);
    expect(fixture.nativeElement.textContent).toContain('37.00');
    expect(fixture.nativeElement.textContent).toContain('Policy from backend');
    expect(fixture.nativeElement.textContent).not.toContain('Entrada general');
    expect(fixture.nativeElement.textContent).not.toContain('Paquete completo');
    expect(component['packages']()).toEqual([experience]);
  });
  it('blocks booking when the backend has no packages', () => {
    load([]); expect(fixture.nativeElement.textContent).toContain('No hay experiencias disponibles');
    expect(component['canAdvance']()).toBe(false);
    component['next'](); http.expectNone(req => req.url.endsWith('/availability'));
  });
  it('shows 404 rather than treating it as a valid attraction', () => {
    const packages = http.expectOne(base + '/paquetes');
    http.expectOne(base).flush({ message: 'Attraction missing' }, { status: 404, statusText: 'Not found' });
    expect(packages.cancelled).toBe(true);
    http.expectNone(req => req.url === base + '/availability');
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('No encontramos');
    expect(fixture.nativeElement.textContent).toContain('Attraction missing');
  });
  it('shows server failures distinctly from 404', () => {
    const packages = http.expectOne(base + '/paquetes');
    http.expectOne(base).flush({ message: 'Server unavailable' }, { status: 500, statusText: 'Server Error' });
    expect(packages.cancelled).toBe(true);
    fixture.detectChanges(); expect(component['notFound']()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Server unavailable');
  });
  it('shows a packages error without discarding attraction data', () => {
    http.expectOne(base).flush(attraction);
    http.expectOne(base + '/paquetes').flush({ message: 'Packages unavailable' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges(); expect(component['attraction']()?.id).toBe(attraction.id);
    expect(fixture.nativeElement.textContent).toContain('Packages unavailable'); expect(component['canAdvance']()).toBe(false);
  });
  it('uses backend times, not attraction defaults or frontend constants', () => {
    load(); available();
    const times = [...fixture.nativeElement.querySelectorAll('select option')].map((option: any) => option.value);
    expect(times).toEqual(['', '11:15', '15:45']);
    component['selectTime']('15:45');
    const query = http.expectOne(req => req.url === base + '/availability' && req.params.get('time') === '15:45');
    query.flush({ date: '2099-10-10', time: '15:45', times: ['11:15', '15:45'], available_spots: 4 });
    expect(component['availability']()?.available_spots).toBe(4);
  });
  it('represents two adults and one child with an individual age', () => {
    load(); available(); participants();
    let selected: BookingSelection | undefined;
    TestBed.inject(BookingNavigationService).bookingRequested$.subscribe(request => selected = request.selection);
    component['next']();
    expect(selected?.num_adultos).toBe(2); expect(selected?.ninos).toEqual([{ edad: 6 }]);
    expect(selected?.experience).toEqual(experience); expect(selected?.product_type).toBe(experience.tipo_experiencia);
    expect(selected).not.toHaveProperty('ticket_count'); expect(selected).not.toHaveProperty('checkout_total');
  });
  it('adds one reactive age per child and removes only surplus ages', () => {
    load(); available(); participants(2, [4, 8, 12]);
    expect(fixture.nativeElement.querySelectorAll('[formarrayname="ninos"] input').length).toBe(3);
    component['participantsForm'].controls.num_ninos.setValue(1); fixture.detectChanges();
    expect(component['participantsForm'].controls.ninos.getRawValue()).toEqual([4]);
    expect(fixture.nativeElement.querySelectorAll('[formarrayname="ninos"] input').length).toBe(1);
  });
  it('blocks advancing if any age is missing or outside the DTO range', () => {
    load(); available(); participants(2, [null]); expect(component['canAdvance']()).toBe(false);
    for (const age of [-1, 18, 6.5]) { participants(2, [age]); expect(component['canAdvance']()).toBe(false); }
    participants(2, [0]); expect(component['canAdvance']()).toBe(true);
  });
  it('enforces the package minimum, including free children as participants', () => {
    load(); available(); participants(1, [6]); expect(component['canAdvance']()).toBe(false);
    expect(component['participantMessage']()).toContain('3');
    participants(2, [6]); expect(component['canAdvance']()).toBe(true);
  });
  it('enforces the package maximum without a hardcoded group limit', () => {
    load(); available(); participants(4, [4, 8]); expect(component['canAdvance']()).toBe(false);
    expect(component['participantMessage']()).toContain('5');
    participants(4, [4]); expect(component['canAdvance']()).toBe(true);
  });
  it('counts free children against physical availability', () => {
    load(); available(); participants(); component['selectTime']('15:45');
    http.expectOne(req => req.url === base + '/availability').flush({ date: '2099-10-10', time: '15:45', times: ['15:45'], available_spots: 2 });
    expect(component['canAdvance']()).toBe(false);
    expect(component['participantMessage']()).toContain('cupos');
  });
  it('renders childhood policy only when supplied and never invents a total', () => {
    const pkg = { ...experience, politicas_json: {} }; load([pkg]); available(pkg); participants();
    expect(fixture.nativeElement.textContent).not.toContain('sin costo');
    expect(fixture.nativeElement.textContent).toContain('Total final calculado al confirmar');
  });
  it('cancels an old date query before allowing its response to overwrite the new one', () => {
    load(); component['choose'](experience);
    const obsolete = http.expectOne(req => req.url === base + '/availability');
    component['selectDate']('2099-10-11'); expect(obsolete.cancelled).toBe(true);
    http.expectOne(req => req.url === base + '/availability' && req.params.get('date') === '2099-10-11').flush({ date: '2099-10-11', times: ['17:35'], available_spots: 9 });
    http.expectOne(req => req.url === base + '/availability' && req.params.get('time') === '17:35').flush({ date: '2099-10-11', time: '17:35', times: ['17:35'], available_spots: 9 });
    expect(component['date']()).toBe('2099-10-11'); expect(component['selectedTime']()).toBe('17:35');
    expect(component['availability']()?.date).toBe('2099-10-11');
  });
  it('cancels old experience and time queries', () => {
    const other = { ...experience, id: 'other', tipo_experiencia: 'PACKAGE' as const }; load([experience, other]);
    component['choose'](experience); const old = http.expectOne(req => req.url === base + '/availability');
    component['choose'](other); expect(old.cancelled).toBe(true);
    http.expectOne(req => req.url === base + '/availability' && req.params.get('product_type') === 'PACKAGE').flush({ date: component['date'](), times: ['13:05', '16:25'], available_spots: 8 });
    const firstTime = http.expectOne(req => req.url === base + '/availability' && req.params.get('time') === '13:05');
    component['selectTime']('16:25'); expect(firstTime.cancelled).toBe(true);
    http.expectOne(req => req.url === base + '/availability' && req.params.get('time') === '16:25').flush({ date: component['date'](), time: '16:25', times: ['13:05', '16:25'], available_spots: 5 });
    expect(component['selectedTime']()).toBe('16:25'); expect(component['availability']()?.available_spots).toBe(5);
  });
  it('selects two packages of the same modality independently without blocking', () => {
    const duplicate = { ...experience, id: 'duplicate', nombre_paquete: 'Another package' };
    load([experience, duplicate]); available(); participants();
    const choices: BookingSelection[] = [];
    TestBed.inject(BookingNavigationService).bookingRequested$.subscribe(request => choices.push(request.selection));
    expect(component['canAdvance']()).toBe(true); component['next']();
    component['choose'](duplicate);
    http.expectOne(req => req.url === base + '/availability' && !req.params.has('time')).flush({ date: '2099-10-10', times: ['11:15'], available_spots: 7 });
    http.expectOne(req => req.url === base + '/availability' && req.params.get('time') === '11:15').flush({ date: '2099-10-10', time: '11:15', times: ['11:15'], available_spots: 7 });
    expect(component['canAdvance']()).toBe(true); component['next']();
    expect(choices.map(choice => choice.experience.id)).toEqual([experience.id, duplicate.id]);
    expect(choices.map(choice => choice.product_type)).toEqual([experience.tipo_experiencia, duplicate.tipo_experiencia]);
  });
  it('shows unavailable dates and blocks advancement', () => {
    load(); component['choose'](experience);
    http.expectOne(req => req.url === base + '/availability').flush({ date: component['date'](), times: [], available_spots: 0 });
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Sin cupos'); expect(component['canAdvance']()).toBe(false);
  });
  it('propagates availability errors and cleans up in-flight requests on destruction', () => {
    load(); component['choose'](experience);
    http.expectOne(req => req.url === base + '/availability').flush({ message: 'Availability unavailable' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Availability unavailable');
    component['loadAvailability'](); const pending = http.expectOne(req => req.url === base + '/availability');
    fixture.destroy(); expect(pending.cancelled).toBe(true);
  });
  it('automatically selects the sole real package and renders the date on initial display', () => {
    load();
    expect(component['selectedPackage']()?.id).toBe(experience.id);
    expect(fixture.nativeElement.querySelector('input[type="date"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Paquete seleccionado');
  });
  it('makes multiple-package selection explicit and shows date after clicking the actual choice', () => {
    const other = { ...experience, id: 'second-package' }; load([experience, other]);
    expect(fixture.nativeElement.querySelector('input[type="date"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Seleccionar paquete');
    fixture.nativeElement.querySelector('article button').click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="date"]')).not.toBeNull();
    http.expectOne(req => req.url === base + '/availability').flush({ date: component['date'](), times: [], available_spots: 0 });
  });
  it('date change clears the old time and renders loading until the real response arrives', () => {
    load(); available(); component['selectDate']('2099-10-12'); fixture.detectChanges();
    expect(component['selectedTime']()).toBe('');
    expect(fixture.nativeElement.textContent).toContain('Consultando horarios');
    const request = http.expectOne(req => req.url === base + '/availability');
    expect(request.request.params.get('date')).toBe('2099-10-12');
    expect(request.request.params.get('product_type')).toBe(experience.tipo_experiencia);
    request.flush({ date: '2099-10-12', times: [], available_spots: 0 }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay horarios disponibles para esta fecha.');
  });
  it('adult and child increment/decrement controls update separate counts and remove surplus ages', () => {
    load(); component['incrementAdult'](); component['incrementAdult']();
    component['incrementChild'](); component['incrementChild']();
    expect(component['adults']()).toBe(2); expect(component['children']()).toBe(2);
    expect(component['participantsForm'].controls.ninos.length).toBe(2);
    component['decrementChild'](); component['decrementAdult']();
    expect(component['adults']()).toBe(1); expect(component['children']()).toBe(1);
    expect(component['participantsForm'].controls.ninos.length).toBe(1);
  });
  it('disables the rendered next button until valid and preserves all chosen fields on navigation', () => {
    load();
    const button = () => fixture.nativeElement.querySelector('aside > button') as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    available(); participants(2, [8]); expect(button().disabled).toBe(false);
    let request: any; TestBed.inject(BookingNavigationService).bookingRequested$.subscribe(value => request = value);
    button().click();
    expect(request.attraction.id).toBe(attraction.id);
    expect(request.selection).toEqual({ experience, product_type: experience.tipo_experiencia, date: '2099-10-10', time: '11:15', num_adultos: 2, ninos: [{ edad: 8 }] });
  });
  it('presents policies as readable server values instead of JSON', () => {
    load([{ ...experience, politicas_json: { cancelacion: { permitida: true, horas_antes: 36 }, edad_nino_gratis_hasta: 9 } }]);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Cancelación permitida hasta 36 horas antes.');
    expect(text).toContain('Niños hasta 9 años tienen tarifa gratuita.');
    expect(text).not.toContain('horas_antes'); expect(text).not.toContain('edad_nino_gratis_hasta');
    expect(fixture.nativeElement.querySelector('pre')).toBeNull();
  });

});

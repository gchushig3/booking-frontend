import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import jsQR from 'jsqr';
import { ReservationQr } from './reservation-qr';

const identifier = 'a1234567-1234-4234-8234-123456789abc';
// Decode the rendered SVG with an independent decoder, rather than checking
// only the input passed to the encoder. No scanner is shipped in the app.
function decode(svg: SVGElement): string | undefined {
  const modules = Number(svg.getAttribute('viewBox')!.split(' ')[2]); const scale = 8;
  const width = modules * scale; const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const match of svg.querySelector('path')!.getAttribute('d')!.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const x = Number(match[1]) * scale; const y = Number(match[2]) * scale;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const index = ((y + dy) * width + x + dx) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
    }
  }
  return jsQR(pixels, width, width, { inversionAttempts: 'dontInvert' })?.data;
}

describe('Local reservation QR presentation', () => {
  let fixture: ComponentFixture<ReservationQr>; let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ReservationQr], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); fixture = TestBed.createComponent(ReservationQr);
    fixture.componentRef.setInput('identifier', identifier); fixture.componentRef.setInput('status', 'CONFIRMADA');
  });
  afterEach(() => { fixture.destroy(); http.verify(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  function svg(): SVGElement { fixture.detectChanges(); return fixture.nativeElement.querySelector('svg'); }
  it('shows a decodable QR and instructions only for a confirmed reservation', () => {
    expect(svg()).toBeTruthy(); expect(decode(svg())).toBe(identifier);
    expect(fixture.nativeElement.textContent).toContain('Presenta este código o QR al ingresar a la atracción.');
  });
  it('encodes the exact identifier returned by the reservation', () => {
    const actualId = 'b0000000-0000-4000-8000-000000000001'; fixture.componentRef.setInput('identifier', actualId);
    expect(decode(svg())).toBe(actualId);
    expect(fixture.nativeElement.querySelector('[data-reservation-code]').textContent).toContain(actualId);
  });
  it('produces the same QR after rerendering and recreating with the same identifier', () => {
    const path = svg().querySelector('path')!.getAttribute('d');
    fixture.detectChanges(); expect(svg().querySelector('path')!.getAttribute('d')).toBe(path);
    fixture.destroy(); fixture = TestBed.createComponent(ReservationQr);
    fixture.componentRef.setInput('identifier', identifier); fixture.componentRef.setInput('status', 'CONFIRMADA');
    expect(svg().querySelector('path')!.getAttribute('d')).toBe(path); expect(decode(svg())).toBe(identifier);
  });
  for (const [label, secret] of [['name', 'Ana Perez'], ['email', 'ana@example.test'], ['identity number', '1710034065'], ['payment data', 'PAYPAL'], ['PAN', '4242424242424242'], ['CVV', 'cvv=123'], ['JWT', 'Bearer private-token']]) {
    it(`does not encode ${label}`, () => { const content = decode(svg())!; expect(content).toBe(identifier); expect(content).not.toContain(secret); });
  }
  it('removes an existing QR when the reservation becomes cancelled', () => {
    expect(svg()).toBeTruthy(); fixture.componentRef.setInput('status', 'CANCELADA'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('svg')).toBeNull(); expect(fixture.componentInstance.matrix()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Reserva cancelada');
    expect(fixture.nativeElement.textContent).not.toContain('Presenta este código o QR');
  });
  it('represents pending without presenting a confirmed QR', () => {
    fixture.componentRef.setInput('status', 'PENDIENTE'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('svg')).toBeNull(); expect(fixture.nativeElement.textContent).toContain('Reserva pendiente');
  });
  it('rejects arbitrary personal content in place of an opaque UUID', () => {
    fixture.componentRef.setInput('identifier', 'ana@example.test'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('svg')).toBeNull(); expect(fixture.nativeElement.textContent).not.toContain('ana@example.test');
  });
  it('generates offline without fetch, XHR, HttpClient or remote images', () => {
    const fetch = vi.fn(() => { throw new Error('Network must not be used'); }); vi.stubGlobal('fetch', fetch);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    expect(decode(svg())).toBe(identifier); http.expectNone(() => true);
    expect(fetch).not.toHaveBeenCalled(); expect(xhr).not.toHaveBeenCalled();
    expect(svg().querySelector('image,foreignObject')).toBeNull(); expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.innerHTML).not.toContain(['api', 'qrserver', 'com'].join('.'));
  });
});

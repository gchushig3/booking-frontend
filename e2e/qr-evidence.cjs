// Test-only independent decoding of the SVG actually displayed in Chrome.
const jsQR = require('jsqr');
async function inspectQr(page, scope = page) {
  const component = scope.locator('app-reservation-qr');
  const svg = component.locator('svg[aria-label="QR de reserva"]'); await svg.waitFor({ state: 'visible' });
  const data = await svg.evaluate(async element => {
    const source = new XMLSerializer().serializeToString(element);
    const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
    await image.decode();
    const side = Number(element.getAttribute('viewBox').split(' ')[2]) * 8;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = side;
    const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, side, side);
    return { width: side, pixels: Array.from(context.getImageData(0, 0, side, side).data), path: element.querySelector('path').getAttribute('d'), externalReferences: element.querySelectorAll('image,foreignObject,[href],[src]').length };
  });
  const decoded = jsQR(new Uint8ClampedArray(data.pixels), data.width, data.width, { inversionAttempts: 'dontInvert' });
  if (!decoded) throw new Error('Rendered QR cannot be decoded');
  return { content: decoded.data, code: (await component.locator('[data-reservation-code]').textContent()).trim(), path: data.path, externalReferences: data.externalReferences };
}
module.exports = { inspectQr };

// Frontend-only verification. All API traffic is intercepted; no database is used.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const site = process.env.ADMIN_UI_URL || 'http://127.0.0.1:4210';
  const browser = await chromium.launch({ headless: true, ...(process.env.ADMIN_BROWSER_CHANNEL ? { channel: process.env.ADMIN_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1365, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  const writes = [];
  let attraction;
  const packages = [];
  let spots = 0;
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(() => {
    localStorage.setItem('access_token', 'h.' + btoa(JSON.stringify({ sub: 'test-admin', role: 'ADMIN', type: 'user' })) + '.s');
    localStorage.setItem('auth_user', JSON.stringify({ id: 'test-admin', name: 'Administrador', email: 'admin@example.test' }));
  });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (!url.pathname.startsWith('/api/v1/')) {
      return url.origin === new URL(site).origin ? route.continue() : route.abort();
    }
    const body = request.postDataJSON();
    if (request.method() !== 'GET') writes.push({ path: url.pathname, method: request.method(), body });
    if (url.pathname === '/api/v1/atracciones' && request.method() === 'POST') {
      attraction = { ...body, id: 'test-attraction', provincia: '', region: '', categoria: 'Tours', price: body.price || { currency: 'USD', total: 0 }, precioBase: 0, horariosDisponibles: [], cuposTotales: 0, tipoExperienciaPermitidos: [body.product_type] };
      return reply(attraction, 201);
    }
    if (url.pathname === '/api/v1/atracciones') return reply({ data: attraction ? [attraction] : [], meta: { total: attraction ? 1 : 0, page: 1, lastPage: 1 } });
    if (url.pathname.endsWith('/paquetes')) {
      if (request.method() === 'POST') { packages.push({ ...body, id: 'test-package', atraccion_id: attraction.id, moneda: 'USD', politicas_json: {} }); return reply({ id: 'test-package' }, 201); }
      return reply(packages);
    }
    if (url.pathname.endsWith('/availability')) {
      if (request.method() === 'PUT') { spots = body.capacidad_total; return reply({}); }
      return reply({ date: url.searchParams.get('date'), available_spots: spots, times: spots ? ['11:00'] : [] });
    }
    if (url.pathname === '/api/v1/observabilidad/eventos') return reply({});
    return reply({ message: 'Unexpected mock request' }, 404);
  });
  try {
    await page.goto(site + '/admin/atracciones');
    await page.getByRole('button', { name: '+ Crear atracción', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Completa el nombre');
    await page.getByLabel('Nombre de la atracción').fill('Caminata Cotopaxi');
    await page.getByLabel('Descripción', { exact: false }).fill('Recorrido con guía para conocer los paisajes del Cotopaxi.');
    await page.getByLabel('Tipo de actividad').selectOption('GUIDED_TOUR');
    await page.getByLabel('Duración en horas').fill('3');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByLabel('¿Qué incluye?').fill('Guía local\nTransporte');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Revisa tu atracción' })).toBeVisible();
    const evidence = path.join(__dirname, 'evidence');
    fs.mkdirSync(evidence, { recursive: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(evidence, 'admin-creation-review.png'), fullPage: true });
    await page.getByRole('button', { name: 'Guardar y configurar experiencias' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva experiencia', exact: true })).toBeVisible();
    await page.getByLabel('Nombre de la experiencia').fill('Caminata con guía');
    await page.getByLabel('Precio por participante').fill('25');
    await page.getByRole('button', { name: 'Guardar experiencia', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Configurar un turno' })).toBeVisible();
    await page.getByLabel('Fecha', { exact: false }).fill('2027-01-10');
    await page.getByLabel('Hora de inicio').fill('11:00');
    await page.getByLabel('Capacidad total del turno').fill('12');
    await page.getByRole('button', { name: 'Guardar turno', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '12 cupos disponibles' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(evidence, 'admin-creation-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile view must not overflow horizontally');
    await page.getByRole('button', { name: '← Volver al catálogo' }).click();
    await page.getByLabel('Buscar atracción por nombre').fill('Cotopaxi');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Caminata Cotopaxi' })).toBeVisible();
    assert.equal(writes.find(item => item.path === '/api/v1/atracciones').body.duration, 'PT3H');
    assert.equal(writes.filter(item => item.method === 'POST' && item.path.endsWith('/paquetes')).length, 1);
    assert.deepEqual(errors, []);
    console.log('Admin creation: wizard, experience, slot, search and mobile layout passed with mocked APIs.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

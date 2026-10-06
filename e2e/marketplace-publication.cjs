const { chromium, expect } = require('@playwright/test');
const { randomUUID, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('../../booking-backend/node_modules/pg');
const { hash } = require('../../booking-backend/node_modules/bcryptjs');
require('../../booking-backend/node_modules/dotenv').config({ path: path.resolve('../booking-backend/.env'), quiet: true });
const site = 'http://localhost:4200'; const api = 'http://localhost:3000/api/v1';
async function login(page, credentials) {
  await page.goto(site); await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).first().click();
  await page.locator('[formcontrolname="email"]').fill(credentials.email); await page.locator('[formcontrolname="password"]').fill(credentials.password);
  const response = page.waitForResponse(r => r.url().endsWith('/auth/login'));
  await page.locator('form').getByRole('button', { name: 'Iniciar sesión', exact: true }).click(); expect((await response).status()).toBe(200);
  await page.getByRole('button', { name: 'Catálogo', exact: true }).waitFor();
}
async function findAdminRow(page, name) {
  const row = page.locator('tr').filter({ hasText: name });
  for (let index = 0; index < 100; index++) {
    await expect(page.getByRole('button', { name: 'Actualizar listado', exact: true })).toBeEnabled();
    if (await row.count()) return row;
    const next = page.getByRole('button', { name: 'Siguiente', exact: true });
    if (await next.isDisabled()) throw new Error('Published attraction not found in ADMIN');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/atracciones' && r.request().method() === 'GET');
    await next.click(); await response;
  }
  throw new Error('Pagination exceeded test bound');
}
async function searchClient(page, name) {
  const catalog = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/atracciones' && r.request().method() === 'GET');
  await page.goto(site); expect((await catalog).status()).toBe(200);
  await page.locator('#busqueda-hero').fill(name); await page.locator('#busqueda-hero').press('Escape');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  return page.getByRole('link', { name: 'Ver disponibilidad para ' + name, exact: true });
}
async function main() {
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Publication fixtures require local TEST/DEV');
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const report = { requests: [], checks: {} }; const ids = []; let attractionId; let browser; let adminPage;
  const name = 'Publicacion Quito ' + randomUUID().slice(0, 8);
  fs.mkdirSync('e2e/evidence', { recursive: true });
  try {
    const credentials = {};
    for (const role of ['ADMIN', 'CLIENTE']) {
      const email = `publication-${randomUUID()}@example.test`; const password = randomBytes(20).toString('hex');
      const user = (await db.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id', ['Publication fixture', email, await hash(password, 12), role])).rows[0]; ids.push(user.id); credentials[role] = { email, password };
    }
    browser = await chromium.launch({ channel: 'chrome', headless: false });
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const clientContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    adminPage = await adminContext.newPage(); const clientPage = await clientContext.newPage(); adminPage.setDefaultTimeout(20000); clientPage.setDefaultTimeout(20000);
    for (const page of [adminPage, clientPage]) page.on('response', response => {
      const pathname = new URL(response.url()).pathname;
      if (pathname.startsWith('/api/v1/atracciones')) report.requests.push({ session: page === adminPage ? 'ADMIN' : 'CLIENTE', path: pathname, method: response.request().method(), status: response.status() });
    });
    await login(adminPage, credentials.ADMIN); await login(clientPage, credentials.CLIENTE);
    await adminPage.getByRole('link', { name: 'Administración', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Crear atracción', exact: true }).click(); await adminPage.getByRole('button', { name: 'Agregar ubicación', exact: true }).click();
    for (const [field, value] of Object.entries({ name, long_description: 'Atracción publicada desde ADMIN para comprobar el marketplace real.', duration: 'PT2H', includes: 'Guía local', categories: 'cultural', supported_languages: 'es', photos: 'https://example.test/publication.jpg', address: 'Quito', city: '1', country: 'ec', latitude: '-0.18', longitude: '-78.46' })) await adminPage.locator(`[formcontrolname="${field}"]`).fill(value);
    const create = adminPage.waitForResponse(r => r.url() === api + '/atracciones' && r.request().method() === 'POST');
    await adminPage.locator('app-admin-attraction-form button[type="submit"]').click(); const response = await create; expect(response.status()).toBe(201); attractionId = (await response.json()).id;
    report.attractionId = attractionId; report.checks.created = 201;
    const published = await searchClient(clientPage, name); await expect(published).toBeVisible();
    const detail = clientPage.waitForResponse(r => r.url() === `${api}/atracciones/${attractionId}`); await published.click(); expect((await detail).status()).toBe(200);
    await expect(clientPage.getByRole('heading', { name, exact: true })).toBeVisible(); report.checks.visibleInMarketplace = true;
    await clientPage.screenshot({ path: 'e2e/evidence/marketplace-published.png', fullPage: false });
    let row = await findAdminRow(adminPage, name); await row.getByRole('button', { name: 'Editar', exact: true }).click();
    const updatedName = name + ' actualizado'; await adminPage.locator('[formcontrolname="name"]').fill(updatedName);
    const patch = adminPage.waitForResponse(r => r.url() === `${api}/atracciones/${attractionId}` && r.request().method() === 'PATCH');
    await adminPage.locator('app-admin-attraction-form button[type="submit"]').click(); expect((await patch).status()).toBe(200);
    await expect(await searchClient(clientPage, updatedName)).toBeVisible(); report.checks.updatedInMarketplace = true;
    row = await findAdminRow(adminPage, updatedName); await row.getByRole('button', { name: 'Desactivar atracción', exact: true }).click();
    const remove = adminPage.waitForResponse(r => r.url() === `${api}/atracciones/${attractionId}` && r.request().method() === 'DELETE');
    await adminPage.getByRole('button', { name: 'Sí, desactivar', exact: true }).click(); expect((await remove).status()).toBe(204);
    await expect(await searchClient(clientPage, updatedName)).toHaveCount(0);
    const unavailable = await fetch(`${api}/atracciones/${attractionId}`); expect(unavailable.status).toBe(404);
    const stored = (await db.query('SELECT nombre, "deletedAt" FROM atracciones WHERE id=$1', [attractionId])).rows[0];
    expect(stored.nombre).toBe(updatedName); expect(stored.deletedAt).toBeTruthy();
    report.checks.deactivatedInMarketplace = true; report.checks.detailAfterDeactivation = 404; report.checks.persistedSoftDelete = true;
    report.result = 'PASS';
  } catch (error) { report.result = 'FAIL'; report.failure = error.message; process.exitCode = 1;
    if (adminPage) report.alerts = await adminPage.getByRole('alert').allTextContents().catch(() => []);
  } finally {
    await browser?.close();
    if (attractionId) await db.query('DELETE FROM atracciones WHERE id=$1', [attractionId]);
    for (const id of ids) await db.query('DELETE FROM users WHERE id=$1', [id]); await db.end();
    fs.writeFileSync('e2e/evidence/marketplace-publication.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

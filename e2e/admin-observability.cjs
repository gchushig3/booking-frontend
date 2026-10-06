// Scope: ADMIN and telemetry only. Never creates or alters a reservation.
const { chromium, expect } = require('@playwright/test');
const { randomUUID, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { Client } = require('../../booking-backend/node_modules/pg');
const { hash } = require('../../booking-backend/node_modules/bcryptjs');
require('../../booking-backend/node_modules/dotenv').config({ path: path.resolve('../booking-backend/.env'), quiet: true });
const base = 'http://localhost:3000/api/v1';
const site = 'http://localhost:4200';
const evidenceDirectory = path.resolve('e2e/evidence');

async function login(page, credentials) {
  await page.goto(site, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).first().click();
  await page.locator('[formcontrolname="email"]').fill(credentials.email);
  await page.locator('[formcontrolname="password"]').fill(credentials.password);
  const response = page.waitForResponse(r => r.url().endsWith('/auth/login'));
  await page.locator('form').getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  if ((await response).status() !== 200) throw new Error('UI login failed');
  await page.getByRole('button', { name: 'Catálogo', exact: true }).waitFor();
}
async function attractionRow(page, name) {
  const row = page.locator('tr').filter({ hasText: name });
  for (let index = 0; index < 100; index++) {
    await expect(page.getByRole('button', { name: 'Actualizar listado', exact: true })).toBeEnabled();
    if (await row.count()) return row;
    const next = page.getByRole('button', { name: 'Siguiente', exact: true });
    if (await next.isDisabled()) throw new Error('Created attraction not found in ADMIN pagination');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/atracciones' && r.request().method() === 'GET');
    await next.click(); await response;
  }
  throw new Error('ADMIN pagination exceeded test limit');
}

async function main() {
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Controlled failures and fixtures require local TEST/DEV');
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const marker = 'admin-telemetry-' + randomUUID();
  const report = { marker, mechanism: null, streamConnections: 0, dashboardReloadsAfterConnection: 0, checks: {} };
  const users = []; let attractionId; let native; let browser; let profile; let sessionId; let adminPage;
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  try {
    const credentials = {};
    for (const role of ['ADMIN', 'CLIENTE']) {
      const email = `${marker}-${role.toLowerCase()}@example.test`; const password = randomBytes(20).toString('hex');
      const row = (await db.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id', ['Admin telemetry fixture', email, await hash(password, 12), role])).rows[0];
      users.push(row.id); credentials[role] = { email, password };
    }
    const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port; await new Promise(resolve => server.close(resolve));
    profile = fs.mkdtempSync(path.join(evidenceDirectory, 'admin-test-profile-'));
    native = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true, timeout: 1000 }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    if (!browser) throw new Error('Chrome CDP unavailable');
    const clientPage = await browser.contexts()[0].newPage(); clientPage.setDefaultTimeout(20000);
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    adminPage = await adminContext.newPage(); adminPage.setDefaultTimeout(20000);
    clientPage.on('pageerror', () => {}); // Controlled failures below belong only to this test.
    await login(clientPage, credentials.CLIENTE); await login(adminPage, credentials.ADMIN);
    await adminPage.getByRole('link', { name: 'Administración', exact: true }).click();
    await adminPage.getByRole('heading', { name: 'Atracciones', exact: true }).waitFor();
    report.checks.adminAccess = true;

    // Exercise actual form, API and persistence for create/edit/soft delete.
    await adminPage.getByRole('button', { name: 'Crear atracción', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Agregar ubicación', exact: true }).click();
    const fields = { name: marker, long_description: 'Atracción temporal para validar operaciones ADMIN.', duration: 'PT2H', includes: 'Guía', categories: 'tour_guiado', supported_languages: 'es', photos: 'https://example.test/admin-fixture.jpg', address: 'Quito', city: '1', country: 'ec', latitude: '-0.18', longitude: '-78.46' };
    for (const [field, value] of Object.entries(fields)) await adminPage.locator(`[formcontrolname="${field}"]`).fill(value);
    report.stage = 'create';
    adminPage.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/v1/')) console.log(response.request().method(), url.pathname, response.status()); });
    const created = adminPage.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/atracciones' && r.request().method() === 'POST');
    await adminPage.locator('app-admin-attraction-form button[type="submit"]').click();
    const createResponse = await created; expect(createResponse.status()).toBe(201); attractionId = (await createResponse.json()).id;
    let row = await attractionRow(adminPage, marker); await row.getByRole('button', { name: 'Editar', exact: true }).click();
    await adminPage.locator('[formcontrolname="name"]').fill(marker + '-edited');
    const edited = adminPage.waitForResponse(r => r.url() === `${base}/atracciones/${attractionId}` && r.request().method() === 'PATCH');
    report.stage = 'edit';
    await adminPage.locator('app-admin-attraction-form button[type="submit"]').click(); expect((await edited).status()).toBe(200);
    row = await attractionRow(adminPage, marker + '-edited');
    await row.getByRole('button', { name: 'Desactivar atracción', exact: true }).click();
    const deactivated = adminPage.waitForResponse(r => r.url() === `${base}/atracciones/${attractionId}` && r.request().method() === 'DELETE');
    report.stage = 'deactivate';
    await adminPage.getByRole('button', { name: 'Sí, desactivar', exact: true }).click(); expect((await deactivated).status()).toBe(204);
    const persistedAttraction = (await db.query('SELECT nombre, "deletedAt" FROM atracciones WHERE id=$1', [attractionId])).rows[0];
    expect(persistedAttraction.nombre).toBe(marker + '-edited'); expect(persistedAttraction.deletedAt).toBeTruthy();
    report.checks.crud = { create: 201, edit: 200, deactivate: 204, persisted: true };
    const reservations = adminPage.waitForResponse(r => r.url() === `${base}/admin/reservas`);
    report.stage = 'reservations';
    await adminPage.getByRole('link', { name: 'Reservas', exact: true }).click();
    const reservationsResponse = await reservations; expect(reservationsResponse.status()).toBe(200);
    const reservationRows = await reservationsResponse.json(); expect(Array.isArray(reservationRows)).toBe(true);
    report.checks.reservations = { status: 200, count: reservationRows.length };
    adminPage.on('response', response => { if (response.url() === `${base}/admin/observabilidad/stream`) { report.streamConnections++; report.streamContentType = response.headers()['content-type']; } });
    await adminPage.getByRole('link', { name: 'Observabilidad', exact: true }).click();
    report.stage = 'SSE';
    await adminPage.getByRole('heading', { name: 'Observabilidad real', exact: true }).waitFor();
    await expect(adminPage.getByRole('status').filter({ hasText: /^conectado/ })).toBeVisible();
    await expect(adminPage.getByText('Transporte: SSE', { exact: false })).toBeVisible(); report.mechanism = 'SSE';
    adminPage.on('request', request => { if (request.isNavigationRequest() && request.frame() === adminPage.mainFrame()) report.dashboardReloadsAfterConnection++; });
    const denied = await clientPage.evaluate(async base => {
      const token = localStorage.getItem('access_token'); const statuses = [];
      for (const route of ['eventos', 'resumen', 'stream']) statuses.push((await fetch(`${base}/admin/observabilidad/${route}`, { headers: { Authorization: `Bearer ${token}` } })).status);
      return { statuses, sessionPreserved: localStorage.getItem('access_token') === token };
    }, base);
    expect(denied.statuses).toEqual([403, 403, 403]); expect(denied.sessionPreserved).toBe(true); report.checks.clientApiDenied = denied;
    await clientPage.goto(site + '/admin/observabilidad'); await expect(clientPage.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible();
    report.checks.clientRouteDenied = clientPage.url().includes('motivo=403'); expect(report.checks.clientRouteDenied).toBe(true);
    await clientPage.getByRole('link', { name: 'Volver al catálogo', exact: true }).click();
    await clientPage.locator('#busqueda-hero').fill('Quito'); await clientPage.locator('#busqueda-hero').press('Escape');
    await clientPage.getByRole('button', { name: 'Buscar', exact: true }).click();
    await clientPage.getByRole('link', { name: /^Ver disponibilidad para / }).first().click();
    expect(clientPage.url()).toMatch(/\/actividades\/|\/atracciones\//);
    await clientPage.evaluate(marker => {
      setTimeout(() => { throw new Error(marker + '-javascript'); }, 0);
      setTimeout(() => { Promise.reject(new Error(marker + '-rejection')); }, 0);
      const image = document.createElement('img'); image.src = '/' + marker + '-missing.png?token=private-test-query'; document.body.append(image);
    }, marker);
    const cdp = await clientPage.context().newCDPSession(clientPage);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 720, deviceScaleFactor: 1, mobile: false });
    await clientPage.bringToFront();
    report.visibility = { before: await clientPage.evaluate(() => document.visibilityState) };
    const otherTab = await clientPage.context().newPage(); await otherTab.goto('about:blank'); await otherTab.bringToFront();
    report.visibility.hidden = await clientPage.evaluate(() => document.visibilityState);
    await clientPage.bringToFront(); await otherTab.close(); report.visibility.after = await clientPage.evaluate(() => document.visibilityState);
    expect(report.visibility).toEqual({ before: 'visible', hidden: 'hidden', after: 'visible' });
    await adminPage.bringToFront();
    for (const suffix of ['javascript', 'rejection', 'missing.png']) await expect(adminPage.getByText(marker + '-' + suffix, { exact: false }).first()).toBeVisible({ timeout: 25000 });
    const markerRows = await db.query("SELECT payload_json FROM observabilidad_eventos WHERE payload_json::text LIKE $1", ['%' + marker + '%']);
    sessionId = markerRows.rows.find(row => row.payload_json.type === 'window_error').payload_json.sessionId;
    report.stage = 'viewport persistence';
    report.viewport = await clientPage.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(report.viewport).toEqual({ width: 1024, height: 720 });
    await expect.poll(async () => Number((await db.query("SELECT count(*) FROM observabilidad_eventos WHERE payload_json->>'sessionId'=$1 AND payload_json->>'type'='viewport' AND payload_json->'payload'->>'width'='1024' AND payload_json->'payload'->>'height'='720'", [sessionId])).rows[0].count), { timeout: 15000 }).toBeGreaterThan(0);
    const stored = (await db.query("SELECT tipo_evento, endpoint_ruta, payload_json FROM observabilidad_eventos WHERE payload_json->>'sessionId'=$1", [sessionId])).rows;
    report.typesPersisted = [...new Set(stored.map(row => row.payload_json.type))];
    for (const type of ['navigation_timing', 'route_navigation', 'window_error', 'unhandled_rejection', 'resource_error', 'click', 'visibility_change', 'viewport', 'connection', 'capabilities']) expect(report.typesPersisted).toContain(type);
    expect(stored.some(row => row.payload_json.type === 'viewport' && row.payload_json.payload.width === 1024 && row.payload_json.payload.height === 720)).toBe(true);
    const clientJwt = await clientPage.evaluate(() => localStorage.getItem('access_token'));
    const secrets = ['private-test-query', ...Object.values(credentials).flatMap(value => [value.email, value.password]), clientJwt].filter(Boolean);
    report.sensitiveLeakCount = stored.filter(row => {
      const text = JSON.stringify(row);
      return /Bearer |authorization|password_hash|card_number/.test(text) || secrets.some(secret => text.includes(secret));
    }).length;
    expect(report.sensitiveLeakCount).toBe(0); expect(report.dashboardReloadsAfterConnection).toBe(0);
    expect(report.streamConnections).toBeGreaterThanOrEqual(1); expect(report.streamContentType).toContain('text/event-stream');
    report.checks.updatedWithoutManualRefresh = true; report.checks.postgresqlPersistence = true;
    report.stage = 'complete';
    await adminPage.screenshot({ path: path.join(evidenceDirectory, 'admin-observability-sse.png'), fullPage: false });
    report.result = 'PASS';
  } catch (error) {
    report.result = 'FAIL'; report.failure = error.message; process.exitCode = 1;
    if (adminPage) { report.alerts = await adminPage.getByRole('alert').allTextContents().catch(() => []); await adminPage.screenshot({ path: path.join(evidenceDirectory, 'admin-observability-failure.png') }).catch(() => {}); }
  }
  finally {
    fs.writeFileSync(path.join(evidenceDirectory, 'admin-observability-sse.json'), JSON.stringify(report, null, 2));
    if (browser) { const cdp = await browser.newBrowserCDPSession(); await cdp.send('Browser.close').catch(() => {}); await browser.close(); }
    native?.kill();
    if (attractionId) await db.query('DELETE FROM atracciones WHERE id=$1', [attractionId]);
    for (const id of users) await db.query('DELETE FROM users WHERE id=$1', [id]);
    await db.end();
    if (profile) {
      const resolved = fs.realpathSync(profile); const allowed = fs.realpathSync(evidenceDirectory) + path.sep;
      if (!resolved.startsWith(allowed) || !path.basename(resolved).startsWith('admin-test-profile-')) throw new Error('Unexpected temporary profile path');
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

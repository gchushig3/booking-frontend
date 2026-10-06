const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const crypto = require('node:crypto');
async function run() {
  const email = `critical-${Date.now()}@example.test`;
  const password = crypto.randomBytes(20).toString('hex');
  const digits = '17' + '0' + String(Date.now()).slice(-6);
  const sum = [...digits].reduce((s, d, i) => { const v = Number(d) * (i % 2 === 0 ? 2 : 1); return s + (v > 9 ? v - 9 : v); }, 0);
  const cedula = digits + ((10 - sum % 10) % 10);
  const registered = await fetch('http://localhost:3000/api/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Cliente Prueba', email, password, cedula_dni: cedula }) });
  if (!registered.ok) throw new Error('Fixture registration status ' + registered.status);
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.CRITICAL_HEADED !== '1' });
  const clientContext = await browser.newContext({ viewport: { width: Number(process.env.RESERVATION_VIEWPORT || 1440), height: 1000 } });
  const page = await clientContext.newPage();
  page.setDefaultTimeout(10000);
  const evidence = { requests: [], errors: [] };
  const qrExternalRequests = [];
  if (process.env.VERIFY_RESERVATION_QR === '1') page.on('request', request => {
    const url = new URL(request.url());
    if (/qrserver|chart\.googleapis|quickchart|goqr|qrcode/i.test(url.hostname)) qrExternalRequests.push(url.origin);
  });
  page.on('pageerror', e => evidence.errors.push(e.message));
  page.on('response', async r => {
    if (!r.url().includes('localhost:3000')) return;
    const path = new URL(r.url()).pathname;
    const req = r.request();
    const record = { path, method: req.method(), status: r.status() };
    if (path.endsWith('/reservations') && req.method() === 'POST') {
      const body = req.postDataJSON();
      const { titular_tarjeta, ultimos_cuatro_digitos, ...safeBody } = body;
      record.request = { ...safeBody, customer_name: '[test client]', customer_email: '[redacted]' };
      record.bearerPresent = !!req.headers().authorization;
      record.idempotencyPresent = !!req.headers()['x-idempotency-key'];
      record.response = await r.json();
    }
    if (path.endsWith('/availability')) { record.query = Object.fromEntries(new URL(r.url()).searchParams); record.response = await r.json().catch(() => ({ cancelled: true })); }
    evidence.requests.push(record);
  });
  try {
    await page.goto('http://localhost:4200', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).first().click();
    await page.locator('[formcontrolname="email"]').fill(email);
    await page.locator('[formcontrolname="password"]').fill(password);
    const login = page.waitForResponse(r => r.url().endsWith('/auth/login'));
    await page.locator('form').getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    const lr = await login;
    evidence.loginStatus = lr.status();
    evidence.claims = await page.evaluate(() => { const c = JSON.parse(atob(localStorage.getItem('access_token').split('.')[1])); return { role: c.role, notExpired: c.exp * 1000 > Date.now() }; });
    await page.getByRole('button', { name: 'Mis Reservas', exact: true }).waitFor();
    const catalog = await fetch('http://localhost:3000/api/v1/atracciones?limit=100').then(r => r.json());
    let candidate;
    for (const a of catalog.data) {
      const packages = await fetch(`http://localhost:3000/api/v1/atracciones/${a.id}/paquetes`).then(r => r.json());
      if (packages.length) { candidate = a; break; }
    }
    if (!candidate) throw new Error('No real packages in catalog');
    await page.locator('#busqueda-hero').fill('Quito');
    await page.locator('#busqueda-hero').press('Escape');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByRole('link', { name: 'Ver disponibilidad para ' + candidate.name, exact: true }).click();
    evidence.attractionId = page.url().split('/').pop();
    await page.locator('article button[aria-pressed]').first().click();
    const tomorrow = new Date(Date.now() + Number(process.env.RESERVATION_DAY_OFFSET || 1) * 86400000).toISOString().slice(0, 10);
    await page.getByLabel('Fecha', { exact: true }).fill(tomorrow);
    await page.getByLabel('Horario / turno', { exact: false }).waitFor();
    const backendTime = await page.getByLabel('Horario / turno', { exact: false }).locator('option').nth(1).getAttribute('value');
    await page.getByLabel('Horario / turno', { exact: false }).selectOption(backendTime);
    evidence.viewport = await page.evaluate(() => innerWidth);
    evidence.dateVisible = await page.getByLabel('Fecha', { exact: true }).isVisible();
    await page.getByLabel('Adultos', { exact: true }).fill('2');
    await page.getByLabel('Niños', { exact: true }).fill('1');
    await page.getByLabel(/Niño 1.*Edad/).fill('8');
    const advance = page.getByRole('button', { name: 'Siguiente: Datos de la Reserva' });
    await expect(advance).toBeEnabled();
    evidence.participantsVisible = await page.getByLabel('Adultos', { exact: true }).isVisible() && await page.getByLabel('Ni\u00f1os', { exact: true }).isVisible() && await page.getByLabel(/Ni\u00f1o 1.*Edad/).isVisible();
    evidence.reservationPanelFitsViewport = await page.locator('aside').evaluate(panel => panel.getBoundingClientRect().right <= innerWidth && panel.scrollWidth <= panel.clientWidth);
    fs.mkdirSync('e2e/evidence', { recursive: true });
    await page.screenshot({ path: `e2e/evidence/reservation-controls-${process.env.RESERVATION_VIEWPORT || 1440}.png`, fullPage: true });
    await advance.click({ timeout: 10000 });
    await page.locator('[formcontrolname="identity_number"]').fill(cedula);
    await page.locator('[formcontrolname="phone"]').fill('0991234567');
    await page.locator('[formcontrolname="phone"]').blur();
    await page.getByRole('button', { name: 'Datos de pago', exact: true }).click();
    if (process.env.CRITICAL_CARD === '1') {
      await page.locator('[formcontrolname="cardholder"]').fill('Cliente Prueba');
      await page.locator('[formcontrolname="card_number"]').fill('4242424242424242');
      await page.locator('[formcontrolname="card_expiry"]').fill('1299');
      await page.locator('[formcontrolname="card_cvc"]').fill('123');
      await page.locator('[formcontrolname="card_cvc"]').blur();
    } else await page.getByLabel('PayPal', { exact: true }).check();
    if (process.env.CRITICAL_RETRY === '1') {
      const pattern = '**/api/v1/atracciones/*/reservations';
      await page.route(pattern, async route => {
        const response = await route.fetch();
        const body = route.request().postDataJSON();
        const { titular_tarjeta, ultimos_cuatro_digitos, ...safeBody } = body;
        evidence.uncertainAttempt = { backendStatus: response.status(), request: { ...safeBody, customer_name: '[test client]', customer_email: '[redacted]' }, response: await response.json() };
        evidence.retryKey = route.request().headers()['x-idempotency-key'];
        await route.abort('failed');
      }, { times: 1 });
      await page.getByRole('button', { name: 'Completar la reserva', exact: true }).click();
      const retry = page.getByRole('button', { name: 'Reintentar la misma reserva', exact: true });
      await retry.waitFor();
      evidence.retryButtonDisabled = await retry.isDisabled();
      if (evidence.retryButtonDisabled) throw new Error('Retry button is disabled after an uncertain response despite a frozen valid request');
    }
    const checkout = page.waitForResponse(r => /\/atracciones\/[^/]+\/reservations$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 10000 });
    await page.getByRole('button', { name: process.env.CRITICAL_RETRY === '1' ? 'Reintentar la misma reserva' : 'Completar la reserva', exact: true }).click();
    const response = await checkout;
    if (evidence.retryKey) {
      evidence.retryKeyStable = response.request().headers()['x-idempotency-key'] === evidence.retryKey;
      delete evidence.retryKey;
      evidence.sameReservationReplayed = (await response.json()).reservation_id === evidence.uncertainAttempt.response.reservation_id;
    }
    evidence.checkoutStatus = response.status();
    if (response.ok()) {
      const res = await response.json(); evidence.reservationId = res.reservation_id; evidence.packageId = response.request().postDataJSON().paquete_id;
      await page.getByRole('heading', { name: 'Tu entrada está lista' }).waitFor();
      if (process.env.VERIFY_RESERVATION_QR === '1') {
        const { inspectQr } = require('./qr-evidence.cjs');
        const qr = await inspectQr(page, page.getByRole('dialog'));
        expect(qr.content).toBe(res.reservation_id); expect(qr.code).toBe(res.reservation_id); expect(qr.externalReferences).toBe(0);
        evidence.qr = { confirmationContent: qr.content, confirmationPath: qr.path };
        await page.getByRole('dialog').screenshot({ path: 'e2e/evidence/marketplace-confirmation-qr.png' });
      }
      await page.getByRole('button', { name: 'Listo', exact: true }).click();
      await page.getByRole('button', { name: 'Mis Reservas', exact: true }).click();
      await page.getByText(res.reservation_id, { exact: true }).first().waitFor();
      evidence.inMyReservations = true;
      await page.locator('article').filter({ hasText: res.reservation_id }).getByRole('button', { name: 'Ver detalle', exact: true }).click();
      await page.getByRole('dialog').getByText(res.reservation_id, { exact: true }).first().waitFor();
      evidence.detailOpened = true;
      if (process.env.VERIFY_RESERVATION_QR === '1') {
        const { inspectQr } = require('./qr-evidence.cjs');
        const qr = await inspectQr(page, page.getByRole('dialog'));
        expect(qr.content).toBe(res.reservation_id); expect(qr.path).toBe(evidence.qr.confirmationPath);
        evidence.qr.detailContent = qr.content; evidence.qr.sameQr = true; evidence.qr.externalRequests = qrExternalRequests.length;
        delete evidence.qr.confirmationPath;
        expect(qrExternalRequests).toHaveLength(0);
        await page.getByRole('dialog').screenshot({ path: 'e2e/evidence/marketplace-detail-qr.png' });
      }
      const db = await database();
      try {
        const persisted = await db.query('SELECT id, paquete_id, num_adultos, num_ninos, edades_ninos, total_cupos_ocupados, monto_total, date, time, status FROM reservas_atracciones WHERE id = $1', [res.reservation_id]);
        evidence.persisted = persisted.rows[0];
        if (process.env.VERIFY_RESERVATION_QR === '1') {
          expect(evidence.persisted).toBeTruthy(); expect(Number(evidence.persisted.monto_total)).toBe(res.total_price.total);
          const forbidden = await page.evaluate(async id => {
            const response = await fetch('http://localhost:3000/api/v1/atracciones/reservations/' + id);
            return response.status;
          }, res.reservation_id);
          expect(forbidden).toBe(401); evidence.qr.privateLookupWithoutJwt = forbidden;
        }
      } finally { await db.end(); }
    }
    if (process.env.CRITICAL_OBSERVABILITY === '1' && evidence.detailOpened) evidence.observability = await verifyTelemetry(browser, page, { email, password });
  } catch (e) {
    delete evidence.retryKey;
    evidence.failure = e.message;
    evidence.visibleAlerts = await page.getByRole('alert').allTextContents();
    evidence.buttons = await page.locator('button').evaluateAll(bs => bs.filter(b => b.textContent.includes('reserva') || b.textContent.includes('Siguiente')).map(b => ({ text: b.textContent.trim(), disabled: b.disabled })));
    evidence.formState = await page.locator('[formcontrolname]').evaluateAll(cs => cs.map(c => ({ field: c.getAttribute('formcontrolname'), classes: c.className })));
  }
  fs.mkdirSync('e2e/evidence', { recursive: true });
  fs.writeFileSync(`e2e/evidence/${process.env.RESERVATION_VIEWPORT ? 'reservation-mobile-' + process.env.RESERVATION_VIEWPORT : 'checkout'}${process.env.CRITICAL_CARD === '1' ? '-card' : ''}${process.env.CRITICAL_RETRY === '1' ? '-retry' : ''}.json`, JSON.stringify(evidence, null, 2));
  if (process.env.VERIFY_RESERVATION_QR === '1') fs.writeFileSync('e2e/evidence/marketplace-sale-qr.json', JSON.stringify(evidence, null, 2));
  if (evidence.failure || !evidence.detailOpened || (process.env.CRITICAL_OBSERVABILITY === '1' && (!evidence.observability?.updatedWithoutManualRefresh || !evidence.observability?.realVisibilityCaptured || evidence.observability?.sensitiveLeakCount !== 0))) process.exitCode = 1;
  console.log(JSON.stringify(evidence, null, 2));
  await browser.close();
}
async function database() {
  const path = require('node:path');
  require('../../booking-backend/node_modules/dotenv').config({ path: path.resolve('../booking-backend/.env'), quiet: true });
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || process.env.NODE_ENV === 'production') throw new Error('E2E fixtures require local development PostgreSQL');
  const { Client } = require('../../booking-backend/node_modules/pg');
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect(); return db;
}
async function nativeClient(credentials) {
  const path = require('node:path'); const { spawn } = require('node:child_process'); const net = require('node:net');
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const directory = path.resolve('e2e'); const profile = fs.mkdtempSync(path.join(directory, 'native-profile-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let browser;
  for (let index = 0; index < 100; index++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true, timeout: 1000 }); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!browser) { chrome.kill(); throw new Error('Native Chrome CDP unavailable'); }
  const page = await browser.contexts()[0].newPage(); page.setDefaultTimeout(15000);
  const close = async () => {
    const session = await browser.newBrowserCDPSession(); await session.send('Browser.close').catch(() => {}); await browser.close(); chrome.kill();
    const resolved = fs.realpathSync(profile); const allowed = fs.realpathSync(directory) + path.sep;
    if (!resolved.startsWith(allowed) || !path.basename(resolved).startsWith('native-profile-')) throw new Error('Unexpected test profile path');
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  };
  try {
  await page.bringToFront();
  await page.goto('http://localhost:4200', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).first().click();
  await page.locator('[formcontrolname="email"]').fill(credentials.email); await page.locator('[formcontrolname="password"]').fill(credentials.password);
  await page.locator('form').getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.getByRole('button', { name: 'Catálogo', exact: true }).waitFor();
  return { page, close };
  } catch (error) { await close(); throw error; }
}
async function verifyTelemetry(browser, originalClientPage, credentials) {
  const native = await nativeClient(credentials); const clientPage = native.page;
  const db = await database();
  const email = `critical-admin-${Date.now()}@example.test`; const password = crypto.randomBytes(20).toString('hex');
  const { hash } = require('../../booking-backend/node_modules/bcryptjs');
  const admin = (await db.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id', ['Admin Prueba', email, await hash(password, 12), 'ADMIN'])).rows[0];
  const adminContext = await browser.newContext(); const adminPage = await adminContext.newPage(); adminPage.setDefaultTimeout(15000);
  const report = { mechanism: null, streamConnections: 0, responses: [], events: [] };
  const marker = 'critical-' + crypto.randomUUID();
  adminPage.on('response', async r => {
    if (r.url().includes('/admin/observabilidad/stream') && r.ok() && r.headers()['content-type']?.includes('text/event-stream')) report.streamConnections++;
    if (r.url().includes('/admin/observabilidad/eventos')) { const body = r.ok() ? await r.json() : null; report.responses.push({ status: r.status(), size: body?.events?.length }); }
  });
  try {
    await adminPage.goto('http://localhost:4200', { waitUntil: 'domcontentloaded' });
    await adminPage.getByRole('button', { name: 'Iniciar sesión', exact: true }).first().click();
    await adminPage.locator('[formcontrolname="email"]').fill(email); await adminPage.locator('[formcontrolname="password"]').fill(password);
    await adminPage.locator('form').getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await adminPage.getByRole('link', { name: 'Administración', exact: true }).click();
    await adminPage.getByRole('link', { name: 'Observabilidad', exact: true }).click();
    await adminPage.getByRole('heading', { name: 'Observabilidad real', exact: true }).waitFor();
    await adminPage.getByRole('status').filter({ hasText: 'conectado' }).waitFor();
    report.mechanism = await adminPage.getByText('Transporte:', { exact: false }).textContent().then(text => text.includes('SSE') ? 'SSE' : 'polling-3000ms');
    const forbidden = await clientPage.evaluate(async () => { const response = await fetch('http://localhost:3000/api/v1/admin/observabilidad/eventos', { headers: { Authorization: 'Bearer ' + localStorage.getItem('access_token') } }); return response.status; });
    report.clientHttpStatus = forbidden;
    if (await clientPage.getByRole('button', { name: /Cerrar detalle/ }).count()) await clientPage.getByRole('button', { name: /Cerrar detalle/ }).click();
    await clientPage.getByRole('button', { name: 'Catálogo', exact: true }).click();
    await clientPage.evaluate(marker => {
      // Test-only browser execution. Nothing is added to production UI or app code.
      setTimeout(() => { throw new Error(marker + '-javascript'); }, 0);
      setTimeout(() => { Promise.reject(new Error(marker + '-rejection')); }, 0);
      const img = document.createElement('img'); img.src = '/' + marker + '-missing.png?token=private-test-query'; document.body.append(img);
    }, marker);
    await clientPage.setViewportSize({ width: 1024, height: 720 });
    // Native CDP connection uses noDefaults: no focus/visibility emulation.
    report.visibilityBeforeTab = await clientPage.evaluate(() => document.visibilityState);
    const secondTab = await clientPage.context().newPage();
    await secondTab.goto('about:blank'); await secondTab.bringToFront();
    report.visibilityWithOtherTab = await clientPage.evaluate(() => document.visibilityState);
    await clientPage.bringToFront(); await secondTab.close();
    report.visibilityAfterTab = await clientPage.evaluate(() => document.visibilityState);
    await adminPage.bringToFront();
    await adminPage.getByText(marker + '-javascript', { exact: false }).first().waitFor({ timeout: 20000 });
    await adminPage.getByText(marker + '-missing.png', { exact: false }).first().waitFor({ timeout: 20000 });
    const rows = await db.query("SELECT id, tipo_evento, endpoint_ruta, payload_json FROM observabilidad_eventos WHERE payload_json::text LIKE $1 ORDER BY created_at DESC", ['%' + marker + '%']);
    report.events = rows.rows.map(row => ({ id: row.id, category: row.payload_json.category, type: row.payload_json.type, payload: row.payload_json.payload, sessionId: row.payload_json.sessionId }));
    report.updatedWithoutManualRefresh = (report.mechanism === 'SSE' ? report.streamConnections >= 1 : report.responses.length >= 2) && report.events.some(event => event.type === 'window_error') && report.events.some(event => event.type === 'resource_error');
    const sessionId = report.events[0]?.sessionId;
    const session = await db.query("SELECT DISTINCT tipo_evento FROM observabilidad_eventos WHERE payload_json->>'sessionId' = $1", [sessionId]);
    report.clientCategoriesPersisted = session.rows.map(row => row.tipo_evento);
    report.realVisibilityCaptured = report.clientCategoriesPersisted.includes('BROWSER_VISIBILITY');
    const leaks = await db.query("SELECT count(*)::int as leaks FROM observabilidad_eventos WHERE payload_json->>'sessionId' = $1 AND (payload_json::text LIKE '%private-test-query%' OR payload_json::text LIKE '%4242424242424242%')", [sessionId]);
    report.sensitiveLeakCount = leaks.rows[0].leaks;
    try { await adminPage.screenshot({ path: 'e2e/evidence/admin-observability.png', fullPage: false }); } catch { report.screenshotUnavailable = true; }
  } finally {
    await adminContext.close(); await db.query('DELETE FROM users WHERE id = $1', [admin.id]); await db.end(); await native.close();
  }
  return report;
}
run().catch(e => { console.error(e.message); process.exitCode = 1; });

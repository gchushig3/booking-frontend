// Two independent browsers share a mocked API; no production data is written.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const site = process.env.ADMIN_UI_URL || 'http://127.0.0.1:4210';
  const browser = await chromium.launch({ headless: true, ...(process.env.ADMIN_BROWSER_CHANNEL ? { channel: process.env.ADMIN_BROWSER_CHANNEL } : {}) });
  const events = [];
  let mobileSession;
  let desktopSession;
  let sequence = 0;
  const contexts = [];
  const snapshot = () => {
    const recent = events.slice(-100).reverse();
    const counts = Object.fromEntries(['PERFORMANCE', 'ERROR', 'RESOURCE_ERROR', 'INTERACTION', 'VISIBILITY', 'VIEWPORT', 'CONNECTION', 'CAPABILITY', 'HTTP', 'DOMAIN'].map(category => [category, recent.filter(event => event.category === category).length]));
    return { generatedAt: new Date().toISOString(), events: recent, summary: { sampleSize: recent.length, sampleLimit: 100, counts, navigationSamples: 0, averageLoadMs: null } };
  };
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 950 }, isMobile: mobile, hasTouch: mobile });
      contexts.push(context);
      if (!mobile) await context.addInitScript(() => {
        localStorage.setItem('access_token', 'h.' + btoa(JSON.stringify({ sub: 'admin', role: 'ADMIN', type: 'user' })) + '.s');
        localStorage.setItem('auth_user', JSON.stringify({ id: 'admin', name: 'Administrador', email: 'admin@example.test' }));
      });
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const reply = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        if (!url.pathname.startsWith('/api/v1/')) return url.origin === new URL(site).origin ? route.continue() : route.abort();
        if (url.pathname === '/api/v1/observabilidad/eventos') {
          const batch = request.postDataJSON().events;
          for (const event of batch) {
            if (mobile) mobileSession = event.sessionId;
            else desktopSession = event.sessionId;
            events.push({ ...event, id: String(++sequence), receivedAt: new Date().toISOString() });
          }
          return reply({ accepted: batch.length });
        }
        if (url.pathname.startsWith('/api/v1/admin/observabilidad/')) return reply(snapshot());
        if (url.pathname === '/api/v1/atracciones') return reply({ data: [], meta: { total: 0, page: 1, lastPage: 1 } });
        return reply([]);
      });
    }
    const admin = await contexts[0].newPage();
    const mobile = await contexts[1].newPage();
    await admin.goto(site + '/admin/observabilidad');
    await mobile.goto(site);
    await mobile.getByRole('button', { name: 'Iniciar sesión', exact: true }).first().tap();
    await expect.poll(() => events.some(event => event.sessionId === mobileSession && event.payload.action === 'login_modal_opened'), { timeout: 20000 }).toBe(true);
    await expect(admin.getByText('login_modal_opened', { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(admin.locator('select')).toHaveCount(0);
    const received = admin.locator('section[aria-label="Eventos recientes"]');
    await expect(received).toContainText(mobileSession);
    await expect.poll(() => desktopSession, { timeout: 10000 }).toBeTruthy();
    await expect(received).toContainText(desktopSession);
    const devices = admin.locator('section[aria-label="Contexto de los dispositivos"]');
    await expect(devices).toContainText('390');
    await expect(devices).toContainText('1365');
    const directory = path.join(__dirname, 'evidence');
    fs.mkdirSync(directory, { recursive: true });
    await admin.screenshot({ path: path.join(directory, 'observability-mobile-session.png'), fullPage: true });
    console.log('Mobile and desktop events and device contexts appear automatically in the admin dashboard. Mocked API only.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

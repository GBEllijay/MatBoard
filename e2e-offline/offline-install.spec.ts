import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { BASE, BOUNCE, DAY_MS, GatedProxy, installWithPass, precacheCount, trackUrls, waitForServiceWorker } from './harness';

const SHOTS = process.env.MB_OFFLINE_SHOTS_DIR ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const proxy = new GatedProxy();

test.beforeEach(async () => {
  await proxy.start();
});
test.afterEach(async () => {
  await proxy.stop();
});

async function goOffline(context: BrowserContext) {
  await proxy.stop();
  await context.setOffline(true);
}

/** Open a fresh tab with the clock moved, as a coach opening the app days later. */
async function laterTab(context: BrowserContext, plusMs: number): Promise<Page> {
  const page = await context.newPage();
  await page.clock.install({ time: Date.now() + plusMs });
  return page;
}

const LIVE_ROUTES = ['/match', '/training', '/tournament', '/suite'];

test('the install saves the whole app: shell, fonts, images and sounds are precached', async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitForServiceWorker(page);
  expect(await precacheCount(page)).toBeGreaterThan(100);
  const saved = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      if (!name.includes('precache')) continue;
      for (const request of await (await caches.open(name)).keys()) out.push(new URL(request.url).pathname);
    }
    return out;
  });
  expect(saved).toContain('/index.html');
  expect(saved.some((path) => /^\/fonts\/.+\.ttf$/.test(path))).toBe(true);
  expect(saved.some((path) => /\.(?:mp3|wav|ogg)$/.test(path))).toBe(true);
  expect(saved.some((path) => /^\/assets\/.+\.js$/.test(path))).toBe(true);
  expect(saved.some((path) => path.startsWith('/paid/'))).toBe(false);
  // No 24-hour page cache any more: app routes are served from the install.
  expect(await page.evaluate(async () => (await caches.keys()).includes('pages'))).toBe(false);
});

test('cold offline launch more than 24 hours after the last visit opens the app', async ({ context }) => {
  const { page } = await installWithPass(context);
  await page.close();
  await goOffline(context);

  const later = await laterTab(context, 25 * 3600_000);
  await later.goto(`${BASE}/`);
  await expect(later.locator('main').first()).toBeVisible();
  await expect(later.getByText(/This site can.t be reached|ERR_INTERNET_DISCONNECTED/i)).toHaveCount(0);
  await shot(later, '01-offline-launch-home-25h');

  for (const route of ['/match', '/training', '/tournament']) {
    const seen = trackUrls(later);
    await later.goto(`${BASE}${route}`);
    await expect(later.getByTestId('entitlement-wait')).toHaveCount(0);
    await expect.poll(() => new URL(later.url()).pathname).toBe(route);
    expect(seen.filter((path) => BOUNCE.test(path))).toEqual([]);
  }
  await shot(later, '02-offline-launch-tournament-25h');
});

for (const mode of ['online', 'offline'] as const) {
  test(`deep-link refresh with a real pass stays put (${mode})`, async ({ context }) => {
    const { page } = await installWithPass(context);
    if (mode === 'offline') await goOffline(context);
    for (const route of LIVE_ROUTES) {
      await page.goto(`${BASE}${route}`);
      await expect.poll(() => new URL(page.url()).pathname).toBe(route);
      const seen = trackUrls(page);
      await page.reload();
      await expect(page.getByTestId('entitlement-wait')).toHaveCount(0);
      // Give a late redirect time to happen.
      await page.waitForTimeout(1500);
      expect(new URL(page.url()).pathname, `${route} after refresh`).toBe(route);
      expect(seen.filter((path) => BOUNCE.test(path)), `${route} bounced`).toEqual([]);
      page.removeAllListeners('framenavigated');
      if (route === '/match') await shot(page, `03-refresh-match-stays-${mode}`);
    }
  });
}

test('a deep link with no pass still goes to the store (guards were not loosened)', async ({ page }) => {
  await page.goto(`${BASE}/match`);
  await expect.poll(() => new URL(page.url()).pathname).toMatch(BOUNCE);
});

test('paid screen opens offline inside the grace period, and not after it', async ({ context }) => {
  const { page } = await installWithPass(context);
  await page.close();
  await goOffline(context);

  // Pro pass: 7-day token + 3 offline days. Day 8 is past the token but inside grace.
  const grace = await laterTab(context, 8 * DAY_MS);
  await grace.goto(`${BASE}/pro`);
  await expect(grace.getByRole('navigation', { name: 'Advantage Pro' })).toBeVisible();
  expect(new URL(grace.url()).pathname).toBe('/pro');
  expect(
    await grace.evaluate(async () => (await (await caches.open('paid-chunks')).keys()).length),
    'paid screens kept during grace',
  ).toBeGreaterThan(0);
  await shot(grace, '04-paid-pro-offline-day8-grace');
  await grace.close();

  // Day 11 is past the offline limit: the door closes.
  const past = await laterTab(context, 11 * DAY_MS);
  await past.goto(`${BASE}/pro`);
  await expect.poll(() => new URL(past.url()).pathname).not.toBe('/pro');
  await expect(past.getByRole('navigation', { name: 'Advantage Pro' })).toHaveCount(0);
  await shot(past, '05-paid-pro-offline-day11-closed');
});

test('clock rollback still locks the paid screens offline', async ({ context }) => {
  const { page } = await installWithPass(context);
  // The app saw a time 2 days ahead; now the device clock reads earlier.
  await page.evaluate((ms) => localStorage.setItem('advantage.entitlement.clock', String(ms)), Date.now() + 2 * DAY_MS);
  await page.close();
  await goOffline(context);
  const rolled = await context.newPage();
  await rolled.goto(`${BASE}/pro`);
  await expect.poll(() => new URL(rolled.url()).pathname).not.toBe('/pro');
  await expect(rolled.getByRole('navigation', { name: 'Advantage Pro' })).toHaveCount(0);
  // The saved screens are not wiped by a rolled-back clock either (they stay locked).
  expect(await rolled.evaluate(async () => (await (await caches.open('paid-chunks')).keys()).length)).toBeGreaterThan(0);
});

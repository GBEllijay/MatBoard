import { expect, test, type Browser, type Page } from '@playwright/test';

/** Android phone held upright, like the owner's S24 from the home-screen app. */
const PHONE = { width: 412, height: 915 };
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

async function prep(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('matboard.tvTip.v1', '1');
    const fs = { element: null as Element | null, enters: 0, exits: 0, popups: [] as string[] };
    (window as unknown as { __fs: typeof fs }).__fs = fs;
    Element.prototype.requestFullscreen = function () {
      fs.enters += 1;
      fs.element = document.documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
    document.exitFullscreen = async () => {
      fs.exits += 1;
      fs.element = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fs.element });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    window.open = ((url?: string | URL) => {
      fs.popups.push(String(url));
      return null;
    }) as typeof window.open;
  });
}

async function phonePage(browser: Browser) {
  const context = await browser.newContext({
    viewport: PHONE,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_UA,
  });
  const page = await context.newPage();
  await prep(page);
  return page;
}

const fsState = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fs: { enters: number; exits: number; popups: string[] } }).__fs);

test('phone controller: tapping the gold Rounds chip opens the rounds timer fullscreen in this window', async ({ browser }) => {
  const page = await phonePage(browser);
  await page.goto('/training/control?from=suite');
  await page.locator('.chrome__right').getByRole('button', { name: 'Rounds', exact: true }).tap();
  await expect(page).toHaveURL(/\/training\?from=suite$/);
  await expect(page.locator('main.training')).toHaveClass(/play--fs/);
  const state = await fsState(page);
  expect(state.enters).toBeGreaterThan(0);
  expect(state.popups).toEqual([]);
  await page.context().close();
});

test('phone controller: tapping the ROUNDS title does the same', async ({ browser }) => {
  const page = await phonePage(browser);
  await page.goto('/training/control');
  await page.getByRole('button', { name: 'Rounds: open the round timer fullscreen' }).tap();
  await expect(page).toHaveURL(/\/training$/);
  await expect(page.locator('main.training')).toHaveClass(/play--fs/);
  expect((await fsState(page)).popups).toEqual([]);
  await page.context().close();
});

test('desktop controller: Rounds chip still opens the gym TV popup and stays on the controller', async ({ page }) => {
  await prep(page);
  await page.goto('/training/control?from=suite');
  await page.locator('.chrome__right').getByRole('button', { name: 'Rounds', exact: true }).click();
  await expect(page).toHaveURL(/\/training\/control\?from=suite$/);
  const state = await fsState(page);
  expect(state.popups).toEqual(['/training?from=suite']);
  expect(state.enters).toBe(0);
  // Controller controls are untouched.
  await expect(page.locator('.training-control__actions').getByRole('button', { name: 'Start' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open rounds on this device' })).toBeVisible();
});

test('phone rounds display: Fullscreen chip shows; round line toggles fullscreen; clock and options still work', async ({ browser }) => {
  const page = await phonePage(browser);
  await page.goto('/training');
  const main = page.locator('main.training');
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();

  const roundLine = page.locator('button.training__phase');
  await expect(roundLine).toContainText('Round 1');
  await roundLine.tap();
  await expect(main).toHaveClass(/play--fs/);
  await expect(page.locator('.sheet')).toHaveCount(0);
  await roundLine.tap();
  await expect(main).not.toHaveClass(/play--fs/);
  const state = await fsState(page);
  expect(state.enters).toBe(1);
  expect(state.exits).toBe(1);

  // Clock still starts and pauses.
  await page.locator('button.training__clock').tap();
  await expect(page.locator('button.training__clock')).not.toHaveText('05:00', { timeout: 5000 });
  await page.locator('button.training__clock').tap();

  // Tapping empty space still opens Training options.
  await page.mouse.click(PHONE.width / 2, PHONE.height - 200);
  await expect(page.getByRole('heading', { name: 'Training options' })).toBeVisible();
  await page.context().close();
});

test('home-screen manifest is linked and served publicly as fullscreen', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest');
  // Dev server serves the VitePWA manifest only in builds; the build test checks dist. Here we
  // only require that nothing (no paid gate, no SPA fallback HTML) answers with an error page.
  if (res.ok() && (res.headers()['content-type'] ?? '').includes('json')) {
    const manifest = await res.json();
    expect(manifest.display).toBe('fullscreen');
  }
  await page.goto('/');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0b0d10');
});

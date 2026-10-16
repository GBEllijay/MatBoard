import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };

async function openLesson(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
  });
  await page.setViewportSize(PHONE);
  await page.goto('/notes?from=coach');
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan', exact: true })).toBeVisible();
}

test('Chromium fullscreen mock fills the Hide screen cover and a second tap returns', async ({ page }) => {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  await page.addInitScript(() => {
    const fs = {
      calls: [] as { className: string; navigationUI: string | null }[],
      element: null as Element | null,
      exits: 0,
    };
    (window as unknown as { __fs: typeof fs }).__fs = fs;
    Element.prototype.requestFullscreen = function (options?: { navigationUI?: 'hide' }) {
      fs.calls.push({ className: this.className, navigationUI: options?.navigationUI ?? null });
      fs.element = this;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
    document.exitFullscreen = async () => {
      fs.exits += 1;
      fs.element = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fs.element,
    });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
  });
  await openLesson(page);
  await page.getByRole('radio', { name: 'Logo', exact: true }).click();
  const cover = page.getByRole('dialog', { name: 'Screen hidden' });
  await expect(cover).toBeVisible();
  await expect(cover).toHaveAttribute('data-cover-api', 'standard');
  await expect(cover).toHaveAttribute('data-cover-mode', 'logo');
  const calls = await page.evaluate(() => (window as unknown as { __fs: { calls: { className: string; navigationUI: string | null }[]; exits: number } }).__fs);
  expect(calls.calls.some((call) => call.className.includes('notes-cover') && call.navigationUI === 'hide')).toBe(true);
  await expect(page.getByText('Add this site to the Home Screen for full coverage.')).toHaveCount(0);
  await page.screenshot({ path: '/opt/cursor/artifacts/hide-screen-fullscreen-390.png' });

  await page.getByRole('button', { name: 'Advantage logo', exact: true }).click();
  await expect(cover).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan', exact: true })).toBeVisible();
  const exits = await page.evaluate(() => (window as unknown as { __fs: { exits: number } }).__fs.exits);
  expect(exits).toBeGreaterThan(0);

  await page.getByRole('radio', { name: 'Black', exact: true }).click();
  await expect(page.locator('.notes-cover--black')).toHaveAttribute('data-cover-api', 'standard');
  await page.getByRole('button', { name: 'Show screen', exact: true }).click();
  await expect(page.locator('#notes-intro')).toBeVisible();

  await page.getByRole('radio', { name: 'Schedule', exact: true }).click();
  await expect(page.locator('.notes-cover--schedule')).toHaveAttribute('data-cover-api', 'standard');
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Week', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Month', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show screen', exact: true })).toBeVisible();
  await page.locator('.notes-cover--schedule').click({ position: { x: 20, y: 200 } });
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan', exact: true })).toBeVisible();
});

test('WebKit prefix fullscreen is used when requestFullscreen is missing', async ({ page }) => {
  await page.addInitScript(() => {
    const wk = { calls: 0, element: null as Element | null, exits: 0 };
    (window as unknown as { __wk: typeof wk }).__wk = wk;
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    Element.prototype.webkitRequestFullscreen = function () {
      wk.calls += 1;
      wk.element = this;
      document.dispatchEvent(new Event('webkitfullscreenchange'));
    };
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
    Object.defineProperty(document, 'webkitFullscreenEnabled', { configurable: true, get: () => true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    Object.defineProperty(document, 'webkitFullscreenElement', {
      configurable: true,
      get: () => wk.element,
    });
    document.exitFullscreen = undefined as unknown as () => Promise<void>;
    document.webkitExitFullscreen = () => {
      wk.exits += 1;
      wk.element = null;
      document.dispatchEvent(new Event('webkitfullscreenchange'));
    };
  });
  await openLesson(page);
  await page.getByRole('button', { name: 'Hide screen', exact: true }).click();
  const cover = page.getByRole('dialog', { name: 'Screen hidden' });
  await expect(cover).toHaveAttribute('data-cover-api', 'webkit');
  const calls = await page.evaluate(() => (window as unknown as { __wk: { calls: number } }).__wk.calls);
  expect(calls).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Show screen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan', exact: true })).toBeVisible();
  const exits = await page.evaluate(() => (window as unknown as { __wk: { exits: number } }).__wk.exits);
  expect(exits).toBeGreaterThan(0);
});

test('iOS Safari falls back to a fixed cover and a Home Screen hint', async ({ page }) => {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { configurable: true, value: undefined });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
    Object.defineProperty(document, 'webkitFullscreenEnabled', { configurable: true, get: () => false });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
  });
  await openLesson(page);
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('viewport-fit=cover');
  await page.getByRole('radio', { name: 'Black', exact: true }).click();
  const cover = page.getByRole('dialog', { name: 'Screen hidden' });
  await expect(cover).toHaveAttribute('data-cover-api', 'unsupported');
  await expect(cover).toHaveClass(/notes-cover--fallback/);
  const box = await cover.evaluate((el) => {
    const style = getComputedStyle(el);
    return { height: style.height, position: style.position, paddingTop: style.paddingTop };
  });
  expect(box.position).toBe('fixed');
  expect(box.height.endsWith('px')).toBe(true);
  await expect(page.getByText('Add this site to the Home Screen for full coverage.')).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/hide-screen-ios-fallback-390.png' });
  await page.getByRole('button', { name: 'Show screen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan', exact: true })).toBeVisible();
  await expect(page.locator('#notes-intro')).toBeVisible();
});

test('Hide screen schedule cover hides editor chrome and Show returns to the plan', async ({ page }) => {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  await page.addInitScript(() => {
    const fs = {
      calls: [] as { className: string; navigationUI: string | null }[],
      element: null as Element | null,
      exits: 0,
    };
    (window as unknown as { __fs: typeof fs }).__fs = fs;
    Element.prototype.requestFullscreen = function (options?: { navigationUI?: 'hide' }) {
      fs.calls.push({ className: this.className, navigationUI: options?.navigationUI ?? null });
      fs.element = this;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
    document.exitFullscreen = async () => {
      fs.exits += 1;
      fs.element = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fs.element,
    });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    localStorage.setItem(
      'matboard.schedule.v1',
      JSON.stringify({
        version: 1,
        title: 'GRACIE BARRA ELLIJAY',
        qrUrl: '',
        notes: '',
        template: 'week',
        castEnabled: true,
        classes: [
          { id: 'c1', kind: 'class', day: 'mon', time: '18:00', title: 'Fundamentals', location: 'MAT 1', subtitle: '', level: 'fundamentals' },
          { id: 'c2', kind: 'class', day: 'wed', time: '18:30', title: 'Advanced', location: 'MAT 2', subtitle: '', level: 'advanced' },
          { id: 'c3', kind: 'class', day: 'fri', time: '17:00', title: 'Kids', location: 'MAT 1', subtitle: '', level: 'kids' },
        ],
        specials: [{ id: 'seminar', kind: 'special', date: '2026-10-17', title: 'Seminar', body: '', flyerId: null }],
      }),
    );
  });
  await openLesson(page);
  await page.getByRole('radio', { name: 'Schedule', exact: true }).click();
  const cover = page.getByRole('dialog', { name: 'Screen hidden' });
  await expect(cover).toHaveAttribute('data-cover-mode', 'schedule');
  await expect(cover).toHaveAttribute('data-cover-api', 'standard');
  await expect(page.getByRole('region', { name: 'Weekly class schedule' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'GRACIE BARRA ELLIJAY' })).toBeVisible();
  await expect(page.locator('.week-cast__legend')).toBeVisible();
  await expect(page.locator('.week-cast__notes')).toBeVisible();
  await expect(page.getByText('Seminar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Week', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Month', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan', exact: true })).toBeHidden();
  const show = page.getByRole('button', { name: 'Show screen', exact: true });
  await expect(show).toBeVisible();
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __fs: { calls: { className: string; navigationUI: string | null }[] } }).__fs.calls,
  );
  expect(calls.some((call) => call.className.includes('notes-cover') && call.navigationUI === 'hide')).toBe(true);
  await page.screenshot({ path: '/opt/cursor/artifacts/hide-screen-schedule-cover-390.png' });

  await show.click();
  await expect(cover).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan', exact: true })).toBeVisible();
  const exits = await page.evaluate(() => (window as unknown as { __fs: { exits: number } }).__fs.exits);
  expect(exits).toBeGreaterThan(0);

  await page.getByRole('radio', { name: 'Schedule', exact: true }).click();
  await expect(cover).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide screen', exact: true })).toBeVisible();
});

import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };
const WHEN = new Date(2026, 9, 16, 12, 0, 0);
const BACK = 'Back. Hold for Home.';

mkdirSync('/opt/cursor/artifacts', { recursive: true });

function ellijayWeek() {
  const row = (
    id: string,
    day: string,
    time: string,
    title: string,
    location: string,
    level: string,
  ) => ({
    id,
    kind: 'class',
    day,
    time,
    title,
    location,
    subtitle: '',
    level,
  });
  return {
    version: 1,
    title: 'GRACIE BARRA ELLIJAY',
    qrUrl: '',
    notes: '',
    template: 'week',
    castEnabled: true,
    classes: [
      row('c1', 'mon', '18:00', 'Fundamentals', 'MAT 1', 'fundamentals'),
      row('c2', 'wed', '18:30', 'Advanced', 'MAT 2', 'advanced'),
      row('c3', 'fri', '17:00', 'Kids', 'MAT 1', 'kids'),
    ],
    specials: [
      {
        id: 'seminar',
        kind: 'special',
        date: '2026-10-17',
        title: 'Seminar',
        body: '',
        flyerId: null,
      },
    ],
  };
}

async function unlock(page: Page) {
  await page.addInitScript((saved) => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('matboard.schedule.v1', JSON.stringify(saved));
  }, ellijayWeek());
}

async function installStandardFullscreen(page: Page) {
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
}

async function openSchedule(page: Page) {
  await page.clock.install({ time: WHEN });
  await page.setViewportSize(PHONE);
  await page.goto('/schedule');
  await expect(page.getByRole('heading', { name: 'Class Schedule', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'GRACIE BARRA ELLIJAY' })).toBeVisible();
}

test('Fullscreen hides Edit, Week, and Month and keeps the back button', async ({ page }) => {
  await installStandardFullscreen(page);
  await unlock(page);
  await openSchedule(page);

  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Week', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Month', exact: true })).toBeVisible();
  await expect(page.locator('.week-cast__legend')).toBeVisible();
  await expect(page.locator('.week-cast__notes')).toBeVisible();
  await expect(page.getByText('OCTOBER 2026')).toBeVisible();

  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  const board = page.locator('main.schedule');
  await expect(board).toHaveAttribute('data-cover-api', 'standard');
  await expect(board).toHaveClass(/schedule--calendar-fs/);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Week', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Month', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toBeVisible();
  await expect(page.locator('.week-cast__legend')).toBeVisible();
  await expect(page.locator('.week-cast__chip, .week-cast__legend i').first()).toBeVisible();
  await expect(page.locator('.week-cast__notes')).toBeVisible();
  await expect(page.getByText('Seminar')).toBeVisible();
  await expect(page.getByText('Add this site to the Home Screen for full coverage.')).toHaveCount(0);

  const calls = await page.evaluate(
    () =>
      (window as unknown as { __fs: { calls: { className: string; navigationUI: string | null }[] } }).__fs
        .calls,
  );
  expect(calls.some((call) => call.className.includes('schedule') && call.navigationUI === 'hide')).toBe(true);
  await page.screenshot({ path: '/opt/cursor/artifacts/schedule-fullscreen-390.png' });

  await page.keyboard.press('Escape');
  await expect(board).not.toHaveAttribute('data-cover-api');
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Week', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Month', exact: true })).toBeVisible();
  const exits = await page.evaluate(() => (window as unknown as { __fs: { exits: number } }).__fs.exits);
  expect(exits).toBeGreaterThan(0);

  await page.getByRole('radio', { name: 'Month', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Monthly class schedule' })).toBeVisible();
  await expect(page.locator('.week-cast__notes')).toBeVisible();
  await page.getByRole('radio', { name: 'Week', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Weekly class schedule' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit class schedule' })).toBeVisible();
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
  await unlock(page);
  await openSchedule(page);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.locator('main.schedule')).toHaveAttribute('data-cover-api', 'webkit');
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { __wk: { calls: number } }).__wk.calls);
  expect(calls).toBeGreaterThan(0);
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect(page).toHaveURL(/\/slideshow\?folder=gallery/);
  const exits = await page.evaluate(() => (window as unknown as { __wk: { exits: number } }).__wk.exits);
  expect(exits).toBeGreaterThan(0);
});

test('iOS Safari falls back to a fixed 100dvh calendar and a Home Screen hint', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { configurable: true, value: undefined });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
    Object.defineProperty(document, 'webkitFullscreenEnabled', { configurable: true, get: () => false });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
  });
  await unlock(page);
  await openSchedule(page);
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('viewport-fit=cover');
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  const board = page.locator('main.schedule');
  await expect(board).toHaveAttribute('data-cover-api', 'unsupported');
  await expect(board).toHaveClass(/schedule--fs-fallback/);
  await expect(board).toHaveClass(/schedule--calendar-fs/);
  const box = await board.evaluate((el) => {
    const style = getComputedStyle(el);
    return { height: style.height, position: style.position };
  });
  expect(box.position).toBe('fixed');
  expect(box.height.endsWith('px')).toBe(true);
  await expect(page.getByText('Add this site to the Home Screen for full coverage.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Week', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Month', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toBeVisible();
  await expect(page.locator('.week-cast__legend')).toBeVisible();
  await expect(page.locator('.week-cast__notes')).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/schedule-fullscreen-ios-390.png' });

  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByText('Add this site to the Home Screen for full coverage.')).toHaveCount(0);
});

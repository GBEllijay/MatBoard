import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };
const BACK = 'Back. Hold for Home.';

const BLOCKS = [
  'Intro',
  'Warm-up',
  'Technique / Drill 1',
  'Technique / Drill 2',
  'Technique / Drill 3',
  'Specific Training / Rounds',
  'Cool down',
  'Closing',
];

async function unlock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
  });
}

async function openLesson(page: Page) {
  await page.setViewportSize(PHONE);
  await page.goto('/notes?from=coach');
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: BACK, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide screen', exact: true })).toBeVisible();
}

function installFullscreenMock(page: Page) {
  return page.addInitScript(() => {
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

test('hide from a lower card returns to that scroll position', async ({ page }) => {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  await installFullscreenMock(page);
  await unlock(page);
  await openLesson(page);

  for (const name of BLOCKS) {
    await expect(page.getByRole('button', { name: `Hide screen for ${name}`, exact: true })).toBeVisible();
  }

  const hide = page.getByRole('button', { name: 'Hide screen for Technique / Drill 1', exact: true });
  const video = page.getByRole('button', { name: 'Open Daily Training Videos for Technique / Drill 1', exact: true });
  await hide.scrollIntoViewIfNeeded();
  const hideBox = await hide.boundingBox();
  const videoBox = await video.boundingBox();
  expect(hideBox).toBeTruthy();
  expect(videoBox).toBeTruthy();
  expect(Math.abs(hideBox!.width - videoBox!.width)).toBeLessThan(1);
  expect(Math.abs(hideBox!.height - videoBox!.height)).toBeLessThan(1);
  expect(Math.abs(hideBox!.y - videoBox!.y)).toBeLessThan(2);
  expect(hideBox!.width).toBeLessThanOrEqual(64);
  expect(hideBox!.x + hideBox!.width).toBeLessThanOrEqual(videoBox!.x + 1);
  const hideBorder = await hide.evaluate((el) => getComputedStyle(el).borderTopColor);
  const videoBorder = await video.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(hideBorder).toBe(videoBorder);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: '/opt/cursor/artifacts/card-hide-beside-video-390.png' });

  const closing = page.getByRole('button', { name: 'Hide screen for Closing', exact: true });
  await closing.scrollIntoViewIfNeeded();
  const beforeY = await page.evaluate(() => window.scrollY);
  const beforeTop = await page.evaluate(() => {
    const card = document.querySelector('[data-lesson-block="Closing"]');
    return card ? card.getBoundingClientRect().top : Number.NaN;
  });
  expect(beforeY).toBeGreaterThan(200);

  await closing.click();
  const options = page.getByRole('radiogroup', { name: 'Hide screen options for Closing' });
  await expect(options.getByRole('radio', { name: 'Logo', exact: true })).toBeVisible();
  await expect(options.getByRole('radio', { name: 'Schedule', exact: true })).toBeVisible();
  await expect(options.getByRole('radio', { name: 'Black', exact: true })).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/card-hide-picker-390.png' });
  await options.getByRole('radio', { name: 'Black', exact: true }).click();

  const cover = page.getByRole('dialog', { name: 'Screen hidden' });
  await expect(cover).toBeVisible();
  await expect(cover).toHaveAttribute('data-cover-mode', 'black');
  await expect(cover).toHaveAttribute('data-cover-api', 'standard');
  await expect(cover).toHaveAttribute('data-cover-block', 'lesson-block-closing');
  await expect(page.getByText('Add this site to the Home Screen for full coverage.')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan', exact: true })).toBeHidden();
  await expect(page.locator('#notes-closing')).toBeHidden();
  const calls = await page.evaluate(() => (window as unknown as { __fs: { calls: { className: string; navigationUI: string | null }[] } }).__fs.calls);
  expect(calls.some((call) => call.className.includes('notes-cover') && call.navigationUI === 'hide')).toBe(true);
  await page.screenshot({ path: '/opt/cursor/artifacts/card-hide-cover-390.png' });

  await page.getByRole('button', { name: 'Show screen', exact: true }).click();
  await expect(cover).toHaveCount(0);
  await expect(page.locator('#notes-closing')).toBeVisible();
  await expect.poll(async () => page.evaluate((saved) => Math.abs(window.scrollY - saved), beforeY)).toBeLessThanOrEqual(2);
  await expect.poll(async () => page.evaluate((saved) => {
    const card = document.querySelector('[data-lesson-block="Closing"]');
    return card ? Math.abs(card.getBoundingClientRect().top - saved) : 999;
  }, beforeTop)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: '/opt/cursor/artifacts/card-hide-returned-390.png' });

  await page.getByRole('button', { name: 'Hide screen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Screen hidden' })).toHaveAttribute('data-cover-mode', 'black');
  await expect(page.getByRole('dialog', { name: 'Screen hidden' })).not.toHaveAttribute('data-cover-block', 'lesson-block-closing');
  await page.getByRole('button', { name: 'Show screen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan', exact: true })).toBeVisible();
  await expect(page.locator('#notes-intro')).toBeVisible();

  await page.getByRole('radio', { name: 'Kids class', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hide screen for Game', exact: true })).toBeVisible();
  const game = page.locator('[data-lesson-block="Game"]');
  await expect(game.getByRole('button', { name: 'Hide screen for Game', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Adult class', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Technique / Drill 3', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide screen for Game', exact: true })).toHaveCount(0);
});

test('iOS Safari card hide shows the Home Screen hint and keeps the scroll position', async ({ page }) => {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { configurable: true, value: undefined });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
    Object.defineProperty(document, 'webkitFullscreenEnabled', { configurable: true, get: () => false });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
  });
  await unlock(page);
  await openLesson(page);

  const drill = page.getByRole('button', { name: 'Hide screen for Technique / Drill 3', exact: true });
  await drill.scrollIntoViewIfNeeded();
  const beforeY = await page.evaluate(() => window.scrollY);
  expect(beforeY).toBeGreaterThan(120);
  await drill.click();
  await page.getByRole('radiogroup', { name: 'Hide screen options for Technique / Drill 3' }).getByRole('radio', { name: 'Logo', exact: true }).click();

  const cover = page.getByRole('dialog', { name: 'Screen hidden' });
  await expect(cover).toHaveAttribute('data-cover-api', 'unsupported');
  await expect(cover).toHaveClass(/notes-cover--fallback/);
  await expect(cover).toHaveAttribute('data-cover-mode', 'logo');
  await expect(page.getByRole('img', { name: 'Advantage', exact: true })).toBeVisible();
  await expect(page.getByText('Add this site to the Home Screen for full coverage.')).toBeVisible();
  const box = await cover.evaluate((el) => {
    const style = getComputedStyle(el);
    return { position: style.position, height: style.height };
  });
  expect(box.position).toBe('fixed');
  expect(box.height.endsWith('px')).toBe(true);
  await page.screenshot({ path: '/opt/cursor/artifacts/card-hide-ios-hint-390.png' });

  await page.getByRole('button', { name: 'Show screen', exact: true }).click();
  await expect(cover).toHaveCount(0);
  await expect.poll(async () => page.evaluate((saved) => Math.abs(window.scrollY - saved), beforeY)).toBeLessThanOrEqual(2);
  await expect(page.getByRole('heading', { name: 'Technique / Drill 3', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide screen', exact: true })).toBeVisible();
});

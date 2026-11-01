import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BG = path.join(here, 'fixtures', 'timer-bg.jpg');
const LOGO = path.join(here, 'fixtures', 'gym-logo.png');

async function prep(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('matboard.tvTip.v1', '1');
  });
}

async function openOptions(page: Page) {
  await page.locator('main.training').click({ position: { x: 20, y: 300 } });
  await expect(page.getByRole('heading', { name: 'Training options' })).toBeVisible();
}

test('round timer: default shows no custom background or gym logo', async ({ page }) => {
  await prep(page);
  await page.goto('/training');
  await expect(page.locator('.training__clock')).toBeVisible();
  await expect(page.locator('.training__backdrop')).toHaveCount(0);
  await expect(page.locator('.training__gym-logo')).toHaveCount(0);
  await expect(page.locator('main.training')).not.toHaveClass(/training--custom-bg/);
  await openOptions(page);
  await expect(page.getByRole('checkbox', { name: 'Show gym logo (top right)' })).not.toBeChecked();
  // Existing options are all still there.
  for (const legend of ['Round length', 'Break', 'Rounds', 'Sound', 'Skin', 'Background & logo']) {
    await expect(page.locator('.sheet legend', { hasText: legend }).first()).toBeVisible();
  }
});

test('round timer: upload a background, it survives reload and shows in another tab, then reset', async ({ page, context }) => {
  await prep(page);
  await page.goto('/training');
  await openOptions(page);
  await page.locator('#timer-bg-library').setInputFiles(BG);
  await expect(page.locator('.training__backdrop')).toHaveCount(1);
  await expect(page.locator('.training__scrim')).toHaveCount(1);
  await expect(page.locator('main.training')).toHaveClass(/training--custom-bg/);
  await expect(page.locator('main.training')).toHaveClass(/training--scrim-medium/);
  await expect(page.locator('.timer-backdrop__preview.has-image')).toBeVisible();

  // Dim level
  await page.getByRole('radio', { name: 'Strong' }).click();
  await expect(page.locator('main.training')).toHaveClass(/training--scrim-strong/);

  // Clock still on top of the picture and tappable.
  const z = await page.locator('.training__clock').evaluate((el) => getComputedStyle(el).zIndex);
  expect(Number(z)).toBeGreaterThan(0);

  // Second tab on the same device (the Rounds TV popup works the same way).
  const tv = await context.newPage();
  await tv.goto('/training');
  await expect(tv.locator('.training__backdrop')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('.training__backdrop')).toHaveCount(1);

  await openOptions(page);
  await page.getByRole('button', { name: 'Use default background' }).click();
  await expect(page.locator('.training__backdrop')).toHaveCount(0);
  await expect(tv.locator('.training__backdrop')).toHaveCount(0);
});

test('round timer: gym logo toggle uses the Media Console logo in the top-right corner', async ({ page }) => {
  await prep(page);
  await page.goto('/training');
  await openOptions(page);
  // No saved gym logo: toggle alone shows nothing, Add gym logo saves the shared logo.
  await page.getByRole('checkbox', { name: 'Show gym logo (top right)' }).check();
  await expect(page.locator('.training__gym-logo')).toHaveCount(0);
  await page.locator('#timer-logo-library').setInputFiles(LOGO);
  await expect(page.locator('.training__gym-logo img')).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem('matboard.gymLogo.v1'));
  expect(saved).toContain('data:image/');

  await page.locator('.sheet__head').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Training options' })).toHaveCount(0);

  const logo = await page.locator('.training__gym-logo').boundingBox();
  const exit = await page.locator('.play-exit').boundingBox();
  const vw = page.viewportSize()!.width;
  expect(logo && exit).toBeTruthy();
  expect(Math.round(logo!.width)).toBe(Math.round(exit!.width));
  expect(Math.round(logo!.y)).toBe(Math.round(exit!.y));
  expect(Math.round(vw - (logo!.x + logo!.width))).toBe(Math.round(exit!.x));

  // Fullscreen chip does not sit under the logo.
  const chip = await page.locator('.play-fs').boundingBox();
  if (chip) expect(chip.x + chip.width).toBeLessThanOrEqual(logo!.x + 1);

  // Off again
  await openOptions(page);
  await page.getByRole('checkbox', { name: 'Show gym logo (top right)' }).uncheck();
  await expect(page.locator('.training__gym-logo')).toHaveCount(0);
});

test('round timer controller: Background & logo lives in /training/control options too', async ({ page }) => {
  await prep(page);
  await page.goto('/training/control');
  await expect(page.locator('.training-control__options legend', { hasText: 'Background & logo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload background' })).toBeVisible();
});

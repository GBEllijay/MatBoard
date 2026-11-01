import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BG = path.join(here, 'fixtures', 'timer-bg.jpg');
const LOGO = path.join(here, 'fixtures', 'gym-logo.png');
const LOGO_2 = path.join(here, 'fixtures', 'gym-logo-2.png');

type Access = 'white' | 'student' | 'media' | 'pro' | 'owner';

/** Sets this browser's doors the same way the app stores them, then opens /training. */
async function openTimerAs(page: Page, access: Access, url = '/training') {
  await page.addInitScript(() => localStorage.setItem('matboard.tvTip.v1', '1'));
  await page.goto('/products');
  await page.evaluate((who) => {
    for (const key of ['advantage.proUnlocked', 'advantage.whiteUnlocked', 'advantage.studentEditionUnlocked', 'advantage.coachUnlocked']) {
      localStorage.removeItem(key);
    }
    sessionStorage.removeItem('advantage.ownerTest.v1');
    const ownerTest = (grants: string[], tier: string) =>
      sessionStorage.setItem(
        'advantage.ownerTest.v1',
        JSON.stringify({ v: 1, source: 'owner-test', grants, tier, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
      );
    if (who === 'white') localStorage.setItem('advantage.whiteUnlocked', '1');
    if (who === 'student') {
      // A Student Edition device that also has White, so the timer itself opens.
      localStorage.setItem('advantage.studentEditionUnlocked', '1');
      localStorage.setItem('advantage.whiteUnlocked', '1');
    }
    if (who === 'media') ownerTest(['media'], 'media');
    if (who === 'pro') localStorage.setItem('advantage.proUnlocked', '1');
    if (who === 'owner') ownerTest(['white', 'student', 'coach', 'pro', 'media'], 'owner');
  }, access);
  await page.goto(url);
  await expect(page.locator(url === '/training' ? '.training__clock' : 'main')).toBeVisible();
}

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

for (const access of ['white', 'student'] as const) {
  test(`round timer gate: ${access} has no Background & logo section at all`, async ({ page }) => {
    await openTimerAs(page, access);
    await openOptions(page);
    for (const legend of ['Round length', 'Break', 'Rounds', 'Sound', 'Skin']) {
      await expect(page.locator('.sheet legend', { hasText: legend }).first()).toBeVisible();
    }
    await expect(page.locator('.sheet legend', { hasText: 'Background & logo' })).toHaveCount(0);
    await expect(page.locator('.timer-backdrop')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Upload background' })).toHaveCount(0);
    await expect(page.getByText(/Unlock with Media/)).toHaveCount(0);
    await expect(page.locator('#timer-bg-library')).toHaveCount(0);
  });
}

for (const access of ['media', 'pro', 'owner'] as const) {
  test(`round timer gate: ${access} gets Background & logo`, async ({ page }) => {
    await openTimerAs(page, access);
    await openOptions(page);
    await expect(page.locator('.sheet legend', { hasText: 'Background & logo' })).toBeVisible();
    await page.locator('#timer-bg-library').setInputFiles(BG);
    await expect(page.locator('.training__backdrop')).toHaveCount(1);
  });
}

test('round timer gate: losing Media shows the default, keeps the saved picture, and it returns on unlock', async ({ page }) => {
  await openTimerAs(page, 'pro');
  await openOptions(page);
  await page.locator('#timer-bg-library').setInputFiles(BG);
  await page.locator('#timer-logo-library').setInputFiles(LOGO);
  await expect(page.locator('.training__backdrop')).toHaveCount(1);
  await expect(page.locator('.training__gym-logo img')).toBeVisible();

  await page.evaluate(() => {
    localStorage.removeItem('advantage.proUnlocked');
    localStorage.setItem('advantage.whiteUnlocked', '1');
  });
  await page.reload();
  await expect(page.locator('.training__clock')).toBeVisible();
  await expect(page.locator('.training__backdrop')).toHaveCount(0);
  await expect(page.locator('.training__gym-logo')).toHaveCount(0);
  await expect(page.locator('main.training')).not.toHaveClass(/training--custom-bg|training--gym-logo/);
  const kept = await page.evaluate(async () => {
    const prefs = JSON.parse(localStorage.getItem('matboard.timerBackdrop.v1') ?? '{}');
    const blob = await new Promise<boolean>((resolve) => {
      const open = indexedDB.open('matboard-timer-backdrop');
      open.onsuccess = () => {
        const get = open.result.transaction('assets', 'readonly').objectStore('assets').get('background');
        get.onsuccess = () => resolve(Boolean(get.result));
        get.onerror = () => resolve(false);
      };
      open.onerror = () => resolve(false);
    });
    return { stamp: prefs.backgroundStamp, logoOn: prefs.showGymLogo, blob, gymLogo: Boolean(localStorage.getItem('matboard.gymLogo.v1')) };
  });
  expect(kept.stamp).not.toBeNull();
  expect(kept.logoOn).toBe(true);
  expect(kept.blob).toBe(true);
  expect(kept.gymLogo).toBe(true);

  await page.evaluate(() => localStorage.setItem('advantage.proUnlocked', '1'));
  await page.reload();
  await expect(page.locator('.training__backdrop')).toHaveCount(1);
  await expect(page.locator('.training__gym-logo img')).toBeVisible();
});

test('round timer logo: uses the Pro / Media Console logo, and Replace logo updates the shared logo', async ({ page }) => {
  await openTimerAs(page, 'pro');
  // Seed the shared logo the way Pro / Media Console saves it.
  await page.evaluate(async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="red"/></svg>';
    localStorage.setItem('matboard.gymLogo.v1', JSON.stringify({ version: 1, dataUrl: `data:image/svg+xml;base64,${btoa(svg)}` }));
  });
  await page.reload();
  await openOptions(page);
  await expect(page.getByText('Uses the gym logo saved in Pro / Media Console.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace logo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add gym logo' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Show gym logo (top right)' }).check();
  const corner = page.locator('.training__gym-logo img');
  await expect(corner).toHaveAttribute('src', /^data:image\/svg\+xml/);

  await page.locator('#timer-logo-library').setInputFiles(LOGO_2);
  await expect(corner).toHaveAttribute('src', /^data:image\/png/);
  const shared = await page.evaluate(() => JSON.parse(localStorage.getItem('matboard.gymLogo.v1') ?? '{}').dataUrl as string);
  expect(shared).toMatch(/^data:image\/png/);
  expect(await corner.getAttribute('src')).toBe(shared);
  await expect(page.locator('.timer-backdrop__logo-thumb')).toHaveAttribute('src', shared);
  await expect(page.getByRole('button', { name: 'Replace logo' })).toBeVisible();
});

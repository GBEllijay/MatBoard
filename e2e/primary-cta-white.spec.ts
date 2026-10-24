import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const ARTIFACTS = '/opt/cursor/artifacts';

test.beforeAll(() => {
  mkdirSync(ARTIFACTS, { recursive: true });
});

async function paint(locator: Locator) {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      boxShadow: style.boxShadow,
      fontWeight: style.fontWeight,
      borderRadius: style.borderRadius,
    };
  });
}

function expectWhitePrimary(paintResult: Awaited<ReturnType<typeof paint>>, weight?: string) {
  expect(paintResult.backgroundColor).toBe('rgb(255, 255, 255)');
  expect(paintResult.color).toBe('rgb(14, 23, 38)');
  expect(paintResult.boxShadow).toContain('rgba(255, 255, 255, 0.25)');
  expect(paintResult.boxShadow).toMatch(/inset/);
  if (weight) expect(paintResult.fontWeight).toBe(weight);
}

async function yellowControls(page: Page) {
  return page.evaluate(() => {
    const yellow = new Set(['rgb(252, 192, 0)', 'rgb(246, 192, 0)', 'rgb(212, 160, 23)', 'rgb(240, 194, 75)']);
    return [...document.querySelectorAll('button, a')]
      .filter((el) => yellow.has(getComputedStyle(el).backgroundColor))
      .map((el) => `${el.tagName}.${String(el.className)} ${(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)}`);
  });
}

async function restoreWindow(page: Page) {
  await page.evaluate(async () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (typeof document.exitFullscreen === 'function') await document.exitFullscreen();
      else doc.webkitExitFullscreen?.();
    }
  });
  await page.waitForFunction(() => !document.fullscreenElement, undefined, { timeout: 3000 }).catch(() => undefined);
}

async function setSize(page: Page, size: { width: number; height: number }) {
  await restoreWindow(page);
  await page.setViewportSize(size);
}

async function shot(page: Page, name: string, fullPage = false) {
  await page.screenshot({ path: `${ARTIFACTS}/${name}.png`, fullPage });
}

test('homepage Buy CTA is white, keeps its link, and stays visible in focus', async ({ page }) => {
  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/');
  const buy = page.locator('a.sf-buy');
  await expect(buy).toHaveText('Buy Advantage White — $9.99');
  await expect(buy).toHaveAttribute('href', '/buy');
  const desktop = await paint(buy);
  expectWhitePrimary(desktop, '800');
  expect(desktop.borderRadius).toBe('12px');
  await buy.focus();
  await expect(buy).toHaveCSS('outline-color', 'rgb(0, 78, 186)');
  await expect(buy).toHaveCSS('outline-style', 'solid');
  expect(await yellowControls(page)).toEqual([]);
  await buy.scrollIntoViewIfNeeded();
  await shot(page, 'homepage-buy-desktop');
  await buy.screenshot({ path: `${ARTIFACTS}/homepage-buy-button-desktop.png` });

  await setSize(page, { width: 390, height: 844 });
  await buy.scrollIntoViewIfNeeded();
  const phone = await paint(buy);
  expectWhitePrimary(phone, '800');
  await shot(page, 'homepage-buy-390');
  await buy.screenshot({ path: `${ARTIFACTS}/homepage-buy-button-390.png` });

  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/products');
  const productBuy = page.getByRole('link', { name: 'Buy — $9.99' });
  await expect(productBuy).toHaveAttribute('href', '/buy');
  expectWhitePrimary(await paint(productBuy));
  expect(await yellowControls(page)).toEqual([]);
  await productBuy.scrollIntoViewIfNeeded();
  await shot(page, 'products-desktop');
  await setSize(page, { width: 390, height: 844 });
  await productBuy.scrollIntoViewIfNeeded();
  await shot(page, 'products-390');

  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/');
  await buy.click();
  await expect(page).toHaveURL(/\/buy$/);
  const checkout = page.getByRole('button', { name: 'Continue to checkout — $9.99' });
  await expect(checkout).toBeEnabled();
  await expect(checkout).toHaveAttribute('type', 'submit');
  expectWhitePrimary(await paint(checkout));
  await checkout.evaluate((el) => {
    if (el instanceof HTMLElement) el.focus({ focusVisible: true });
  });
  await expect(checkout).toHaveCSS('outline-style', 'solid');
  expect(await yellowControls(page)).toEqual([]);
  await checkout.scrollIntoViewIfNeeded();
  await shot(page, 'buy-page-desktop');
  await checkout.screenshot({ path: `${ARTIFACTS}/buy-checkout-desktop.png` });
  await setSize(page, { width: 390, height: 844 });
  await checkout.scrollIntoViewIfNeeded();
  expectWhitePrimary(await paint(checkout));
  await shot(page, 'buy-page-390');
  await checkout.screenshot({ path: `${ARTIFACTS}/buy-checkout-390.png` });
});

test('products, card, White, Coach, Pro, and media console primaries are white', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
  });

  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/card');
  const cardCta = page.getByRole('link', { name: 'Get Advantage' });
  await expect(cardCta).toHaveAttribute('href', '/buy');
  expectWhitePrimary(await paint(cardCta));
  await shot(page, 'card-desktop');
  await setSize(page, { width: 390, height: 844 });
  await shot(page, 'card-390');

  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/white');
  const scoreboard = page.getByRole('link', { name: 'Scoreboard', exact: true });
  await expect(scoreboard).toHaveAttribute('href', '/match');
  expectWhitePrimary(await paint(scoreboard));
  const controller = page.getByRole('link', { name: 'Controller', exact: true }).first();
  const controllerPaint = await paint(controller);
  expect(controllerPaint.backgroundColor).not.toBe('rgb(255, 255, 255)');
  expect(await yellowControls(page)).toEqual([]);
  await scoreboard.scrollIntoViewIfNeeded();
  await shot(page, 'white-desktop');
  await setSize(page, { width: 390, height: 844 });
  await scoreboard.scrollIntoViewIfNeeded();
  await shot(page, 'white-390');

  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/coach');
  await expect(page.getByRole('heading', { name: 'Advantage - Coach' })).toBeVisible();
  expect(await yellowControls(page)).toEqual([]);
  await shot(page, 'coach-desktop');
  await setSize(page, { width: 390, height: 844 });
  await shot(page, 'coach-390');

  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/pro');
  await expect(page.getByRole('heading', { name: 'Advantage Pro' })).toBeVisible();
  expect(await yellowControls(page)).toEqual([]);
  await shot(page, 'pro-desktop');
  await setSize(page, { width: 390, height: 844 });
  await shot(page, 'pro-390');

  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/slideshow?folder=gallery');
  await expect(page.locator('body')).toBeVisible();
  expect(await yellowControls(page)).toEqual([]);
  await shot(page, 'media-console-desktop');
  await page.goto('/pro');
  await setSize(page, { width: 390, height: 844 });
  await page.goto('/slideshow?folder=gallery');
  await expect(page.locator('body')).toBeVisible();
  expect(await yellowControls(page)).toEqual([]);
  await shot(page, 'media-console-390');
  await page.goto('/pro');
});

test('student backup and journal save stay white and the backup button still runs', async ({ page }) => {
  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/student/backup?student=1');
  const backup = page.getByRole('button', { name: 'Back up my journal', exact: true });
  await expect(backup).toBeEnabled();
  expectWhitePrimary(await paint(backup));
  await backup.focus();
  await expect(backup).toHaveCSS('outline-style', 'solid');
  const disabledPaint = await backup.evaluate((el) => {
    el.setAttribute('disabled', '');
    const style = getComputedStyle(el);
    return { backgroundColor: style.backgroundColor, color: style.color };
  });
  expect(disabledPaint.backgroundColor).toBe('rgb(228, 235, 244)');
  expect(disabledPaint.color).toBe('rgb(51, 65, 85)');
  await backup.evaluate((el) => el.removeAttribute('disabled'));
  expect(await yellowControls(page)).toEqual([]);
  await backup.scrollIntoViewIfNeeded();
  await shot(page, 'student-backup-desktop');
  await setSize(page, { width: 390, height: 844 });
  await shot(page, 'student-backup-390');

  const downloadPromise = page.waitForEvent('download');
  await backup.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/advantage-student-backup-/);

  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/student?student=1');
  await page.getByRole('link', { name: 'Training & Journal', exact: true }).click();
  await page.getByRole('link', { name: "Today's page", exact: true }).click();
  const save = page.getByRole('button', { name: 'Save entry' });
  const savePaint = await paint(save);
  expect(savePaint.backgroundColor).toBe('rgb(255, 255, 255)');
  expect(savePaint.color).toBe('rgb(14, 23, 38)');
  await expect(save).toHaveCSS('border-top-color', 'rgb(14, 23, 38)');
  await save.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await shot(page, 'journal-save-desktop');
  await save.screenshot({ path: `${ARTIFACTS}/journal-save-button-desktop.png` });
  await setSize(page, { width: 390, height: 844 });
  await save.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await shot(page, 'journal-save-390');
  await save.screenshot({ path: `${ARTIFACTS}/journal-save-button-390.png` });
});

test('instructor issue invite is the white primary', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
  });
  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/instructors');
  const issue = page.getByRole('button', { name: 'Issue invite' });
  await expect(issue).toBeVisible();
  await issue.scrollIntoViewIfNeeded();
  expectWhitePrimary(await paint(issue));
  const driveConnect = page.getByRole('button', { name: 'Connect Drive to send to your coach/instructor' });
  await expect(driveConnect).toHaveCSS('background-color', 'rgb(252, 192, 0)');
  await expect(driveConnect).toHaveCSS('color', 'rgb(20, 22, 28)');
  await shot(page, 'instructors-desktop');
  await setSize(page, { width: 390, height: 844 });
  await issue.scrollIntoViewIfNeeded();
  await shot(page, 'instructors-390');
});

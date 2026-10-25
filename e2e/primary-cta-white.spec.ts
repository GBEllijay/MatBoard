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
  const backup = page.getByRole('button', { name: 'Back up my journal (.json)', exact: true });
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
  expectWhitePrimary(await paint(driveConnect));
  await driveConnect.focus();
  await expect(driveConnect).toHaveCSS('outline-color', 'rgb(0, 78, 186)');
  await shot(page, 'instructors-desktop');
  await driveConnect.screenshot({ path: `${ARTIFACTS}/connect-drive-desktop.png` });
  await setSize(page, { width: 390, height: 844 });
  await issue.scrollIntoViewIfNeeded();
  expectWhitePrimary(await paint(driveConnect));
  await shot(page, 'instructors-390');
  await driveConnect.screenshot({ path: `${ARTIFACTS}/connect-drive-390.png` });
});

test('owner unlock, scoreboard Win, roster Save, and student Sign in are white', async ({ page }) => {
  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/products');
  await page.getByRole('button', { name: 'Advantage Pro, coming soon' }).click();
  await page.getByRole('button', { name: 'Owner unlock' }).click();
  const unlockPro = page.getByRole('button', { name: 'Unlock Pro' });
  await expect(unlockPro).toBeVisible();
  await page.mouse.move(0, 0);
  expectWhitePrimary(await paint(unlockPro));
  await unlockPro.hover();
  await expect(unlockPro).toHaveCSS('background-color', 'rgb(244, 247, 251)');
  await page.mouse.move(0, 0);
  await unlockPro.evaluate((el) => {
    if (el instanceof HTMLElement) el.focus({ focusVisible: true });
  });
  await expect(unlockPro).toHaveCSS('outline-style', 'solid');
  await expect(unlockPro).toHaveCSS('outline-color', 'rgb(0, 78, 186)');
  const disabledUnlock = await unlockPro.evaluate((el) => {
    el.setAttribute('disabled', '');
    const style = getComputedStyle(el);
    return { backgroundColor: style.backgroundColor, color: style.color };
  });
  expect(disabledUnlock.backgroundColor).toBe('rgb(228, 235, 244)');
  expect(disabledUnlock.color).toBe('rgb(51, 65, 85)');
  await unlockPro.evaluate((el) => el.removeAttribute('disabled'));
  await shot(page, 'unlock-pro-desktop');
  await unlockPro.screenshot({ path: `${ARTIFACTS}/unlock-pro-button-desktop.png` });
  await setSize(page, { width: 390, height: 844 });
  await page.mouse.move(0, 0);
  await unlockPro.scrollIntoViewIfNeeded();
  expectWhitePrimary(await paint(unlockPro));
  await shot(page, 'unlock-pro-390');
  await unlockPro.screenshot({ path: `${ARTIFACTS}/unlock-pro-button-390.png` });

  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/products');
  await page.getByRole('button', { name: 'Advantage Coach, coming soon' }).click();
  await page.getByRole('button', { name: 'Owner unlock' }).click();
  const unlockCoach = page.getByRole('button', { name: 'Unlock Coach' });
  await page.mouse.move(0, 0);
  expectWhitePrimary(await paint(unlockCoach));
  await shot(page, 'unlock-coach-desktop');
  await setSize(page, { width: 390, height: 844 });
  await shot(page, 'unlock-coach-390');

  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/products');
  await page.getByRole('button', { name: 'Advantage Student Edition, coming soon' }).click();
  await page.getByRole('button', { name: 'Owner unlock' }).click();
  const unlockStudent = page.getByRole('button', { name: 'Unlock Student Edition' });
  await page.mouse.move(0, 0);
  expectWhitePrimary(await paint(unlockStudent));
  await shot(page, 'unlock-student-desktop');
  await setSize(page, { width: 390, height: 844 });
  await shot(page, 'unlock-student-390');

  await page.addInitScript(() => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('matboard.match.v1', JSON.stringify({ skin: 'QUICK_RESULT' }));
  });
  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/match?from=suite');
  const blueWin = page.getByRole('button', { name: 'Blue Win' });
  const whiteWin = page.getByRole('button', { name: 'White Win' });
  const blueDq = page.getByRole('button', { name: 'Blue DQ' });
  const whiteDq = page.getByRole('button', { name: 'White DQ' });
  await expect(blueWin).toHaveText('Win');
  await expect(whiteWin).toHaveText('Win');
  expectWhitePrimary(await paint(blueWin));
  const whiteWinPaint = await paint(whiteWin);
  expect(whiteWinPaint.backgroundColor).toBe('rgb(255, 255, 255)');
  expect(whiteWinPaint.color).toBe('rgb(14, 23, 38)');
  await expect(whiteWin).toHaveCSS('border-top-width', '2px');
  await expect(whiteWin).toHaveCSS('border-top-color', 'rgb(14, 23, 38)');
  await expect(blueDq).toHaveCSS('background-color', 'rgb(245, 84, 79)');
  await expect(whiteDq).toHaveCSS('background-color', 'rgb(245, 84, 79)');
  await whiteWin.hover();
  await expect(whiteWin).toHaveCSS('background-color', 'rgb(244, 247, 251)');
  await whiteWin.evaluate((el) => {
    if (el instanceof HTMLElement) el.focus({ focusVisible: true });
  });
  await expect(whiteWin).toHaveCSS('outline-style', 'solid');
  await expect(whiteWin).toHaveCSS('outline-color', 'rgb(0, 78, 186)');
  await page.mouse.move(0, 0);
  await shot(page, 'scoreboard-win-desktop');
  await whiteWin.screenshot({ path: `${ARTIFACTS}/scoreboard-white-win-desktop.png` });
  await blueWin.screenshot({ path: `${ARTIFACTS}/scoreboard-blue-win-desktop.png` });
  await page.goto('/products');
  await setSize(page, { width: 390, height: 844 });
  await page.goto('/match?from=suite');
  const whiteWinPhone = page.getByRole('button', { name: 'White Win' });
  await expect(whiteWinPhone).toBeVisible();
  await expect(whiteWinPhone).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(whiteWinPhone).toHaveCSS('color', 'rgb(14, 23, 38)');
  await expect(whiteWinPhone).toHaveCSS('border-top-width', '2px');
  await expect(whiteWinPhone).toHaveCSS('border-top-color', 'rgb(14, 23, 38)');
  await shot(page, 'scoreboard-win-390');
  await whiteWinPhone.screenshot({ path: `${ARTIFACTS}/scoreboard-white-win-390.png` });

  await page.goto('/products');
  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/match/control');
  const padWin = page.getByRole('button', { name: 'White Win' });
  await padWin.scrollIntoViewIfNeeded();
  await expect(padWin).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(padWin).toHaveCSS('color', 'rgb(14, 23, 38)');
  await expect(padWin).toHaveCSS('border-top-width', '2px');
  await expect(padWin).toHaveCSS('border-top-color', 'rgb(14, 23, 38)');
  await expect(page.getByRole('button', { name: 'White DQ' })).toHaveCSS('background-color', 'rgb(239, 68, 68)');
  await shot(page, 'controller-win-desktop');
  await setSize(page, { width: 390, height: 844 });
  await padWin.scrollIntoViewIfNeeded();
  await shot(page, 'controller-win-390');

  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/white/roster');
  await page.getByRole('textbox', { name: 'Competitor name' }).fill('Ada');
  await page.getByRole('radio', { name: 'White', exact: true }).click();
  await page.getByRole('button', { name: 'Add name' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  const save = page.getByRole('button', { name: 'Save', exact: true });
  expectWhitePrimary(await paint(save));
  await shot(page, 'white-roster-save-desktop');
  await save.screenshot({ path: `${ARTIFACTS}/white-roster-save-desktop.png` });
  await setSize(page, { width: 390, height: 844 });
  await save.scrollIntoViewIfNeeded();
  expectWhitePrimary(await paint(save));
  await shot(page, 'white-roster-save-390');
  await save.screenshot({ path: `${ARTIFACTS}/white-roster-save-390.png` });
  await setSize(page, { width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  const confirmRemove = page.getByRole('button', { name: 'Confirm remove' });
  await page.mouse.move(0, 0);
  await expect(confirmRemove).toHaveCSS('background-color', 'rgb(252, 192, 0)');
  await confirmRemove.hover();
  await expect(confirmRemove).toHaveCSS('background-color', 'rgb(252, 192, 0)');
  await page.mouse.move(0, 0);
  await expect(confirmRemove).toHaveCSS('color', 'rgb(20, 22, 28)');
  await shot(page, 'white-roster-confirm-remove-desktop');
  await setSize(page, { width: 390, height: 844 });
  await confirmRemove.scrollIntoViewIfNeeded();
  await shot(page, 'white-roster-confirm-remove-390');

  await setSize(page, { width: 1280, height: 900 });
  await page.goto('/student/connections?student=1');
  await page.getByRole('textbox', { name: 'Academy link' }).fill('https://drive.google.com/drive/folders/academyFolder123');
  await page.getByRole('button', { name: 'Use this academy link' }).click();
  const signIn = page.getByRole('button', { name: 'Sign in to Google Drive' });
  await expect(signIn).toBeVisible();
  await page.mouse.move(0, 0);
  const signPaint = await paint(signIn);
  expect(signPaint.backgroundColor).toBe('rgb(255, 255, 255)');
  expect(signPaint.color).toBe('rgb(14, 23, 38)');
  await expect(signIn).toHaveCSS('border-top-width', '2px');
  await expect(signIn).toHaveCSS('border-top-color', 'rgb(14, 23, 38)');
  await page.mouse.move(0, 0);
  await signIn.hover();
  await expect(signIn).toHaveCSS('background-color', 'rgb(244, 247, 251)');
  await page.mouse.move(0, 0);
  await signIn.evaluate((el) => {
    if (el instanceof HTMLElement) el.focus({ focusVisible: true });
  });
  await expect(signIn).toHaveCSS('outline-style', 'solid');
  await expect(signIn).toHaveCSS('outline-color', 'rgb(0, 78, 186)');
  const disabledSign = await signIn.evaluate((el) => {
    el.setAttribute('disabled', '');
    const style = getComputedStyle(el);
    return { backgroundColor: style.backgroundColor, color: style.color };
  });
  expect(disabledSign.backgroundColor).toBe('rgb(228, 235, 244)');
  expect(disabledSign.color).toBe('rgb(51, 65, 85)');
  await signIn.evaluate((el) => el.removeAttribute('disabled'));
  await signIn.scrollIntoViewIfNeeded();
  await shot(page, 'student-sign-in-desktop');
  await signIn.screenshot({ path: `${ARTIFACTS}/student-sign-in-desktop.png` });
  await setSize(page, { width: 390, height: 844 });
  await signIn.scrollIntoViewIfNeeded();
  await expect(signIn).toHaveCSS('border-top-color', 'rgb(14, 23, 38)');
  await shot(page, 'student-sign-in-390');
  await signIn.screenshot({ path: `${ARTIFACTS}/student-sign-in-390.png` });
});

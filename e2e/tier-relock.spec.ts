import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { FULL_OWNER_UNLOCK_CODE } from '../src/lib/proUnlock.ts';
import { WHITE_FREE_CODE } from '../src/lib/whitePurchase.ts';

const ARTIFACTS = '/opt/cursor/artifacts';

test.beforeAll(() => {
  mkdirSync(ARTIFACTS, { recursive: true });
});

test('re-lock White and Student Edition, then the codes open them again', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto('/products');
  await page.evaluate(() => {
    localStorage.setItem('matboard.pro.googleDriveFolder.v1', '{"folderId":"keep-folder"}');
    localStorage.setItem(
      'matboard.whiteRoster.v1',
      JSON.stringify({ version: 1, names: [{ id: 'w1', name: 'Keepsake', belt: 'white' }] }),
    );
    sessionStorage.setItem('matboard.pro.googleDriveToken', '{"access":"keep-token"}');
  });

  await page.getByRole('button', { name: 'Advantage Student Edition, coming soon' }).click();
  await page.getByRole('button', { name: 'Owner unlock' }).click();
  await page.getByPlaceholder('Owner code').fill(FULL_OWNER_UNLOCK_CODE);
  await page.getByRole('button', { name: 'Unlock Student Edition' }).click();
  await page.getByRole('link', { name: 'Open Student Edition', exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);

  await page.getByRole('link', { name: 'Training & Journal', exact: true }).click();
  await page.getByRole('link', { name: "Today's page", exact: true }).click();
  await page.getByRole('textbox', { name: 'Class', exact: true }).fill('Relock class');
  await page.getByRole('textbox', { name: 'Technique drilled #1' }).fill('Collar choke');
  await page.getByRole('textbox', { name: 'Drill notes' }).fill('relock keeps the collar note');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByRole('status')).toHaveText('Entry saved');
  await page.getByRole('link', { name: 'See saved card', exact: true }).click();
  await expect(page.getByText('relock keeps the collar note')).toBeVisible();

  await page.goto('/student/rank');
  await page.getByRole('button', { name: 'Blue', exact: true }).click();
  await page.getByRole('button', { name: 'Stripe 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Blue', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Stripe 2', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/student/fundamentals');
  const sweeps = page.getByRole('region', { name: 'Sweeps' });
  await sweeps.getByRole('radio', { name: 'Scissor sweep 3 Live with resistance' }).click();
  await expect(sweeps.getByRole('radio', { name: 'Scissor sweep 3 Live with resistance' })).toBeChecked();
  await expect(sweeps.getByText(/1 of \d+ ready when a partner resists/)).toBeVisible();

  const before = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.v1'));
  expect(before).toContain('relock keeps the collar note');
  expect(before).toContain('blue');

  await page.goto('/student');
  const lockStudent = page.getByRole('button', { name: 'Lock Student Edition' });
  await expect(lockStudent).toHaveClass(/home__text-btn/);
  await expect(page.getByText('Advantage – Student Edition is on for this browser.')).toBeVisible();
  await lockStudent.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${ARTIFACTS}/student-unlocked-lock.png`, fullPage: true });

  await page.goto('/white');
  const lockWhite = page.getByRole('button', { name: 'Lock White' });
  await expect(lockWhite).toHaveClass(/home__text-btn/);
  await expect(page.getByText('Advantage White is on for this browser.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buy Advantage White — $9.99' })).toBeVisible();
  await lockWhite.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${ARTIFACTS}/white-unlocked-lock.png`, fullPage: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await lockWhite.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The White route guard sends a locked visitor to the paywall, same as a fresh visit to /white.
  await expect(page).toHaveURL(/\/buy$/);
  await expect(page.getByRole('button', { name: 'Continue to checkout — $9.99' })).toBeVisible();
  await expect(page.getByText('Advantage White is unlocked on this device.')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Already purchased?' })).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/white-locked-buy.png`, fullPage: true });

  await page.goto('/products');
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/buy');
  await expect(page.getByRole('link', { name: 'Buy — $9.99' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Student Edition', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/white-locked-products.png`, fullPage: true });

  await page.goto('/buy');
  await page.getByLabel('Unlock or promo code').fill(WHITE_FREE_CODE);
  await page.getByRole('button', { name: 'Continue to checkout — $9.99' }).click();
  await expect(page.getByText('Advantage White is unlocked at $0. No card was charged.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open White' })).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/white-relocked-open.png`, fullPage: true });
  await page.goto('/products');
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/white');

  await page.goto('/student');
  await page.getByRole('button', { name: 'Lock Student Edition' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('button', { name: 'Advantage Student Edition, coming soon' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/white');
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/student-locked-products.png`, fullPage: true });

  await page.goto('/student');
  await expect(page.getByRole('link', { name: 'Training & Journal', exact: true })).toHaveCount(0);
  await expect(page.getByText('This preview opens with the owner unlock, or with ?student=1 on the address.')).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/student-locked-closed.png`, fullPage: true });

  const lockedStorage = await page.evaluate(() => ({
    journal: localStorage.getItem('matboard.studentEdition.v1'),
    drive: localStorage.getItem('matboard.pro.googleDriveFolder.v1'),
    roster: localStorage.getItem('matboard.whiteRoster.v1'),
    token: sessionStorage.getItem('matboard.pro.googleDriveToken'),
    pro: localStorage.getItem('advantage.proUnlocked'),
    coach: localStorage.getItem('advantage.coachUnlocked'),
    white: localStorage.getItem('advantage.whiteUnlocked'),
    student: localStorage.getItem('advantage.studentEditionUnlocked'),
  }));
  expect(lockedStorage.journal).toBe(before);
  expect(lockedStorage.drive).toBe('{"folderId":"keep-folder"}');
  expect(lockedStorage.roster).toContain('Keepsake');
  expect(lockedStorage.token).toBe('{"access":"keep-token"}');
  expect(lockedStorage.pro).toBe('1');
  expect(lockedStorage.coach).toBe('1');
  expect(lockedStorage.white).toBe('1');
  expect(lockedStorage.student).toBeNull();

  await page.goto('/products');
  await page.getByRole('button', { name: 'Advantage Student Edition, coming soon' }).click();
  await page.getByRole('button', { name: 'Owner unlock' }).click();
  await page.getByPlaceholder('Owner code').fill(FULL_OWNER_UNLOCK_CODE);
  await page.getByRole('button', { name: 'Unlock Student Edition' }).click();
  await page.getByRole('link', { name: 'Open Student Edition', exact: true }).click();
  await page.getByRole('link', { name: 'Training & Journal', exact: true }).click();
  await page.getByRole('link', { name: 'Journal cards', exact: true }).click();
  await expect(page.getByText('relock keeps the collar note')).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/student-data-after-relock.png`, fullPage: true });

  await page.goto('/student/rank');
  await expect(page.getByRole('button', { name: 'Blue', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Stripe 2', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/student/fundamentals');
  const sweepsAgain = page.getByRole('region', { name: 'Sweeps' });
  await expect(sweepsAgain.getByText(/1 of \d+ ready when a partner resists/)).toBeVisible();
  await expect(sweepsAgain.getByRole('radio', { name: 'Scissor sweep 3 Live with resistance' })).toBeChecked();

  await page.goto('/pro');
  await expect(page.getByRole('button', { name: 'Lock Pro' })).toHaveClass(/home__text-btn/);
  await page.getByRole('button', { name: 'Lock Pro' }).click();
  await page.goto('/products');
  await expect(page.getByRole('button', { name: 'Advantage Pro, coming soon' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/white');

  await page.goto('/coach');
  await expect(page.getByRole('button', { name: 'Lock Coach' })).toHaveClass(/home__text-btn/);
  await page.getByRole('button', { name: 'Lock Coach' }).click();
  await page.goto('/products');
  await expect(page.getByRole('button', { name: 'Advantage Coach, coming soon' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/white');

  const after = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.v1'));
  expect(after).toBe(before);
  expect(after).toContain('relock keeps the collar note');
});

import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };
const BACK = 'Back. Hold for Home.';

async function unlock(page: Page, pro: boolean) {
  await page.addInitScript((openPro) => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    if (openPro) localStorage.setItem('advantage.proUnlocked', '1');
    else localStorage.removeItem('advantage.proUnlocked');
  }, pro);
}

test('plain Coach keeps Adult, locks Competition, and Kids starts with a Game between techniques', async ({ page }) => {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  await page.setViewportSize(PHONE);
  await unlock(page, false);
  await page.goto('/notes?from=coach');
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide screen', exact: true })).toBeVisible();

  const adult = page.getByRole('radio', { name: 'Adult class', exact: true });
  const kids = page.getByRole('radio', { name: 'Kids class', exact: true });
  const competition = page.getByRole('radio', { name: 'Competition class', exact: true });
  await expect(adult).toHaveAttribute('aria-checked', 'true');
  await expect(competition).toBeDisabled();
  await expect(page.getByText('Competition class is included with Coach Unlimited and Pro.')).toBeVisible();
  const adultFill = await adult.evaluate((el) => getComputedStyle(el).backgroundColor);
  const addFill = await page.getByRole('button', { name: 'Add technique', exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(adultFill).toBe('rgb(0, 78, 186)');
  expect(addFill).toBe('rgb(252, 192, 0)');
  await expect(page.getByRole('heading', { name: 'Technique / Drill 3', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Game', exact: true })).toHaveCount(0);
  await page.screenshot({ path: '/opt/cursor/artifacts/lesson-template-adult-390.png' });

  await kids.click();
  await expect(kids).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('heading', { name: 'Technique / Drill 1', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Game', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Technique / Drill 2', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Technique / Drill 3', exact: true })).toHaveCount(0);
  await expect(page.locator('#notes-intro')).toBeVisible();
  await expect(page.locator('#notes-closing')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Warm-up', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Specific Training / Rounds', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cool down', exact: true })).toBeVisible();

  const order = await page.locator('.notes__block h2').allTextContents();
  const gameAt = order.indexOf('Game');
  const firstAt = order.indexOf('Technique / Drill 1');
  const secondAt = order.indexOf('Technique / Drill 2');
  expect(firstAt).toBeGreaterThan(-1);
  expect(gameAt).toBeGreaterThan(firstAt);
  expect(secondAt).toBeGreaterThan(gameAt);
  await page.getByRole('heading', { name: 'Game', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/opt/cursor/artifacts/lesson-template-kids-390.png' });

  const gameBlock = page.locator('.notes__block').filter({ has: page.getByRole('heading', { name: 'Game', exact: true }) }).first();
  await gameBlock.getByRole('button', { name: 'Move Game up', exact: true }).click();
  const moved = await page.locator('.notes__block h2').allTextContents();
  expect(moved.indexOf('Game')).toBeLessThan(moved.indexOf('Technique / Drill 1'));

  await gameBlock.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Remove Game' })).toBeVisible();
  await page.getByRole('group', { name: 'Remove Game' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Game', exact: true })).toBeVisible();
  await gameBlock.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('group', { name: 'Remove Game' }).getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Game', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Game', exact: true })).toBeVisible();
  await page.locator('#notes-intro').fill('Kids closed guard.');
  await page.reload();
  await expect(kids).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#notes-intro')).toHaveValue('Kids closed guard.');
  await expect(page.getByRole('heading', { name: 'Game', exact: true })).toBeVisible();

  await page.getByRole('radio', { name: 'Logo', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Screen hidden' })).toBeVisible();
  await page.getByRole('button', { name: 'Show screen', exact: true }).click();
  await expect(page.locator('#notes-intro')).toHaveValue('Kids closed guard.');
});

test('a plan that already has notes asks before a template replaces the starting blocks', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await unlock(page, false);
  await page.goto('/notes?from=coach');
  await page.locator('#notes-intro').fill('Keep this intro.');
  await page.getByRole('radio', { name: 'Kids class', exact: true }).click();
  const confirm = page.getByRole('group', { name: 'Apply class template' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Adult class', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('heading', { name: 'Technique / Drill 3', exact: true })).toBeVisible();
  await expect(page.locator('#notes-intro')).toHaveValue('Keep this intro.');

  await page.getByRole('radio', { name: 'Kids class', exact: true }).click();
  await confirm.getByRole('button', { name: 'Apply template', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Game', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Technique / Drill 3', exact: true })).toHaveCount(0);
  await expect(page.locator('#notes-intro')).toHaveValue('Keep this intro.');
});

test('Coach Unlimited opens Competition class from the picker and the hub button is gone', async ({ page }) => {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  await page.setViewportSize(PHONE);
  await unlock(page, true);
  await page.goto('/coach-unlimited');
  await expect(page.getByRole('link', { name: 'Competition Class Curriculum', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Daily Lesson Plan', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/coach-unlimited');
  await expect(page.getByRole('link', { name: 'Open a class from Google Drive', exact: true })).toBeVisible();
  const competition = page.getByRole('radio', { name: 'Competition class', exact: true });
  await expect(competition).toBeEnabled();
  await competition.click();
  await expect(page.getByRole('heading', { name: 'Competition Class Curriculum', exact: true })).toBeVisible();
  await expect(page.getByLabel('Competition Class Designation')).toBeVisible();
  await expect(page.getByRole('button', { name: "Lock In Today's Curriculum", exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide screen', exact: true })).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/lesson-template-competition-390.png' });

  await page.getByRole('radio', { name: 'Logo', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Screen hidden' })).toBeVisible();
  await page.getByRole('button', { name: 'Show screen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Competition Class Curriculum', exact: true })).toBeVisible();
});

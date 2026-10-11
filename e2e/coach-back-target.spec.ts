import { expect, test, type Page } from '@playwright/test';

const BACK = 'Back. Hold for Home.';

const COACH_TOOLS = [
  'Daily Lesson Plan',
  'Daily Training Videos',
  'Technique Tree',
  'Student Roster',
  'Mock Tournament',
] as const;

async function unlockBoth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.whiteUnlocked', '1');
  });
}

async function openToolAndBack(page: Page, hubPath: string, name: string, backPath: string) {
  await page.goto(hubPath);
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const back = page.getByRole('link', { name: BACK });
  await expect(back).toHaveAttribute('href', backPath);
  await back.click();
  await expect(page).toHaveURL(new RegExp(`${backPath}$`));
  if (backPath === '/coach' || backPath === '/coach-unlimited') {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  }
}

test('Coach hub logo returns to Coach home for all five tools', async ({ page }) => {
  await unlockBoth(page);
  for (const name of COACH_TOOLS) {
    await openToolAndBack(page, '/coach', name, '/coach');
  }
});

test('Coach Unlimited and Pro keep their own back target', async ({ page }) => {
  await unlockBoth(page);

  for (const name of ['Daily Lesson Plan', 'Daily Training Videos', 'Technique Tree'] as const) {
    await openToolAndBack(page, '/coach-unlimited', name, '/coach-unlimited');
  }

  await openToolAndBack(page, '/coach-unlimited', 'Competitor Roster', '/competitors');

  await page.goto('/pro');
  await page.getByRole('link', { name: 'Advantage Coach Unlimited', exact: true }).click();
  await expect(page).toHaveURL(/\/coach-unlimited$/);
  await page.getByRole('link', { name: 'Daily Training Videos', exact: true }).click();
  await page.getByRole('link', { name: BACK }).click();
  await expect(page).toHaveURL(/\/coach-unlimited$/);

  await page.goto('/pro');
  await page.getByRole('link', { name: 'Tournament Management Pro', exact: true }).click();
  await expect(page).toHaveURL(/\/suite$/);
  await page.getByRole('link', { name: 'Brackets-Tournament Software', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tournament Software' })).toBeVisible();
  const suiteBack = page.getByRole('link', { name: BACK });
  await expect(suiteBack).toHaveAttribute('href', '/suite');
  await suiteBack.click();
  await expect(page).toHaveURL(/\/suite$/);

  for (const path of ['/notes', '/techniques', '/technique-tree', '/roster', '/tournament']) {
    await page.goto(path);
    const back = page.getByRole('link', { name: BACK });
    await expect(back).toHaveAttribute('href', '/pro');
    await back.click();
    await expect(page).toHaveURL(/\/pro$/);
  }
});

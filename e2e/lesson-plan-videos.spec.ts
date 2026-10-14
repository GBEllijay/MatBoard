import { expect, test, type Page } from '@playwright/test';

const BACK = 'Back. Hold for Home.';

async function unlock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
  });
}

function warmupName(page: Page) {
  return page.getByRole('region', { name: 'Warm-up' }).locator('.notes__video-name');
}

async function uploadWarmupVideo(page: Page, name: string) {
  await page.getByRole('button', { name: 'Open Daily Training Videos for Warm-up' }).click();
  await expect(page.getByRole('heading', { name: 'Daily Training Videos' })).toBeVisible();
  const warmup = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Warm-up (optional)', exact: true }),
  });
  await warmup.getByRole('button', { name: '+ Add video' }).click();
  await expect(page.getByRole('dialog', { name: 'Add video' })).toBeVisible();
  await page.locator('#techniques-video-library').setInputFiles({
    name,
    mimeType: 'video/mp4',
    buffer: Buffer.from(`lesson-video-${name}`),
  });
  await expect(warmup.getByRole('button', { name: 'Replace' })).toBeVisible();
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan' })).toBeVisible();
}

test('each daily lesson plan keeps its own video across switches and reload', async ({ page }) => {
  await unlock(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/notes?plan=unlimited');
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan' })).toBeVisible();

  await page.getByLabel('Class designation').fill('Plan A');
  await page.getByLabel('Intro', { exact: true }).fill('Alpha class');
  await uploadWarmupVideo(page, 'VideoA.mp4');
  await expect(warmupName(page)).toHaveText('VideoA.mp4');
  const returned = new URL(page.url());
  expect(returned.pathname).toBe('/notes');
  expect(returned.searchParams.get('plan')).toBe('unlimited');
  expect(returned.searchParams.get('date')).toBeTruthy();

  await page.getByRole('button', { name: 'Add class plan' }).click();
  await expect(warmupName(page)).toHaveCount(0);
  await page.getByLabel('Class designation').fill('Plan B');
  await page.getByLabel('Intro', { exact: true }).fill('Beta class');
  await uploadWarmupVideo(page, 'VideoB.mp4');
  await expect(warmupName(page)).toHaveText('VideoB.mp4');

  await page.getByRole('button', { name: 'Coach / Plan A / Time' }).click();
  await expect(page.getByLabel('Class designation')).toHaveValue('Plan A');
  await expect(page.getByLabel('Intro', { exact: true })).toHaveValue('Alpha class');
  await expect(warmupName(page)).toHaveText('VideoA.mp4');

  await page.getByRole('button', { name: 'Coach / Plan B / Time' }).click();
  await expect(page.getByLabel('Intro', { exact: true })).toHaveValue('Beta class');
  await expect(warmupName(page)).toHaveText('VideoB.mp4');

  await page.reload();
  await expect(page.getByLabel('Intro', { exact: true })).toHaveValue('Beta class');
  await expect(warmupName(page)).toHaveText('VideoB.mp4');

  await page.getByRole('button', { name: 'Coach / Plan A / Time' }).click();
  await expect(warmupName(page)).toHaveText('VideoA.mp4');
  await page.reload();
  await expect(page.getByLabel('Class designation')).toHaveValue('Plan A');
  await expect(warmupName(page)).toHaveText('VideoA.mp4');
});

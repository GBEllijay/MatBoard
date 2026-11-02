import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const FACE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('a profile photo stays on this phone and is still visible after reload', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/profile?student=1');
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  await expect(page.locator('img.profile-avatar')).toHaveCount(0);

  await page.locator('#profile-portrait-library').setInputFiles({
    name: 'face.png',
    mimeType: 'image/png',
    buffer: FACE,
  });

  const avatar = page.locator('img.profile-avatar');
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute('alt', 'Profile photo');
  await expect(page.getByRole('status')).toHaveText('Saved on this phone. Shows on your profile.');
  await expect(page.getByRole('button', { name: 'Remove photo', exact: true })).toBeVisible();
  await expect(page.locator('label[for="profile-portrait-library"]')).toHaveText('Change photo');

  const stored = await page.evaluate(() => localStorage.getItem('matboard.studentPortrait.v1') ?? '');
  expect(stored).toContain('data:image/');
  const dataUrl = (JSON.parse(stored) as { dataUrl: string }).dataUrl;

  await page.reload();
  await expect(page.locator('img.profile-avatar')).toBeVisible();
  await expect(page.locator('img.profile-avatar')).toHaveAttribute('src', dataUrl);
  await page.screenshot({ path: '/opt/cursor/artifacts/after-profile-photo-390.png', fullPage: true });

  await page.goto('/student?student=1');
  const hubPhoto = page.locator('img.s-hub__avatar');
  await expect(hubPhoto).toBeVisible();
  await expect(hubPhoto).toHaveAttribute('src', dataUrl);
  await expect(page.locator('img.s-profile__avatar')).toHaveAttribute('src', dataUrl);
  await page.screenshot({ path: '/opt/cursor/artifacts/after-hub-photo-390.png' });

  await page.goto('/student/share?student=1');
  const coachDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Make a file for my coach', exact: true }).click();
  const coachFile = await coachDownload;
  const coachBody = await readFile(await coachFile.path(), 'utf8');
  expect(coachBody).not.toContain(dataUrl);
  expect(coachBody).not.toContain('"portrait"');
});

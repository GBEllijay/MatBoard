import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('journal clips save, search, edit, persist, and delete', async ({ page }) => {
  await page.goto('/student/journal?student=1');
  await expect(page.getByRole('region', { name: 'Clips' })).toBeVisible();
  await expect(page.getByText('YouTube or Instagram links work well. Any http or https link is fine.')).toBeVisible();

  await page.getByRole('textbox', { name: 'Clip link' }).fill('notaurl');
  await page.getByRole('textbox', { name: 'Clip description' }).fill('Armbar from guard');
  await page.getByRole('button', { name: 'Save clip' }).click();
  await expect(page.getByRole('alert')).toContainText('http or https');

  await page.getByRole('textbox', { name: 'Clip link' }).fill('https://www.youtube.com/watch?v=armbar');
  await page.getByRole('textbox', { name: 'Clip description' }).fill('Armbar from guard');
  await page.getByRole('button', { name: 'Save clip' }).click();
  await page.getByRole('textbox', { name: 'Clip link' }).fill('https://www.instagram.com/reel/kneeslice');
  await page.getByRole('textbox', { name: 'Clip description' }).fill('Knee slice pass');
  await page.getByRole('button', { name: 'Save clip' }).click();

  const clips = page.getByRole('region', { name: 'Clips' });
  const armbar = clips.getByRole('link', { name: 'Armbar from guard' });
  await expect(armbar).toHaveAttribute('href', 'https://www.youtube.com/watch?v=armbar');
  await expect(armbar).toHaveAttribute('target', '_blank');
  await expect(clips.getByRole('link', { name: 'Knee slice pass' })).toHaveAttribute('target', '_blank');

  await page.getByRole('textbox', { name: 'Search clips' }).fill('knee slice');
  await expect(clips.getByRole('link', { name: 'Knee slice pass' })).toBeVisible();
  await expect(clips.getByRole('link', { name: 'Armbar from guard' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search clips' }).fill('youtube.com/watch');
  await expect(clips.getByRole('link', { name: 'Armbar from guard' })).toBeVisible();
  await expect(clips.getByRole('link', { name: 'Knee slice pass' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search clips' }).fill('');

  await page.getByRole('button', { name: 'Edit Armbar from guard' }).click();
  await page.getByRole('textbox', { name: 'Edit description for Armbar from guard' }).fill('Armbar finish');
  await page.getByRole('textbox', { name: 'Edit link for Armbar from guard' }).fill('https://youtu.be/armbar-finish');
  await page.getByRole('button', { name: 'Save clip changes' }).click();
  await expect(clips.getByRole('link', { name: 'Armbar finish' })).toHaveAttribute('href', 'https://youtu.be/armbar-finish');
  await page.getByRole('button', { name: 'Edit Armbar finish' }).click();
  await page.getByRole('textbox', { name: 'Edit description for Armbar finish' }).fill('Should not stick');
  await page.getByRole('button', { name: 'Cancel clip edit' }).click();
  await expect(clips.getByRole('link', { name: 'Armbar finish' })).toBeVisible();
  await expect(clips.getByText('Should not stick')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('link', { name: 'Armbar finish' })).toHaveAttribute('href', 'https://youtu.be/armbar-finish');
  await expect(page.getByRole('link', { name: 'Knee slice pass' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete Knee slice pass' }).click();
  await expect(page.getByRole('group', { name: 'Delete Knee slice pass' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep clip' }).click();
  await expect(page.getByRole('link', { name: 'Knee slice pass' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Knee slice pass' }).click();
  await page.getByRole('button', { name: 'Confirm delete Knee slice pass' }).click();
  await expect(page.getByRole('link', { name: 'Knee slice pass' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Armbar finish' })).toBeVisible();

  await page.getByRole('link', { name: 'Back. Hold for Home.' }).click();
  await page.locator('summary', { hasText: 'Menu' }).click();
  await page.getByRole('link', { name: 'Send to coach', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send to coach' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Send to coach' }).click(),
  ]);
  const sent = await readFile(await download.path(), 'utf8');
  const packet = JSON.parse(sent) as { clips?: { description: string; url: string }[] };
  expect(packet.clips).toEqual([
    expect.objectContaining({
      description: 'Armbar finish',
      url: 'https://youtu.be/armbar-finish',
    }),
  ]);
  await expect(page.getByRole('status')).toContainText('Downloaded the progress file');

  await page.goto('/student/journal?student=1');
  await page.getByRole('textbox', { name: 'Notes' }).fill('still writes a card');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('still writes a card')).toBeVisible();
  await page.goto('/student/journal?student=1');
  await expect(page.getByRole('link', { name: 'Armbar finish' })).toBeVisible();
});

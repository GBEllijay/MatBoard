import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('video library saves, searches, edits, and deletes, and the journal has no clips', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/journal?student=1');
  await expect(page.getByRole('region', { name: 'Clips' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save clip' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save entry' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add note to an earlier card' })).toBeVisible();

  await page.goto('/student?student=1');
  await page.getByRole('link', { name: 'Training & Journal', exact: true }).click();
  const library = page.getByRole('link', { name: 'Video Library', exact: true });
  const calendar = page.getByRole('link', { name: 'Calendar', exact: true });
  await expect(library).toBeVisible();
  const libraryBox = await library.boundingBox();
  const calendarBox = await calendar.boundingBox();
  expect(libraryBox && calendarBox).toBeTruthy();
  expect(libraryBox!.y).toBeGreaterThan(calendarBox!.y);
  await library.click();

  await expect(page.getByRole('heading', { name: 'Video Library' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Video link' }).fill('notaurl');
  await page.getByRole('textbox', { name: 'Technique or drill' }).fill('Armbar from guard');
  await page.getByRole('button', { name: 'Add video' }).click();
  await expect(page.getByRole('alert')).toContainText('http or https');

  await page.getByRole('textbox', { name: 'Video link' }).fill('https://www.youtube.com/watch?v=armbar');
  await page.getByRole('textbox', { name: 'Technique or drill' }).fill('Armbar from guard');
  await page.getByRole('button', { name: 'Add video' }).click();
  await page.getByRole('textbox', { name: 'Video link' }).fill('https://www.facebook.com/watch/kneeslice');
  await page.getByRole('textbox', { name: 'Technique or drill' }).fill('Knee slice pass');
  await page.getByRole('button', { name: 'Add video' }).click();

  const videos = page.getByRole('region', { name: 'Video Library' });
  const armbar = videos.getByRole('link', { name: 'Armbar from guard' });
  await expect(armbar).toHaveAttribute('href', 'https://www.youtube.com/watch?v=armbar');
  await expect(armbar).toHaveAttribute('target', '_blank');
  await expect(videos.getByRole('link', { name: 'Knee slice pass' })).toHaveAttribute('target', '_blank');
  await expect(videos.getByRole('textbox', { name: 'Notes for Armbar from guard' })).toHaveValue('');
  await videos.getByRole('textbox', { name: 'Notes for Armbar from guard' }).fill('long grip');
  await videos.getByRole('textbox', { name: 'Notes for Armbar from guard' }).blur();

  await page.getByRole('textbox', { name: 'Search videos' }).fill('knee slice');
  await expect(videos.getByRole('link', { name: 'Knee slice pass' })).toBeVisible();
  await expect(videos.getByRole('link', { name: 'Armbar from guard' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search videos' }).fill('long grip');
  await expect(videos.getByRole('link', { name: 'Armbar from guard' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search videos' }).fill('facebook.com/watch');
  await expect(videos.getByRole('link', { name: 'Knee slice pass' })).toBeVisible();
  await expect(videos.getByRole('link', { name: 'Armbar from guard' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search videos' }).fill('');
  await page.screenshot({ path: '/opt/cursor/artifacts/videos-page-390.png', fullPage: true });

  await page.getByRole('button', { name: 'Edit Armbar from guard' }).click();
  await page.getByRole('textbox', { name: 'Edit technique for Armbar from guard' }).fill('Armbar finish');
  await page.getByRole('textbox', { name: 'Edit link for Armbar from guard' }).fill('https://youtu.be/armbar-finish');
  await page.getByRole('button', { name: 'Save video changes' }).click();
  await expect(videos.getByRole('link', { name: 'Armbar finish' })).toHaveAttribute('href', 'https://youtu.be/armbar-finish');
  await expect(videos.getByRole('textbox', { name: 'Notes for Armbar finish' })).toHaveValue('long grip');
  await page.getByRole('button', { name: 'Edit Armbar finish' }).click();
  await page.getByRole('textbox', { name: 'Edit technique for Armbar finish' }).fill('Should not stick');
  await page.getByRole('button', { name: 'Cancel video edit' }).click();
  await expect(videos.getByRole('link', { name: 'Armbar finish' })).toBeVisible();
  await expect(videos.getByText('Should not stick')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('link', { name: 'Armbar finish' })).toHaveAttribute('href', 'https://youtu.be/armbar-finish');
  await expect(page.getByRole('textbox', { name: 'Notes for Armbar finish' })).toHaveValue('long grip');
  await expect(page.getByRole('link', { name: 'Knee slice pass' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete Knee slice pass' }).click();
  await expect(page.getByRole('group', { name: 'Delete Knee slice pass' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep video' }).click();
  await expect(page.getByRole('link', { name: 'Knee slice pass' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Knee slice pass' }).click();
  await page.getByRole('button', { name: 'Confirm delete Knee slice pass' }).click();
  await expect(page.getByRole('link', { name: 'Knee slice pass' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Armbar finish' })).toBeVisible();

  await page.getByRole('link', { name: 'Back. Hold for Home.' }).click();
  await page.getByRole('link', { name: 'Back. Hold for Home.' }).click();
  await page.getByRole('link', { name: 'Coach & Academy', exact: true }).click();
  await page.getByRole('link', { name: 'Make a file for my coach', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Make a file for my coach' }).click(),
  ]);
  const sent = await readFile(await download.path(), 'utf8');
  const packet = JSON.parse(sent) as { clips?: { description: string; url: string; note: string }[] };
  expect(packet.clips).toEqual([
    expect.objectContaining({
      description: 'Armbar finish',
      url: 'https://youtu.be/armbar-finish',
      note: 'long grip',
    }),
  ]);

  await page.goto('/student/journal?student=1');
  await page.getByRole('textbox', { name: 'Drill notes' }).fill('still writes a card');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByRole('status')).toHaveText('Entry saved');
  await expect(page.getByRole('link', { name: 'See saved card', exact: true })).toBeVisible();
  await page.goto('/student/videos?student=1');
  await expect(page.getByRole('link', { name: 'Armbar finish' })).toBeVisible();
});

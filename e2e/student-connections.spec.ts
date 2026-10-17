import { expect, test } from '@playwright/test';
import QRCode from 'qrcode';
import { academyPathway, academyPathwayUrl } from '../src/lib/academyPathway.ts';

test('film a move, connections, backup, and print stay beside the link library', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/videos?student=1');
  await expect(page.getByRole('heading', { name: 'Video Library' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Film a move' })).toBeVisible();
  const record = page.locator('#student-film-record');
  await expect(record).toHaveAttribute('accept', 'video/*');
  await expect(record).toHaveAttribute('capture', 'environment');
  const library = page.locator('#student-film-library');
  await expect(library).toHaveAttribute('accept', 'video/*');
  await expect(library).not.toHaveAttribute('capture', 'environment');

  await page.getByRole('textbox', { name: 'Video link' }).fill('https://www.youtube.com/watch?v=armbar');
  await page.getByRole('textbox', { name: 'Technique or drill' }).fill('Armbar from guard');
  await page.getByRole('button', { name: 'Add video' }).click();
  await expect(page.getByRole('link', { name: 'Armbar from guard' })).toHaveAttribute('target', '_blank');

  await library.setInputFiles({
    name: 'coach.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from('webm-bytes'),
  });
  await page.getByRole('textbox', { name: 'Filmed technique or title' }).fill('Knee slice pass');
  await page.getByRole('button', { name: 'Save filmed video' }).click();
  await expect(page.getByRole('heading', { name: /Knee slice pass/ })).toBeVisible();
  await page.getByRole('button', { name: /Play .*Knee slice pass/ }).click();
  await expect(page.getByRole('region', { name: 'Video Library' }).locator('video').last()).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/student-film-library.png', fullPage: true });

  await page.goto('/student?student=1');
  const academyHub = page.getByRole('link', { name: 'Connect to my academy', exact: true });
  const belt = page.getByRole('link', { name: 'Belt progress', exact: true });
  const libraryLink = page.getByRole('link', { name: 'Video Library', exact: true });
  const calendar = page.getByRole('link', { name: 'Calendar', exact: true });
  await expect(academyHub).toBeVisible();
  const academyBox = await academyHub.boundingBox();
  const beltBox = await belt.boundingBox();
  const libraryBox = await libraryLink.boundingBox();
  const calendarBox = await calendar.boundingBox();
  expect(libraryBox && calendarBox && beltBox && academyBox).toBeTruthy();
  expect(libraryBox!.y).toBeGreaterThan(calendarBox!.y);
  expect(libraryBox!.y).toBeLessThan(beltBox!.y);
  expect(academyBox!.y).toBeGreaterThan(beltBox!.y);
  await page.screenshot({ path: '/opt/cursor/artifacts/student-hub-academy.png', fullPage: true });
  await academyHub.click();
  await expect(page.getByRole('heading', { name: 'Connect to my academy' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan academy QR' })).toBeVisible();
  const photo = page.locator('#academy-qr-photo');
  await expect(photo).toHaveAttribute('accept', 'image/*');
  await expect(photo).toHaveAttribute('capture', 'environment');
  const pathway = academyPathway({
    provider: 'googleDrive',
    folderId: 'academyFolder123',
    folderName: 'GB Ellijay',
    gymName: 'GB Ellijay',
  });
  const academyUrl = academyPathwayUrl(pathway!, 'http://127.0.0.1:5174');
  await photo.setInputFiles({
    name: 'academy-qr.png',
    mimeType: 'image/png',
    buffer: await QRCode.toBuffer(academyUrl),
  });
  await expect(page.getByRole('button', { name: 'Sign in to Google Drive' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Students do not pay');
  await page.screenshot({ path: '/opt/cursor/artifacts/student-academy-scan.png', fullPage: true });

  await page.goto('/student?student=1');
  await page.locator('summary', { hasText: 'Menu' }).click();
  await page.getByRole('link', { name: 'Connections', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect to my academy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My own drive' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Export and print' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Import from coach' })).toBeVisible();
  await expect(page.getByText('Google Photos — coming later')).toBeVisible();
  await expect(page.getByText('iCloud — coming later')).toBeVisible();

  await page.getByRole('textbox', { name: 'Academy link' }).fill('https://drive.google.com/drive/folders/academyFolder123');
  await page.getByRole('button', { name: 'Use this academy link' }).click();
  await expect(page.getByRole('button', { name: 'Sign in to Google Drive' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Students do not pay');

  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.getByRole('button', { name: 'Back up my journal' }).click();
  await expect.poll(() => downloads.length).toBeGreaterThanOrEqual(4);
  expect(downloads.some((name) => name.endsWith('.json'))).toBeTruthy();
  expect(downloads.some((name) => name.endsWith('.csv'))).toBeTruthy();
  expect(downloads.filter((name) => name.endsWith('.pdf')).length).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: '/opt/cursor/artifacts/student-connections.png', fullPage: true });

  await page.getByRole('button', { name: 'Clear journal on this phone' }).click();
  await expect(page.getByText('A backup is recommended before clearing data on this phone.')).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/student-clear-warning.png', fullPage: true });
  await page.getByRole('button', { name: 'Cancel clear' }).click();

  await page.getByRole('link', { name: 'Print progress report' }).click();
  await expect(page.getByRole('article', { name: 'Progress report' })).toContainText('Rank and stripes');
  await expect(page.getByRole('article', { name: 'Progress report' })).toContainText('Journal summary');
  await page.screenshot({ path: '/opt/cursor/artifacts/student-progress-report.png', fullPage: true });

  await page.goto('/student/videos?student=1');
  await expect(page.getByRole('link', { name: 'Armbar from guard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Knee slice pass/ })).toBeVisible();
});

test('Pro shows an academy pathway when a drive folder is connected', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem(
      'matboard.pro.googleDriveFolder.v1',
      JSON.stringify({ folderId: 'academyFolder123', folderName: 'GB Ellijay', email: 'coach@gym.test' }),
    );
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pro');
  const panel = page.getByRole('region', { name: 'Academy folder pathway' });
  await expect(panel.getByRole('heading', { name: 'Connect to my academy' })).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Google Drive academy link' })).toHaveValue(/\/student\/connections\?academy=/);
  await expect(panel.getByRole('img', { name: 'QR for the Google Drive academy folder' })).toBeVisible();
  await expect(panel.getByText('Students do not pay')).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/pro-academy-pathway.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/coach-unlimited');
  const entry = page.getByRole('link', { name: 'Connect to my academy', exact: true });
  await expect(entry).toBeVisible();
  const roster = page.getByRole('link', { name: 'Competitor Roster', exact: true });
  const entryBox = await entry.boundingBox();
  const rosterBox = await roster.boundingBox();
  expect(entryBox && rosterBox).toBeTruthy();
  expect(entryBox!.y).toBeGreaterThan(rosterBox!.y);
  await page.screenshot({ path: '/opt/cursor/artifacts/coach-unlimited-academy-button.png', fullPage: true });
  await entry.click();
  await expect(page).toHaveURL(/\/coach-unlimited\/academy$/);
  const opened = page.getByRole('region', { name: 'Academy folder pathway' });
  await expect(opened.getByRole('heading', { name: 'Connect to my academy' })).toBeVisible();
  await expect(opened.getByRole('textbox', { name: 'Google Drive academy link' })).toHaveValue(/\/student\/connections\?academy=/);
  await expect(opened.getByRole('img', { name: 'QR for the Google Drive academy folder' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back. Hold for Home.' })).toHaveAttribute('href', '/coach-unlimited');
  await page.screenshot({ path: '/opt/cursor/artifacts/coach-academy-pathway.png', fullPage: true });
});

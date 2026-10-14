import { expect, test, type Page, type Route } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function dateKey(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function folderHeading(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return `${key} (${WEEKDAYS[new Date(year, (month || 1) - 1, day || 1).getDay()]})`;
}

type DriveRow = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appProperties?: Record<string, string>;
  createdTime?: string;
  size?: string;
  thumbnailLink?: string;
  videoMediaMetadata?: { durationMillis?: string };
};

test.use({ viewport: { width: 390, height: 844 } });

test('Daily Lesson Plan groups Drive videos into date folders', async ({ page }) => {
  const today = dateKey(0);
  const yesterday = dateKey(-1);
  const longTitle = 'Armbar from guard with a series name that must stay on one line';
  const files: DriveRow[] = [];
  for (let index = 0; index < 6; index += 1) {
    const created = new Date();
    created.setHours(15, index, 0, 0);
    files.push({
      id: `today-${index + 1}`,
      name: `advantage-video-${today}-1000015841-0f018a78-${index}.mp4`,
      mimeType: 'video/mp4',
      parents: ['gym-folder'],
      createdTime: created.toISOString(),
      size: index === 1 ? '18874368' : '2048',
      thumbnailLink: index === 0 ? 'https://lh3.googleusercontent.com/thumb' : undefined,
      videoMediaMetadata: index === 0 ? { durationMillis: '83000' } : undefined,
      appProperties:
        index === 0
          ? { lessonTitle: longTitle, classDesignation: 'GB1', localClipId: 'clip-armbar', date: today }
          : { date: today },
    });
  }
  files.push(
    {
      id: 'yesterday-1',
      name: `advantage-video-${yesterday}-1000015841-0f018a78-old.mp4`,
      mimeType: 'video/mp4',
      parents: ['gym-folder'],
      createdTime: new Date(Date.now() - 86_400_000).toISOString(),
      appProperties: { date: yesterday },
    },
    {
      id: 'yesterday-2',
      name: `advantage-video-${yesterday}-1000015841-0f018a78-older.mp4`,
      mimeType: 'video/mp4',
      parents: ['gym-folder'],
      appProperties: { date: yesterday },
    },
  );

  await page.addInitScript((stored) => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem(
      'matboard.pro.googleDriveFolder.v1',
      JSON.stringify({ folderId: 'gym-folder', folderName: 'Advantage', email: 'owner@gym.test' }),
    );
    sessionStorage.setItem('matboard.pro.googleDriveToken', JSON.stringify(stored));
  }, { accessToken: 'drive-token', expiresAt: Date.now() + 3_600_000, scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly' });

  await mockDrive(page, files);
  await page.route('https://lh3.googleusercontent.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  );

  await page.goto('/notes?plan=unlimited');

  await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yesterday', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Classes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: "Download today's videos" })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Open my Drive' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open a class from Google Drive' })).toBeVisible();
  await expect(page.getByText('Search plans')).toBeVisible();
  await expect(page.getByText('Calendar')).toBeVisible();

  const todayHeading = folderHeading(today);
  const yesterdayHeading = folderHeading(yesterday);
  const todayFolder = page.getByRole('button', { name: new RegExp(todayHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  const yesterdayFolder = page.getByRole('button', { name: new RegExp(yesterdayHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  await expect(todayFolder).toBeVisible();
  await expect(yesterdayFolder).toBeVisible();
  await expect(todayFolder).toHaveAttribute('aria-expanded', 'true');
  await expect(yesterdayFolder).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('advantage-video-')).toHaveCount(0);

  const label = page.locator('.drive-videos__label').first();
  await expect(label).toContainText(longTitle);
  await expect(label).toHaveAttribute('title', new RegExp(`advantage-video-${today}`));
  await expect(page.getByText('1:23')).toBeVisible();
  await expect(page.getByText('18 MB')).toBeVisible();
  await expect(page.locator('.drive-videos img')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Show more' })).toBeVisible();
  await expect(page.getByText('Clip 6')).toHaveCount(0);

  const overflow = await label.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      nowrap: style.whiteSpace === 'nowrap',
      clipped: element.scrollWidth > element.clientWidth + 1,
    };
  });
  expect(overflow.nowrap).toBe(true);
  expect(overflow.clipped).toBe(true);

  const onBackground = await todayFolder.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(onBackground).toBe('rgb(0, 78, 186)');
  const renameBackground = await page
    .locator('.drive-videos__rename')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(renameBackground).toBe('rgba(0, 0, 0, 0)');

  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  await page.locator('.drive-videos').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: '/opt/cursor/artifacts/drive-video-list-mobile.png',
    fullPage: false,
  });
  await page.locator('.drive-videos').screenshot({
    path: '/opt/cursor/artifacts/drive-video-folders-mobile.png',
  });

  await page.getByRole('button', { name: 'Show more' }).click();
  await expect(page.getByText(/Clip 6/)).toBeVisible();
  await page.locator('.drive-videos').screenshot({
    path: '/opt/cursor/artifacts/drive-video-show-more-mobile.png',
  });

  await page.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await expect(yesterdayFolder).toHaveAttribute('aria-expanded', 'true');
  await expect(todayFolder).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(todayFolder).toHaveAttribute('aria-expanded', 'true');

  const row = page.locator('.drive-videos__row', { hasText: longTitle });
  await row.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel(`New name for ${longTitle}`, { exact: false }).fill('Guard pass');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Renamed in Google Drive.')).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(longTitle) })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(longTitle) }).click();
  await expect(page.locator('.drive-videos__full')).toHaveText('Guard pass.mp4');
  expect(files.find((file) => file.id === 'today-1')?.name).toBe('Guard pass.mp4');
  expect(files.find((file) => file.id === 'today-1')?.appProperties?.localClipId).toBe('clip-armbar');
  await page.locator('.drive-videos').screenshot({
    path: '/opt/cursor/artifacts/drive-video-rename-mobile.png',
  });
});

async function mockDrive(page: Page, files: DriveRow[]) {
  const handle = async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (method === 'PATCH' && url.includes('/drive/v3/files/')) {
      const id = decodeURIComponent(url.split('/files/')[1]?.split('?')[0] ?? '');
      const file = files.find((item) => item.id === id);
      const body = JSON.parse(request.postData() ?? '{}') as { name?: string };
      if (file && body.name) file.name = body.name;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id, name: file?.name ?? body.name }),
      });
      return;
    }
    if (method === 'GET' && url.includes('/drive/v3/files')) {
      const query = new URL(url).searchParams.get('q') ?? '';
      const parents = [...query.matchAll(/'([^']+)' in parents/g)].map((match) => match[1]);
      const listed = files.filter((file) => parents.length === 0 || parents.some((id) => file.parents.includes(id)));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ files: listed }),
      });
      return;
    }
    if (url.includes('alt=media')) {
      await route.fulfill({ status: 200, body: 'video', contentType: 'video/mp4' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  };
  await page.route('https://www.googleapis.com/**', handle);
}

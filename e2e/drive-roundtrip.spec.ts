import { expect, test, type Page, type Route } from '@playwright/test';

const FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const BOTH_SCOPES = `${FILE_SCOPE} ${READ_SCOPE}`;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type DriveRow = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appProperties?: Record<string, string>;
  content?: string;
  bytes?: Buffer;
};

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

async function seedDrive(page: Page, token: { accessToken: string; expiresAt: number; scope?: string }) {
  await page.addInitScript((stored) => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('matboard.pro.googleClientId', 'test-client.apps.googleusercontent.com');
    localStorage.setItem(
      'matboard.pro.googleDriveFolder.v1',
      JSON.stringify({ folderId: 'gym-folder', folderName: 'GBLJ Instructors', email: 'owner@gym.test' }),
    );
    sessionStorage.setItem('matboard.pro.googleDriveToken', JSON.stringify(stored));
  }, token);
}

function parentIds(query: string): string[] {
  return [...query.matchAll(/'([^']+)' in parents/g)].map((match) => match[1]);
}

function matches(file: DriveRow, query: string): boolean {
  const name = query.match(/name='((?:\\'|[^'])*)'/);
  if (name && file.name !== name[1].replace(/\\'/g, "'")) return false;
  const mime = query.match(/mimeType='([^']*)'/);
  if (mime && file.mimeType !== mime[1]) return false;
  const parents = parentIds(query);
  if (parents.length && !parents.some((id) => file.parents.includes(id))) return false;
  const prop = query.match(/appProperties has \{ key='([^']+)' and value='([^']*)' \}/);
  if (prop && file.appProperties?.[prop[1]] !== prop[2]) return false;
  return true;
}

function lessonBody(raw: string): string | null {
  const key = raw.indexOf('"lesson-plan"');
  if (key < 0) return null;
  const start = raw.lastIndexOf('{', key);
  if (start < 0) return null;
  let depth = 0;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, index + 1);
    }
  }
  return null;
}

async function mockDrive(page: Page, seeded: DriveRow[] = []) {
  const files = [...seeded];
  let seq = seeded.length;
  const nextId = () => {
    seq += 1;
    return `file-${seq}`;
  };
  const handle = async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    try {
    if (method === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PATCH, PUT, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type, x-upload-content-type, x-upload-content-length',
          'access-control-expose-headers': 'Location',
        },
      });
      return;
    }
    if (url.includes('alt=media')) {
      const id = decodeURIComponent(url.split('/files/')[1]?.split('?')[0] ?? '');
      const file = files.find((item) => item.id === id);
      if (!file) {
        await route.fulfill({ status: 404, body: 'missing' });
        return;
      }
      await route.fulfill({
        status: 200,
        body: file.bytes ?? file.content ?? '',
        headers: { 'content-type': file.mimeType || 'application/octet-stream' },
      });
      return;
    }
    if (url.includes('/revisions')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revisions: [{ id: '1' }] }) });
      return;
    }
    if (url.includes('uploadType=resumable') && method === 'POST') {
      const metadata = JSON.parse(request.postData() ?? '{}') as {
        name?: string;
        mimeType?: string;
        parents?: string[];
        appProperties?: Record<string, string>;
      };
      const id = nextId();
      files.push({
        id,
        name: metadata.name ?? 'video.mp4',
        mimeType: metadata.mimeType ?? 'video/mp4',
        parents: metadata.parents ?? [],
        appProperties: metadata.appProperties,
      });
      await route.fulfill({
        status: 200,
        body: '',
        headers: {
          location: `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=resumable`,
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'Location',
        },
      });
      return;
    }
    if (method === 'PUT' && url.includes('uploadType=resumable')) {
      const id = decodeURIComponent(url.split('/files/')[1]?.split('?')[0] ?? '');
      const file = files.find((item) => item.id === id);
      const bytes = request.postDataBuffer();
      if (file && bytes) file.bytes = bytes;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id }) });
      return;
    }
    if (url.includes('uploadType=multipart') || (method === 'POST' && url.includes('/upload/'))) {
      const raw = request.postData() ?? '';
      const content = lessonBody(raw) ?? '';
      const name = raw.match(/advantage-lesson-[^"\\]+\.json/)?.[0] ?? `advantage-lesson-${nextId()}.json`;
      const existing = url.includes('/files/') ? decodeURIComponent(url.split('/files/')[1]?.split('?')[0] ?? '') : '';
      const current = files.find((item) => item.id === existing);
      if (current) {
        current.content = content;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: current.id }) });
        return;
      }
      const id = nextId();
      const parent = files.find((item) => item.name === 'lesson-plans')?.id ?? 'gym-folder';
      files.push({
        id,
        name,
        mimeType: 'application/json',
        parents: [parent],
        appProperties: { advantage: 'lesson', date: todayKey() },
        content,
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id }) });
      return;
    }
    if (method === 'POST' && url.includes('/drive/v3/files')) {
      const metadata = JSON.parse(request.postData() ?? '{}') as {
        name?: string;
        mimeType?: string;
        parents?: string[];
        appProperties?: Record<string, string>;
      };
      const id = nextId();
      files.push({
        id,
        name: metadata.name ?? 'folder',
        mimeType: metadata.mimeType ?? 'application/vnd.google-apps.folder',
        parents: metadata.parents ?? [],
        appProperties: metadata.appProperties,
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id, name: metadata.name ?? 'folder' }),
      });
      return;
    }
    if (method === 'GET' && url.includes('/drive/v3/files')) {
      const query = new URL(url).searchParams.get('q') ?? '';
      const listed = files.filter((file) => matches(file, query));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          files: listed.map((file) => ({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            appProperties: file.appProperties,
          })),
        }),
      });
      return;
    }
    if (url.includes('tokeninfo')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ scope: BOTH_SCOPES }),
      });
      return;
    }
    await route.fulfill({ status: 500, contentType: 'text/plain', body: `unhandled ${method} ${url}` });
    } catch (error) {
      await route.fulfill({ status: 500, contentType: 'text/plain', body: String(error) }).catch(() => undefined);
    }
  };
  await page.route('https://www.googleapis.com/**', handle);
  await page.route('https://oauth2.googleapis.com/**', handle);
  return files;
}

function installGoogleSignIn(page: Page) {
  return page.evaluate((scope) => {
    const google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            callback: (response: { access_token: string; expires_in: number; scope: string }) => void;
          }) => ({
            requestAccessToken: () => {
              config.callback({ access_token: 'fresh-token', expires_in: 3600, scope });
            },
          }),
        },
      },
    };
    (window as unknown as { google: typeof google }).google = google;
  }, BOTH_SCOPES);
}

test('a connected Drive card browses folders, selects all, and saves gallery copies', async ({ page }) => {
  await seedDrive(page, { accessToken: 'test-token', expiresAt: Date.now() + 3_600_000, scope: BOTH_SCOPES });
  await mockDrive(page, [
    {
      id: 'promo',
      name: 'Promotions',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['gym-folder'],
    },
    {
      id: 'belt',
      name: 'Belt.png',
      mimeType: 'image/png',
      parents: ['promo'],
      bytes: PNG,
    },
    {
      id: 'gi',
      name: 'Gi.png',
      mimeType: 'image/png',
      parents: ['promo'],
      bytes: PNG,
    },
    {
      id: 'drill',
      name: 'Drill.mp4',
      mimeType: 'video/mp4',
      parents: ['promo'],
      bytes: Buffer.from('drill-bytes'),
    },
  ]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/coach-unlimited');
  const card = page.locator('article.plan-card').filter({ hasText: 'GBLJ Instructors' });
  await expect(card.getByRole('link', { name: 'Class history', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Change folder', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Disconnect Google Drive', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Browse photos and videos', exact: true }).click();

  const picker = page.getByRole('dialog', { name: 'Pick from Google Drive' });
  await expect(picker.getByRole('button', { name: 'Promotions', exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Promotions', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Belt.png', exact: true })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Drill.mp4', exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Promotions', exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Promotions', exact: true }).click();

  await picker.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Done · 3 selected', exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
  await picker.getByRole('button', { name: 'Belt.png', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Done · 1 selected', exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Select all', exact: true }).click();
  await picker.getByRole('button', { name: 'Done · 3 selected', exact: true }).click();
  await expect(card.getByText(/3 files are in the Media Console gallery/)).toBeVisible();
  await expect(card.getByText(/Advantage does not host them/)).toBeVisible();
});

test('an expired or narrow Drive sign-in asks to reconnect, then browse returns', async ({ page }) => {
  await seedDrive(page, { accessToken: 'old-token', expiresAt: Date.now() - 5_000, scope: BOTH_SCOPES });
  await mockDrive(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/coach-unlimited');
  const card = page.locator('article.plan-card').filter({ hasText: 'GBLJ Instructors' });
  await expect(card.getByRole('button', { name: 'Reconnect', exact: true })).toBeVisible();
  await expect(card.getByText('Sign in to Google Drive again to browse folders')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Browse photos and videos', exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Change folder', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Disconnect Google Drive', exact: true })).toBeVisible();

  await installGoogleSignIn(page);
  await card.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Browse photos and videos', exact: true })).toBeVisible();

  await card.getByRole('button', { name: 'Change folder', exact: true }).click();
  await expect(card.getByText('GBLJ Instructors')).toBeVisible();
  await expect(card.getByText('This Google Drive account does not have any folders yet.')).toBeVisible();

  await card.getByRole('button', { name: 'Disconnect Google Drive', exact: true }).click();
  await expect(card.getByText('Lesson plans, rosters, and journals on this device stay.')).toBeVisible();
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card.getByText('GBLJ Instructors')).toBeVisible();

  await card.getByRole('button', { name: 'Disconnect Google Drive', exact: true }).click();
  await card.getByRole('button', { name: 'Disconnect Google Drive', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Google Drive', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'OneDrive', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Google Photos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /iCloud/i })).toHaveCount(0);
  await expect(page.getByText('Coming for launch', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Disconnect Google Drive', exact: true })).toHaveCount(0);
});

test('a sign-in that cannot list folders asks to reconnect for the approved read scope', async ({ page }) => {
  await seedDrive(page, { accessToken: 'file-only', expiresAt: Date.now() + 3_600_000, scope: FILE_SCOPE });
  await mockDrive(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/coach-unlimited');
  const card = page.locator('article.plan-card').filter({ hasText: 'GBLJ Instructors' });
  await expect(card.getByText('listing folders needs the read access already approved')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Browse photos and videos', exact: true })).toHaveCount(0);
  await installGoogleSignIn(page);
  await card.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Browse photos and videos', exact: true })).toBeVisible();
});

test('a lesson and video saved to Drive load back into the Daily Lesson Plan', async ({ page }) => {
  await seedDrive(page, { accessToken: 'test-token', expiresAt: Date.now() + 3_600_000, scope: BOTH_SCOPES });
  const files = await mockDrive(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/techniques');
  const drill = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Technique / Drill 1', exact: true }),
  });
  await drill.getByRole('button', { name: '+ Add video' }).click();
  await page.locator('#techniques-video-library').setInputFiles({
    name: 'KneeCut.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('knee-cut-bytes'),
  });
  await expect(page.getByRole('status').filter({ hasText: /video saved to Google Drive/ })).toBeVisible({
    timeout: 20_000,
  });

  await page.goto('/notes?plan=unlimited');
  await expect(page.getByText('KneeCut.mp4')).toBeVisible();
  await page.evaluate(() => {
    const setValue = (id: string, value: string) => {
      const el = document.getElementById(id);
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        throw new Error(`Missing ${id}`);
      }
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setValue('notes-coach', 'Justin');
    setValue('notes-class', 'GB1');
    setValue('notes-lesson-title', 'Guard passing');
    setValue('notes-class-time', '5:00 PM');
    setValue('notes-intro', 'Start standing');
    const heading = [...document.querySelectorAll('h2')].find((node) => node.textContent === 'Technique / Drill 1');
    const block = heading?.closest('.notes__block');
    const title = block?.querySelector('input');
    const notes = block?.querySelector('textarea');
    if (!title?.id || !notes?.id) throw new Error('Missing technique fields');
    setValue(title.id, 'Knee cut');
    setValue(notes.id, 'Keep the knee heavy');
  });
  await expect(page.getByRole('status').filter({ hasText: 'Saved to Google Drive' })).toBeVisible({
    timeout: 20_000,
  });

  const saved = files.find((file) => file.name.startsWith('advantage-lesson-') && file.content?.includes('Knee cut'));
  expect(saved?.content ?? '').toContain('"version": 1');
  expect(saved?.content ?? '').toContain('"advantage": "lesson-plan"');
  expect(saved?.content ?? '').toContain('Keep the knee heavy');

  await page.evaluate(async () => {
    localStorage.removeItem('matboard.coach.trainingNotes.v1');
    localStorage.removeItem('matboard.techniquePlanDates.v1');
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('matboard-techniques');
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
  await page.goto('/class-history');
  const day = page.locator('section').filter({ hasText: 'Knee cut' });
  await expect(day.getByRole('listitem').filter({ hasText: 'Knee cut' })).toBeVisible();
  await day.getByRole('button', { name: 'Open this class', exact: true }).click();
  await expect(page).toHaveURL(/\/notes\?/);
  await expect(page.getByLabel('Lesson title')).toHaveValue('Guard passing');
  await expect(page.getByLabel('Class designation')).toHaveValue('GB1');
  await expect(page.getByLabel('Intro', { exact: true })).toHaveValue('Start standing');
  const kneeCut = page.locator('.notes__block').filter({
    has: page.getByRole('heading', { name: 'Technique / Drill 1', exact: true }),
  });
  await expect(kneeCut.getByLabel('Title')).toHaveValue('Knee cut');
  await expect(kneeCut.getByLabel('Notes')).toHaveValue('Keep the knee heavy');
  await expect(kneeCut.locator('.notes__video-name')).toContainText(/kneecut/i);
});

test('an older text lesson can be picked from Drive, and Daily Training Videos can pick a Drive video', async ({ page }) => {
  const date = todayKey();
  await seedDrive(page, { accessToken: 'test-token', expiresAt: Date.now() + 3_600_000, scope: BOTH_SCOPES });
  await mockDrive(page, [
    {
      id: 'text-plan',
      name: `advantage-lesson-${date}-justin.txt`,
      mimeType: 'text/plain',
      parents: ['gym-folder'],
      appProperties: { advantage: 'lesson', date },
      content: [
        `date: ${date}`,
        'coach: Justin',
        'title: Tomorrow',
        'class: GB1',
        'time: 6:00 PM',
        'technique: Armbar',
        'notes: Finish on the far shoulder',
        'video: Armbar.mp4 | drive-armbar | technique | 0',
      ].join('\n'),
    },
    {
      id: 'drive-armbar',
      name: 'Armbar.mp4',
      mimeType: 'video/mp4',
      parents: ['gym-folder'],
      bytes: Buffer.from('armbar-bytes'),
    },
  ]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/class-history');
  await page.getByRole('button', { name: 'Pick a lesson from Google Drive', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Pick from Google Drive' });
  await picker.getByRole('button', { name: `advantage-lesson-${date}-justin.txt` }).click();
  await picker.getByRole('button', { name: 'Done · 1 selected', exact: true }).click();
  await expect(page).toHaveURL(/\/notes\?/);
  await expect(page.getByLabel('Lesson title')).toHaveValue('Tomorrow');
  const armbar = page.locator('.notes__block').filter({
    has: page.getByRole('heading', { name: 'Technique / Drill 1', exact: true }),
  });
  await expect(armbar.getByLabel('Title')).toHaveValue('Armbar');
  await expect(armbar.getByLabel('Notes')).toHaveValue('Finish on the far shoulder');
  await expect(page.getByText('Armbar.mp4')).toBeVisible();

  await page.goto('/techniques');
  const drill = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Technique / Drill 2', exact: true }),
  });
  await drill.getByRole('button', { name: '+ Add video' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add video' });
  await expect(sheet.getByRole('button', { name: /Pick from Google Drive/ })).toBeVisible();
  await sheet.getByRole('button', { name: /Pick from Google Drive/ }).click();
  const videos = page.getByRole('dialog', { name: 'Pick from Google Drive' });
  await videos.getByRole('button', { name: 'Armbar.mp4', exact: true }).click();
  await videos.getByRole('button', { name: 'Done · 1 selected', exact: true }).click();
  await expect(drill.getByRole('button', { name: 'Replace', exact: true })).toBeVisible();
});

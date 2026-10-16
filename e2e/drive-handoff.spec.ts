import { expect, test, type Page, type Route } from '@playwright/test';

const COACH_PERMISSIONS = {
  galleryUpload: false,
  dailyLessonPlanAccess: true,
  rosterSubmit: true,
  rosterPull: true,
  downloadTodaysVideos: true,
  uploadForDistribution: true,
  eventsAccess: false,
  proShopAccess: false,
};

type StoredFile = { name: string; text: string };

async function stubGymDrive(page: Page, seeded: StoredFile[] = []) {
  const files = new Map<string, StoredFile>();
  seeded.forEach((file, index) => files.set(`seed-${index}`, file));
  const handle = async (route: Route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes('uploadType=multipart') || (request.method() === 'POST' && url.includes('/upload/'))) {
      const body = request.postData() ?? '';
      const start = body.indexOf('{"version"');
      const end = start < 0 ? -1 : body.indexOf('\r\n--', start);
      const text = start < 0 ? '' : end < 0 ? body.slice(start) : body.slice(start, end);
      const nameMatch = body.match(/advantage-handoff-[^"\\]+\.json/);
      const id = `upload-${files.size}`;
      files.set(id, { name: nameMatch?.[0] ?? `${id}.json`, text });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id, name: nameMatch?.[0] ?? `${id}.json` }),
      });
      return;
    }
    if (url.includes('alt=media')) {
      const id = decodeURIComponent(url.split('/files/')[1]?.split('?')[0] ?? '');
      await route.fulfill({ status: 200, contentType: 'text/plain', body: files.get(id)?.text ?? '' });
      return;
    }
    if (url.includes('/drive/v3/files')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          files: [...files.entries()].map(([id, file]) => ({ id, name: file.name, mimeType: 'text/plain' })),
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  };
  await page.route('https://www.googleapis.com/**', handle);
  return files;
}

async function connectGymDrive(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem(
      'matboard.pro.googleDriveFolder.v1',
      JSON.stringify({ folderId: 'gym-folder', folderName: 'GBLJ Instructors', email: 'owner@gym.test' }),
    );
    sessionStorage.setItem(
      'matboard.pro.googleDriveToken',
      JSON.stringify({ accessToken: 'test-token', expiresAt: Date.now() + 3_600_000 }),
    );
  });
}

test('a locked browser accepts an invite from the gym folder', async ({ page }) => {
  const seat = {
    id: 'seat-cross',
    gymId: 'gym-e',
    email: 'coach@gym.test',
    status: 'invited',
    issuedAt: 1,
    presetId: 'coach',
    permissions: COACH_PERMISSIONS,
    inviteToken: 'cross-device-token',
  };
  await stubGymDrive(page, [
    {
      name: 'advantage-handoff-invite-cross-device-token-1.json',
      text: JSON.stringify({ version: 1, kind: 'invite', updatedAt: 1, seat }),
    },
  ]);
  await page.addInitScript(() => {
    localStorage.removeItem('advantage.proUnlocked');
    localStorage.removeItem('advantage.coachUnlocked');
    localStorage.removeItem('matboard.pro.instructorSeats.v1');
    localStorage.removeItem('matboard.pro.instructorSeatSession.v1');
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/instructors?invite=cross-device-token');
  await expect(page).not.toHaveURL(/coming-soon/);
  const connect = page.getByRole('button', { name: 'Connect Drive to send to your coach/instructor' });
  await expect(connect).toBeVisible();
  await connect.click();
  const drive = page.getByRole('button', { name: 'Google Drive', exact: true });
  await expect(drive).toBeVisible();
  if (await drive.isEnabled()) await drive.click();
  else await expect(page.getByText('Google Drive is not available on this build yet')).toBeVisible();
  await expect(connect).toHaveCSS('background-color', 'rgb(252, 192, 0)');
  const locked = await page.evaluate(() => ({
    pro: localStorage.getItem('advantage.proUnlocked'),
    coach: localStorage.getItem('advantage.coachUnlocked'),
  }));
  expect(locked.pro).toBeNull();
  expect(locked.coach).toBeNull();
  await page.screenshot({ path: '/opt/cursor/artifacts/drive-handoff-desktop.png' });
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/instructors?invite=cross-device-token');
  await connect.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/opt/cursor/artifacts/drive-handoff-phone.png' });

  await page.setViewportSize({ width: 1280, height: 800 });
  await connectGymDrive(page);
  await page.reload();
  await expect(page).not.toHaveURL(/coming-soon/);
  await page.getByRole('button', { name: 'Check the gym folder' }).click();
  await expect(page.getByText('Signed in as coach@gym.test')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  const unlocked = await page.evaluate(() => ({
    pro: localStorage.getItem('advantage.proUnlocked'),
    coach: localStorage.getItem('advantage.coachUnlocked'),
  }));
  expect(unlocked.pro).toBeNull();
  expect(unlocked.coach).toBeNull();
});

test('the same browser still accepts an invite with Coach locked', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('advantage.proUnlocked');
    localStorage.removeItem('advantage.coachUnlocked');
    localStorage.setItem(
      'matboard.pro.instructorSeats.v1',
      JSON.stringify({
        version: 1,
        deviceGymId: 'gym-e',
        seats: [
          {
            id: 'seat-same',
            gymId: 'gym-e',
            email: 'coach@gym.test',
            status: 'invited',
            issuedAt: 1,
            presetId: 'coach',
            permissions: {
              galleryUpload: false,
              dailyLessonPlanAccess: true,
              rosterSubmit: true,
              rosterPull: true,
              downloadTodaysVideos: true,
              uploadForDistribution: true,
              eventsAccess: false,
              proShopAccess: false,
            },
            inviteToken: 'same-device-token',
          },
        ],
      }),
    );
  });
  await page.goto('/instructors?invite=same-device-token');
  await expect(page.getByText('Signed in as coach@gym.test')).toBeVisible();
  await expect(page).not.toHaveURL(/coming-soon/);
  const unlocks = await page.evaluate(() => ({
    pro: localStorage.getItem('advantage.proUnlocked'),
    coach: localStorage.getItem('advantage.coachUnlocked'),
  }));
  expect(unlocks.pro).toBeNull();
  expect(unlocks.coach).toBeNull();
  await page.getByRole('button', { name: 'Sign out of seat' }).click();
  await expect(page.getByText('Signed out')).toBeVisible();
});

test('the owner issues an invite and the coach submits through the gym folder', async ({ page }) => {
  const uploads: string[] = [];
  await page.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes('uploadType=multipart')) {
      uploads.push(request.postData() ?? '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'file-1', name: 'advantage-handoff.json' }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.removeItem('advantage.coachUnlocked');
    localStorage.removeItem('matboard.pro.instructorSeats.v1');
    localStorage.removeItem('matboard.pro.instructorSeatSession.v1');
  });
  await page.goto('/instructors');
  await page.getByLabel('Instructor email').fill('coach@gym.test');
  await page.getByRole('radio', { name: 'Coach, Coach Unlimited. Lesson plans, daily videos, and uploads' }).click();
  const selected = page.getByRole('radio', { name: 'Coach, Coach Unlimited. Lesson plans, daily videos, and uploads' });
  await expect(selected).toHaveClass(/binder-pick--on/);
  await page.getByRole('button', { name: 'Issue invite' }).click();
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toBeVisible();
  await page.locator('form').getByRole('button', { name: 'Copy invite link' }).click();
  await page.getByRole('listitem').getByRole('button', { name: 'Copy invite link' }).click();
  await page.getByRole('button', { name: 'Connect Drive to send to your coach/instructor' }).click();
  await expect(page.getByRole('button', { name: 'Google Drive', exact: true })).toBeVisible();

  await connectGymDrive(page);
  await page.reload();
  await page.getByLabel('Instructor email').fill('second@gym.test');
  await page.getByRole('button', { name: 'Issue invite' }).click();
  await expect(page.getByText('Saved in the gym Google Drive folder.')).toBeVisible();
  expect(uploads.some((body) => body.includes('"kind":"invite"') && !/blob|base64/.test(body))).toBe(true);

  await page.goto('/notes?plan=unlimited');
  await page.locator('#notes-coach').fill('Alex');
  await page.locator('#notes-intro').fill('Passing series.');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Sent for review.')).toBeVisible();
  await expect(page.getByText('Saved in the gym Google Drive folder.')).toBeVisible();
  expect(uploads.some((body) => body.includes('"kind":"review"') && body.includes('Passing series.') && !body.includes('blob'))).toBe(true);
  const check = page.getByRole('button', { name: 'Check the gym folder' });
  await check.click();
  await expect(page.getByText('Nothing new in the gym Google Drive folder.')).toBeVisible();
  await expect(check).toHaveCSS('background-color', 'rgb(0, 78, 186)');
  await page.getByRole('button', { name: 'Upload for instructor distribution' }).click();
  await expect(page.getByText('Saved on this phone.')).toBeVisible();
});

test('the review inbox reads a submission from the gym folder', async ({ page }) => {
  const plan = {
    version: 1,
    id: 'plan-e',
    coachName: 'Alex',
    classDesignation: 'GB1',
    classTime: '5:00 PM',
    intro: 'Passing series.',
    introExpected: '',
    warmupNote: '',
    warmupExpected: '',
    techniques: [],
    specificNote: '',
    specificExpected: '',
    cooldownNote: '',
    cooldownExpected: '',
    closing: 'Bow.',
  };
  const submission = {
    id: 'review-e-1',
    revisionId: 'draft:2026-10-09:alex:plan-e',
    dateKey: '2026-10-09',
    coachName: 'Alex',
    planId: 'plan-e',
    planLabel: 'GB1 5:00 PM',
    intro: 'Passing series.',
    closing: 'Bow.',
    photoId: 'photo-e',
    photoName: 'class.jpg',
    submittedAt: 10,
    status: 'pending',
    instructorNote: '',
    plan,
  };
  await stubGymDrive(page, [
    {
      name: 'advantage-handoff-review-review-e-1-10.json',
      text: JSON.stringify({ version: 1, kind: 'review', updatedAt: 10, submission }),
    },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.removeItem('advantage.coachUnlocked');
    localStorage.removeItem('matboard.reviewInbox.v1');
    localStorage.setItem(
      'matboard.pro.googleDriveFolder.v1',
      JSON.stringify({ folderId: 'gym-folder', folderName: 'GBLJ Instructors', email: 'owner@gym.test' }),
    );
    sessionStorage.setItem(
      'matboard.pro.googleDriveToken',
      JSON.stringify({ accessToken: 'test-token', expiresAt: Date.now() + 3_600_000 }),
    );
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/review');
  const check = page.getByRole('button', { name: 'Check the gym folder' });
  await check.click();
  await expect(page.getByRole('link', { name: /Alex · GB1 5:00 PM · Waiting for review/ })).toBeVisible();
  await expect(check).toHaveCSS('background-color', 'rgb(0, 78, 186)');
  await page.getByRole('link', { name: /Alex · GB1 5:00 PM · Waiting for review/ }).click();
  await expect(page.getByRole('article', { name: 'This submission' }).getByText('Passing series.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('article', { name: 'This submission' }).getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCSS('background-color', 'rgb(0, 78, 186)');
  await page.getByRole('button', { name: 'Add approved photo to Gallery' }).click();
  await expect(page.getByText('That photo is not on this device.')).toBeVisible();
  await page.getByLabel('Note to the coach').fill('Show the knee cut.');
  await page.getByRole('button', { name: 'Request changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Request changes', exact: true })).toHaveCSS('background-color', 'rgb(0, 78, 186)');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reject', exact: true })).toHaveCSS('background-color', 'rgb(0, 78, 186)');
  await page.screenshot({ path: '/opt/cursor/artifacts/drive-handoff-inbox-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/opt/cursor/artifacts/drive-handoff-inbox-phone.png' });
});

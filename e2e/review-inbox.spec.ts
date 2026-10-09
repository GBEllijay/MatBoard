import { expect, test, type Locator, type Page } from '@playwright/test';

async function unlock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    const plan = {
      version: 1,
      id: 'plan-review',
      coachName: 'Alex',
      classDesignation: 'GB1',
      classTime: '5:00 PM',
      intro: 'Passing series.',
      introExpected: '',
      warmupNote: '',
      warmupExpected: '',
      techniques: [
        { id: 't1', slotId: 's1', title: '', notes: '', expected: '', waterBreak: false },
        { id: 't2', slotId: 's2', title: '', notes: '', expected: '', waterBreak: false },
        { id: 't3', slotId: 's3', title: '', notes: '', expected: '', waterBreak: false },
      ],
      specificNote: '',
      specificExpected: '',
      cooldownNote: '',
      cooldownExpected: '',
      closing: 'Bow.',
    };
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    localStorage.setItem(
      'matboard.coach.trainingNotes.v1',
      JSON.stringify({ version: 3, days: { [dateKey]: { plans: [plan] } } }),
    );
    localStorage.setItem(
      'matboard.pro.lessonDriveQueue.v1',
      JSON.stringify({
        version: 1,
        revisions: [
          {
            revisionId: `draft:${dateKey}:alex:plan-review`,
            dateKey,
            coachName: 'Alex',
            savedAt: 1,
            kind: 'draft',
            driveFileId: null,
            status: 'waiting-for-drive',
            plan,
            media: [],
          },
        ],
      }),
    );
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: false });
}

async function seedClassPhoto(page: Page) {
  await page.evaluate(async () => {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const blob = await new Promise<Blob>((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas'));
        return;
      }
      ctx.fillStyle = '#004eba';
      ctx.fillRect(0, 0, 8, 8);
      canvas.toBlob((next) => (next ? resolve(next) : reject(new Error('blob'))), 'image/png');
    });
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('matboard-class-photo-promotions', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('items', 'readwrite');
        tx.objectStore('items').put({
          id: 'photo-review',
          dateKey,
          name: 'class.png',
          mime: 'image/png',
          kind: 'photo',
          blob,
          addedAt: 1,
          driveFileId: null,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  });
}

async function fillColor(locator: Locator) {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

test('Sunday review opens the inbox and the coach can submit', async ({ page }) => {
  await unlock(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/notes?plan=unlimited');
  await expect(page.getByLabel('Intro')).toHaveValue('Passing series.');
  await seedClassPhoto(page);
  const distribute = page.getByRole('complementary', { name: 'Instructor distribution' });
  await distribute.getByRole('button', { name: 'Upload for instructor distribution' }).click();
  await expect(distribute.getByText('Saved on this phone.')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Sent for review.')).toBeVisible();
  await shot(page, 'review-submit-desktop');

  await page.goto('/coach-unlimited');
  const row = page.getByRole('link', { name: /Alex · GB1 5:00 PM · .+ · Draft/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/review\?revision=/);
  const card = page.getByRole('article', { name: 'This submission' });
  const approve = page.getByRole('button', { name: 'Approve', exact: true });
  const changes = page.getByRole('button', { name: 'Request changes' });
  const reject = page.getByRole('button', { name: 'Reject' });
  await expect(approve).toBeVisible();
  await expect(changes).toBeVisible();
  await expect(reject).toBeVisible();
  await expect(card.getByText('Photo: class.png')).toBeVisible();
  expect(await fillColor(approve)).toBe('rgb(252, 192, 0)');
  await page.getByLabel('Note to the coach').fill('Show the knee cut.');
  await changes.click();
  await expect(card.getByText('Changes requested')).toBeVisible();
  await expect(card.getByRole('status')).toHaveText('Show the knee cut.');
  expect(await fillColor(changes)).toBe('rgb(0, 78, 186)');
  await page.getByRole('link', { name: 'Back to Coach Unlimited' }).click();
  await page.getByRole('link', { name: /Alex · GB1 5:00 PM · .+ · Draft/ }).click();
  await expect(page.getByLabel('Note to the coach')).toHaveValue('Show the knee cut.');
  await page.getByRole('link', { name: /Alex · GB1 5:00 PM · Changes requested/ }).click();
  await approve.click();
  await expect(card.getByText('Approved', { exact: true })).toBeVisible();
  expect(await fillColor(approve)).toBe('rgb(0, 78, 186)');
  await page.getByRole('button', { name: 'Add approved photo to Gallery' }).click();
  await expect(page.getByText('That photo is in the Gallery on this device.')).toBeVisible();
  await shot(page, 'review-inbox-desktop');
  await page.getByRole('link', { name: 'Back to Coach Unlimited' }).click();
  await expect(page).toHaveURL(/\/coach-unlimited/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/coach-unlimited');
  await shot(page, 'review-sunday-phone');
  await page.getByRole('link', { name: /Alex · GB1 5:00 PM · .+ · Draft/ }).click();
  const phoneReject = page.getByRole('button', { name: 'Reject', exact: true });
  await expect(phoneReject).toBeVisible();
  await phoneReject.click();
  await expect(page.getByRole('article', { name: 'This submission' }).getByText('Rejected')).toBeVisible();
  expect(await fillColor(phoneReject)).toBe('rgb(0, 78, 186)');
  await shot(page, 'review-inbox-phone');
});

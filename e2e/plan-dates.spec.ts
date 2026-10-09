import { expect, test, type Locator, type Page } from '@playwright/test';

function dateKey(delta: number): string {
  const today = new Date();
  today.setDate(today.getDate() + delta);
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

async function unlock(page: Page) {
  const dayOne = dateKey(-2);
  const today = dateKey(0);
  await page.addInitScript(
    ({ dayOneKey, todayKey }) => {
      localStorage.setItem('advantage.proUnlocked', '1');
      localStorage.setItem('advantage.coachUnlocked', '1');
      const techniques = [
        { id: 't1', slotId: 's1', title: '', notes: '', expected: '', waterBreak: false },
        { id: 't2', slotId: 's2', title: '', notes: '', expected: '', waterBreak: false },
        { id: 't3', slotId: 's3', title: '', notes: '', expected: '', waterBreak: false },
      ];
      const older = {
        version: 1,
        id: 'plan-day-one',
        coachName: 'Alex',
        classDesignation: 'GB1',
        classTime: '5:00 PM',
        intro: 'Day one guard.',
        introExpected: '',
        warmupNote: '',
        warmupExpected: '',
        techniques,
        specificNote: '',
        specificExpected: '',
        cooldownNote: '',
        cooldownExpected: '',
        closing: 'Bow.',
      };
      const current = {
        ...older,
        id: 'plan-day-three',
        intro: 'Day three pass.',
        techniques: techniques.map((tech) => ({ ...tech })),
      };
      const slot = (slotId: string, kind: string, clipId: string | null, mediaName: string) => ({
        slotId,
        kind,
        clipId,
        drillSec: 300,
        driveFileId: null,
        mediaName,
        mediaMime: clipId ? 'video/mp4' : '',
      });
      const dayOnePlan = {
        version: 2,
        selectedSlotId: 'drill-1',
        slots: [
          slot('warmup', 'warmup', null, ''),
          slot('drill-1', 'technique', 'clip-day1', 'day-one.mp4'),
          slot('drill-2', 'technique', null, ''),
          slot('drill-3', 'technique', null, ''),
          slot('cooldown', 'cooldown', null, ''),
        ],
      };
      localStorage.setItem(
        'matboard.coach.trainingNotes.v1',
        JSON.stringify({ version: 3, days: { [dayOneKey]: { plans: [older] }, [todayKey]: { plans: [current] } } }),
      );
      localStorage.setItem(
        'matboard.techniquePlanDates.v1',
        JSON.stringify({ version: 1, days: { [dayOneKey]: dayOnePlan } }),
      );
    },
    { dayOneKey: dayOne, todayKey: today },
  );
}

async function seedMedia(page: Page) {
  const dayOne = dateKey(-2);
  await page.evaluate(async (dayOneKey) => {
    const blob = new Blob([new Uint8Array([0, 0, 0, 24])], { type: 'video/mp4' });
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('matboard-techniques', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('clips')) db.createObjectStore('clips', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs');
      };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('clips', 'readwrite');
        tx.objectStore('clips').put({
          id: 'clip-day1',
          label: 'Day one',
          mime: 'video/mp4',
          blob,
          addedAt: 1,
          sortOrder: 1,
          folderId: 'techniques',
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
    const photo = await new Promise<Blob>((resolve, reject) => {
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
          id: 'photo-day-one',
          dateKey: dayOneKey,
          name: 'day-one.jpg',
          mime: 'image/png',
          kind: 'photo',
          blob: photo,
          addedAt: 1,
          driveFileId: null,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, dayOne);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: false });
}

async function fillColor(locator: Locator) {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

test('past days keep their video and photo, and dates can be searched', async ({ page }) => {
  await unlock(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await seedMedia(page);
  await page.goto('/notes?plan=unlimited');
  await expect(page.getByLabel('Intro')).toHaveValue('Day three pass.');
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled();
  await expect(page.getByText('day-one.mp4')).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous day' }).click();
  const todayButton = page.getByRole('button', { name: 'Today', exact: true });
  await todayButton.click();
  await expect(page.getByLabel('Intro')).toHaveValue('Day three pass.');
  expect(await fillColor(todayButton)).toBe('rgb(0, 78, 186)');

  await page.getByLabel('Search plans').fill('');
  await page.getByRole('button', { name: 'Classes' }).click();
  await expect(page.getByRole('list', { name: 'Class folders' }).getByRole('button', { name: /GB1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Classes' }).click();
  await page.getByLabel('Search plans').fill('guard');
  const results = page.getByRole('list', { name: 'Plan search results' });
  const hit = results.getByRole('button');
  await hit.click();
  await expect(page.getByLabel('Intro')).toHaveValue('Day one guard.');
  await expect(page.getByText('day-one.mp4')).toBeVisible();
  await expect(page.getByText('day-one.jpg')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add photo or video' })).toHaveCount(0);
  expect(await fillColor(hit)).toBe('rgb(0, 78, 186)');
  await shot(page, 'plan-dates-desktop');

  await page.getByLabel('Calendar').fill(dateKey(0));
  await expect(page.getByLabel('Intro')).toHaveValue('Day three pass.');
  await expect(page.getByRole('button', { name: 'Add photo or video' })).toBeVisible();
  await page.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await page.getByRole('button', { name: 'Classes' }).click();
  await expect(page.getByRole('button', { name: /GB1/ }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Calendar').fill(dateKey(-2));
  await expect(page.getByLabel('Intro')).toHaveValue('Day one guard.');
  await expect(page.getByText('day-one.mp4')).toBeVisible();
  await shot(page, 'plan-dates-phone');
});

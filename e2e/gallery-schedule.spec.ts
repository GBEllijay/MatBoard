import { expect, test, type Locator, type Page } from '@playwright/test';

async function unlock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
  });
}

async function seedTechnique(page: Page) {
  await page.evaluate(async () => {
    const blob = new Blob([new Uint8Array([0, 0, 0, 24])], { type: 'video/mp4' });
    const plan = {
      version: 2,
      selectedSlotId: 'drill-1',
      slots: [
        { slotId: 'warmup', kind: 'warmup', clipId: null, drillSec: 300, driveFileId: null, mediaName: '', mediaMime: '' },
        {
          slotId: 'drill-1',
          kind: 'technique',
          clipId: 'clip-link',
          drillSec: 42,
          driveFileId: null,
          mediaName: 'armbar.mp4',
          mediaMime: 'video/mp4',
        },
        { slotId: 'drill-2', kind: 'technique', clipId: null, drillSec: 300, driveFileId: null, mediaName: '', mediaMime: '' },
        { slotId: 'drill-3', kind: 'technique', clipId: null, drillSec: 300, driveFileId: null, mediaName: '', mediaMime: '' },
        { slotId: 'cooldown', kind: 'cooldown', clipId: null, drillSec: 300, driveFileId: null, mediaName: '', mediaMime: '' },
      ],
    };
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
        const tx = db.transaction(['clips', 'prefs'], 'readwrite');
        tx.objectStore('clips').put({
          id: 'clip-link',
          label: 'Armbar',
          mime: 'video/mp4',
          blob,
          addedAt: 1,
          sortOrder: 1,
          folderId: 'techniques',
        });
        tx.objectStore('prefs').put(plan, 'plan');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: false });
}

async function fillColor(locator: Locator) {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

test('gallery can schedule a photo and link a technique clip without copying it', async ({ page }) => {
  await unlock(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/slideshow?folder=gallery');
  await seedTechnique(page);
  const play = page.getByRole('button', { name: 'Play Gallery' });
  await expect(play).toBeVisible();
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  expect(await fillColor(play)).toBe('rgb(0, 78, 186)');

  await page.getByRole('dialog').getByRole('button', { name: 'Add photos' }).click();
  await page.locator('#saver-photo-library').setInputFiles('/tmp/gallery.png');
  const caption = page.getByLabel('Caption for Photo 1');
  await expect(caption).toBeVisible();
  await caption.fill('Guard pass');
  await caption.blur();
  const showDate = page.getByRole('button', { name: 'Show on date' });
  const nextClass = page.getByRole('button', { name: 'Next class' });
  await showDate.click();
  await expect(showDate).toHaveAttribute('aria-pressed', 'true');
  expect(await fillColor(showDate)).toBe('rgb(0, 78, 186)');
  await expect(page.getByLabel('Show date for Photo 1')).toBeVisible();
  await nextClass.click();
  await expect(nextClass).toHaveAttribute('aria-pressed', 'true');
  await expect(showDate).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: "Link this day's technique clips" }).click();
  await expect(page.getByText('Loop timer 42s.')).toBeVisible();
  await expect(page.locator('input.folder-row__name').nth(1)).toHaveValue('armbar.mp4');
  await shot(page, 'gallery-schedule-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'gallery-schedule-phone');
});

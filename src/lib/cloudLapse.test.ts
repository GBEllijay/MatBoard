import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CLOUD_DOWNLOAD_DAYS,
  CLOUD_DOWNLOAD_MS,
  LAPSE_CONNECT,
  LAPSE_PAUSED,
  LAPSE_REMOVED,
  cloudLapsePhase,
  downloadButtonLabel,
  downloadDaysLeft,
  gymFolderDownloadText,
  syncCloudLapse,
} from './cloudLapse.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

test('a gym that never bought Cloud does not see the lapse lines', () => {
  assert.deepEqual(
    cloudLapsePhase({ seenActive: false, lapsedAt: Date.now(), now: Date.now(), cloudActive: false }),
    { phase: 'hidden' },
  );
  assert.equal(CLOUD_DOWNLOAD_DAYS, 60);
});

test('the download window lasts 60 days and then the Cloud copy is treated as removed', () => {
  const lapsedAt = Date.parse('2026-11-01T00:00:00.000Z');
  const during = cloudLapsePhase({
    seenActive: true,
    lapsedAt,
    now: lapsedAt + CLOUD_DOWNLOAD_MS - 1000,
    cloudActive: false,
  });
  assert.equal(during.phase, 'download');
  if (during.phase === 'download') {
    assert.equal(during.daysLeft, 1);
    assert.match(downloadButtonLabel(during.daysLeft), /Download my gym folder/);
  }
  assert.equal(downloadDaysLeft(lapsedAt, lapsedAt + 59 * 24 * 60 * 60 * 1000), 1);
  const gone = cloudLapsePhase({
    seenActive: true,
    lapsedAt,
    now: lapsedAt + CLOUD_DOWNLOAD_MS + 1,
    cloudActive: false,
  });
  assert.deepEqual(gone, { phase: 'removed' });
  assert.match(LAPSE_PAUSED, /Everything on this phone still works/);
  assert.match(LAPSE_CONNECT, /Google Drive, OneDrive/);
  assert.match(LAPSE_REMOVED, /removed/);
  const source = readFileSync(new URL('./cloudLapse.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /90 days/);
});

test('turning Cloud back on clears the lapse stamp', () => {
  const storage = memory();
  syncCloudLapse(storage, true, 10);
  syncCloudLapse(storage, false, 20);
  assert.equal(storage.getItem('matboard.plusCloud.lapsedAt.v1'), '20');
  syncCloudLapse(storage, true, 30);
  assert.equal(storage.getItem('matboard.plusCloud.lapsedAt.v1'), null);
  assert.match(gymFolderDownloadText(), /gallery\/approved/);
});

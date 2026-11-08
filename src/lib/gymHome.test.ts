import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PHOTOS_PICK_MAX } from './googlePhotos.ts';
import { chooseGymHome, mediaConsoleDriveActions, mediaConsoleGalleryLead, playingFromCopy, probeAdvantageCloud } from './gymHome.ts';

test('slideshow home is Cloud, then Drive or OneDrive, then the phone', () => {
  assert.equal(
    chooseGymHome({ plusCloudActive: true, cloudBound: true, driveConnected: true, oneDriveConnected: true }),
    'advantage-cloud',
  );
  assert.equal(
    chooseGymHome({ plusCloudActive: true, cloudBound: false, driveConnected: true, oneDriveConnected: true }),
    'google-drive',
  );
  assert.equal(
    chooseGymHome({ plusCloudActive: false, cloudBound: true, driveConnected: false, oneDriveConnected: true }),
    'onedrive',
  );
  assert.equal(
    chooseGymHome({ plusCloudActive: true, cloudBound: true, cloudLapsed: true, driveConnected: false, oneDriveConnected: false }),
    'phone',
  );
  assert.equal(
    chooseGymHome({ plusCloudActive: false, cloudBound: false, driveConnected: false, oneDriveConnected: false }),
    'phone',
  );
  assert.match(playingFromCopy('phone'), /Playing from this phone/);
  assert.match(playingFromCopy('google-drive'), /Playing from Google Drive/);
  assert.match(playingFromCopy('advantage-cloud'), /Playing from Advantage Cloud/);
});

test('a Cloud customer does not get a Drive setup prompt, and an existing Drive folder stays available to import', () => {
  assert.deepEqual(
    mediaConsoleDriveActions({ settled: true, cloudEntitled: true, driveConnected: false }),
    { connect: false, importExisting: false },
  );
  assert.deepEqual(
    mediaConsoleDriveActions({ settled: true, cloudEntitled: true, driveConnected: true }),
    { connect: false, importExisting: true },
  );
  assert.deepEqual(
    mediaConsoleDriveActions({ settled: true, cloudEntitled: false, driveConnected: false }),
    { connect: true, importExisting: false },
  );
  assert.deepEqual(
    mediaConsoleDriveActions({ settled: false, cloudEntitled: true, driveConnected: true }),
    { connect: false, importExisting: false },
  );
  assert.deepEqual(
    mediaConsoleDriveActions({ settled: false, cloudEntitled: false, driveConnected: false }),
    { connect: false, importExisting: false },
  );
  const cloud = mediaConsoleGalleryLead({ cloudEntitled: true, driveConnected: true });
  assert.match(cloud, /Advantage Cloud/);
  assert.match(cloud, /already connected stays connected/);
  assert.doesNotMatch(cloud, /Pick from Google Drive is an extra source/);
  const plain = mediaConsoleGalleryLead({ cloudEntitled: false, driveConnected: false });
  assert.match(plain, /Pick from Google Drive is an extra source/);
});

test('a missing Cloud binding falls back instead of pretending Cloud is on', async () => {
  const unbound = await probeAdvantageCloud(async () => new Response(JSON.stringify({ ok: false, reason: 'unbound' }), { status: 503 }));
  const html = await probeAdvantageCloud(async () => new Response('<html></html>', { status: 200 }));
  const bound = await probeAdvantageCloud(async () => new Response(JSON.stringify({ ok: true, bound: true }), { status: 200 }));
  assert.equal(unbound, false);
  assert.equal(html, false);
  assert.equal(bound, true);
});

test('Google Photos stays the album picker and gallery bytes are not a public bucket URL', () => {
  assert.equal(PHOTOS_PICK_MAX, '50');
  const photos = readFileSync(new URL('./googlePhotos.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(photos, /gallery\/approved/);
  const worker = readFileSync(new URL('../../functions/api/gym/media.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(worker, /r2\.dev/);
  assert.match(worker, /gallery\/approved/);
  assert.match(worker, /unbound/);
  assert.match(worker, /cloudflare-cdn-cache-control/);
  assert.match(worker, /authorization/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PHOTOS_PICK_MAX } from './googlePhotos.ts';
import { chooseGymHome, playingFromCopy, probeAdvantageCloud } from './gymHome.ts';

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
});

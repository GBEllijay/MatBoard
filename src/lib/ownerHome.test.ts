import assert from 'node:assert/strict';
import test from 'node:test';
import { claimsOpenPlusCloud, cloudMediaAccess, cloudObjectKey } from './advantageCloudMedia.ts';
import { mediaConsoleDriveActions } from './gymHome.ts';
import { ownerProHubOpen } from './productNames.ts';
import { proPlusCloudDoorOpen } from './proPlusCloud.ts';
import { ownerEditionTarget } from './ownerHome.ts';

const open = { settled: true, seated: false, proConsoleOpen: true, cloudOpen: false };
const cloud = { settled: true, seated: false, proConsoleOpen: true, cloudOpen: true };
const locked = { settled: true, seated: false, proConsoleOpen: false, cloudOpen: false };
const seat = { settled: true, seated: true, proConsoleOpen: false, cloudOpen: false };
const pending = { settled: false, seated: false, proConsoleOpen: false, cloudOpen: false };

test('a valid Pro owner opens /pro, and Pro + Cloud stays its own page', () => {
  assert.equal(ownerEditionTarget({ entry: 'pro', ...open }), '/pro');
  assert.equal(ownerEditionTarget({ entry: 'pro-cloud', ...open }), '/editions/pro-cloud');
  assert.equal(ownerEditionTarget({ entry: 'pro', ...cloud }), '/pro');
  assert.equal(ownerEditionTarget({ entry: 'pro-cloud', ...cloud }), '/pro-plus-cloud');
});

test('a paid Pro pass without Cloud does not open the Cloud homepage', () => {
  assert.equal(ownerEditionTarget({ entry: 'pro', ...open }), '/pro');
  assert.equal(ownerEditionTarget({ entry: 'pro-cloud', ...open }), '/editions/pro-cloud');
});

test('a locked visitor gets the public Pro and Pro + Cloud pages', () => {
  assert.equal(ownerEditionTarget({ entry: 'pro', ...locked }), '/editions/pro');
  assert.equal(ownerEditionTarget({ entry: 'pro-cloud', ...locked }), '/editions/pro-cloud');
});

test('a coach seat is not sent to the owner homepage', () => {
  assert.equal(ownerEditionTarget({ entry: 'pro', ...seat }), '/editions/pro');
  assert.equal(ownerEditionTarget({ entry: 'pro-cloud', ...seat }), '/editions/pro-cloud');
  assert.equal(
    ownerEditionTarget({ entry: 'pro-cloud', settled: true, seated: true, proConsoleOpen: true, cloudOpen: true }),
    '/editions/pro-cloud',
  );
  assert.equal(
    ownerEditionTarget({ entry: 'pro', settled: true, seated: true, proConsoleOpen: true, cloudOpen: false }),
    '/pro',
  );
});

test('an instructor seat under a Cloud alpha owner gets that academy Cloud and not the owner job', () => {
  const alphaOwner = { src: 'code' as const, tier: 'alpha', grants: ['white', 'student', 'coach', 'pro', 'media'] };
  assert.equal(claimsOpenPlusCloud(alphaOwner), true);
  assert.equal(proPlusCloudDoorOpen(alphaOwner), true);
  assert.equal(ownerEditionTarget({ entry: 'pro', ...cloud }), '/pro');
  assert.equal(ownerEditionTarget({ entry: 'pro-cloud', ...cloud }), '/pro-plus-cloud');

  const instructorSeat = { src: 'seat' as const, tier: 'seat', grants: [] as string[] };
  assert.equal(claimsOpenPlusCloud(instructorSeat), false);
  assert.equal(proPlusCloudDoorOpen(instructorSeat), false);
  assert.equal(ownerProHubOpen(true, true), false);
  assert.equal(
    ownerEditionTarget({ entry: 'pro-cloud', settled: true, seated: true, proConsoleOpen: true, cloudOpen: true }),
    '/editions/pro-cloud',
  );
  assert.equal(
    ownerEditionTarget({ entry: 'pro', settled: true, seated: true, proConsoleOpen: true, cloudOpen: false }),
    '/pro',
  );
  assert.deepEqual(cloudMediaAccess({ plusCloud: true, kind: 'seat', preset: 'instructors' }), { read: true, upload: true });
  assert.deepEqual(cloudMediaAccess({ plusCloud: true, kind: 'seat', preset: 'coach' }), { read: true, upload: true });
  assert.equal(
    cloudObjectKey('owner-license', 'videos/daily/2026-11-08/clip.mp4'),
    'groups/owner-license/videos/daily/2026-11-08/clip.mp4',
  );
  assert.deepEqual(mediaConsoleDriveActions({ settled: true, cloudEntitled: false, driveConnected: true }), {
    connect: false,
    importExisting: true,
  });
  assert.deepEqual(mediaConsoleDriveActions({ settled: true, cloudEntitled: true, driveConnected: true }), {
    connect: false,
    importExisting: true,
  });
  assert.deepEqual(mediaConsoleDriveActions({ settled: true, cloudEntitled: true, driveConnected: false }), {
    connect: false,
    importExisting: false,
  });
});

test('a saved pass that is still loading is not sent to a buy or alpha page', () => {
  assert.equal(ownerEditionTarget({ entry: 'pro', ...pending }), '/pro');
  assert.equal(ownerEditionTarget({ entry: 'pro-cloud', ...pending }), '/pro-plus-cloud');
});

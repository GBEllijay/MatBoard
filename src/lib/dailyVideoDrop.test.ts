import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DAILY_VIDEO_STAY,
  canSendToDailyVideos,
  chooseDailyVideoHome,
  dailyVideoFileName,
  dailyVideoSentCopy,
  probeDailyVideoCloud,
  sendToDailyVideos,
  statusAllowsDailyDrop,
} from './dailyVideoDrop.ts';
import { instructorPresetPermissions } from './instructorSeats.ts';

const pdPerms = instructorPresetPermissions('program-director');

test('only a live seat with the daily-video switch gets the choice', () => {
  assert.equal(canSendToDailyVideos(null), false);
  assert.equal(canSendToDailyVideos({ status: 'claimed', permissions: pdPerms }), true);
  assert.equal(canSendToDailyVideos({ status: 'revoked', permissions: pdPerms }), false);
  assert.equal(canSendToDailyVideos({ status: 'claimed', permissions: { ...pdPerms, dailyVideoUpload: false } }), false);
  assert.equal(
    canSendToDailyVideos({ status: 'claimed', permissions: instructorPresetPermissions('assistant-coach') }),
    false,
  );
});

test('the destination follows what the gym has and hides when it has nothing', () => {
  assert.equal(chooseDailyVideoHome({ cloudDrop: true, driveConnected: true, oneDriveConnected: true }), 'advantage-cloud');
  assert.equal(chooseDailyVideoHome({ cloudDrop: false, driveConnected: true, oneDriveConnected: true }), 'google-drive');
  assert.equal(chooseDailyVideoHome({ cloudDrop: false, driveConnected: false, oneDriveConnected: true }), 'onedrive');
  assert.equal(chooseDailyVideoHome({ cloudDrop: false, driveConnected: false, oneDriveConnected: false }), null);
  assert.equal(statusAllowsDailyDrop({ ok: true, cloud: false, dailyVideoDrop: true }), true);
  assert.equal(statusAllowsDailyDrop({ ok: true, cloud: true, canUpload: true }), true);
  assert.equal(statusAllowsDailyDrop({ ok: true, cloud: true, canUpload: false }), false);
  assert.equal(statusAllowsDailyDrop({ ok: true, cloud: false }), false);
  assert.equal(statusAllowsDailyDrop(null), false);
});

test('the Cloud probe asks status with the signed-in token and treats errors as no Cloud', async () => {
  let seen = '';
  const ok = (async (url: string, init?: RequestInit) => {
    seen = `${url} ${new Headers(init?.headers).get('authorization')}`;
    return new Response(JSON.stringify({ ok: true, cloud: false, dailyVideoDrop: true }), { status: 200 });
  }) as unknown as typeof fetch;
  assert.equal(await probeDailyVideoCloud(ok, 'tok'), true);
  assert.equal(seen, '/api/gym/cloud?op=status Bearer tok');
  const denied = (async () => new Response('no', { status: 403 })) as unknown as typeof fetch;
  assert.equal(await probeDailyVideoCloud(denied, 'tok'), false);
  assert.equal(await probeDailyVideoCloud(ok, ''), false);
});

test('a Cloud send uses the daily-video purpose and skips anything that is not a video', async () => {
  const calls: { purpose: string; dateKey: string; fileName: string }[] = [];
  const result = await sendToDailyVideos({
    files: [new File([new Uint8Array(4)], 'drill.mp4', { type: 'video/mp4' }), new File([new Uint8Array(4)], 'p.jpg', { type: 'image/jpeg' })],
    dateKey: '2026-11-04',
    home: 'advantage-cloud',
    role: 'program-director',
    cloudUpload: (async (input: { purpose: string; dateKey: string; fileName: string }) => {
      calls.push({ purpose: input.purpose, dateKey: input.dateKey, fileName: input.fileName });
      return { ok: true, path: 'videos/daily/2026-11-04/drill.mp4' };
    }) as never,
    publish: (async () => {
      throw new Error('Drive must not be used when Cloud is the home');
    }) as never,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].purpose, 'daily-video');
  assert.equal(calls[0].dateKey, '2026-11-04');
  assert.match(calls[0].fileName, /^\d{6}-drill\.mp4$/);
  assert.equal(dailyVideoFileName('IMG_1.MOV', Date.UTC(2026, 10, 4, 13, 5, 9)), '130509-IMG_1.MOV');
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 1);
  assert.match(result.message, /Instructors add them to their lesson plans/);
});

test('a Drive send publishes to the daily-video lane as the program director', async () => {
  const seen: { purpose: string; role: string; kind: string }[] = [];
  const result = await sendToDailyVideos({
    files: [new File([new Uint8Array(4)], 'drill.mov', { type: 'video/quicktime' })],
    dateKey: '2026-11-04',
    home: 'google-drive',
    role: 'program-director',
    cloudUpload: (async () => {
      throw new Error('Cloud must not be used when Drive is the home');
    }) as never,
    publish: (async (input: { purpose: string; role: string; kind: string }) => {
      seen.push({ purpose: input.purpose, role: input.role, kind: input.kind });
      return { route: { ok: true, path: 'videos/daily/2026-11-04/drill.mov' }, home: 'google-drive', remoteId: 'f1', failed: false };
    }) as never,
  });
  assert.deepEqual(seen, [{ purpose: 'daily-video', role: 'program-director', kind: 'video' }]);
  assert.equal(result.sent, 1);
  assert.match(result.message, /Google Drive/);
  assert.match(dailyVideoSentCopy({ sent: 0, failed: 0, skipped: 1, home: 'onedrive' }), /not a video/);
});

test('Media Console offers Gallery or today\'s videos only to that seat and keeps the existing picks', () => {
  const saver = readFileSync(new URL('../pages/Screensaver.tsx', import.meta.url), 'utf8');
  const sheet = readFileSync(new URL('../components/VideoSourceSheet.tsx', import.meta.url), 'utf8');
  assert.match(saver, /const dailyVideoSeat = canSendToDailyVideos\(seat\)/);
  assert.match(saver, /kind === 'video' && folderId === 'gallery' && dailyVideoSeat/);
  assert.match(saver, /dailyChoiceShown && dailyHome \?/);
  assert.match(saver, /name="saver-video-destination"/);
  assert.match(saver, /value="gallery"/);
  assert.match(saver, /value="daily-videos"/);
  // Google Photos and Drive picks stay for the Gallery; today's videos is camera or this device.
  assert.match(saver, /onPickPhotos=\{sendingDaily \? undefined :/);
  assert.match(saver, /onPickDrive=\{sendingDaily \? undefined :/);
  assert.match(saver, /stay=\{sendingDaily \? DAILY_VIDEO_STAY : undefined\}/);
  assert.match(saver, /await onDailyFiles\(\[\.\.\.files\], dailyHome\)/);
  // A PD with gallery approval on goes through the existing pending lane.
  assert.match(saver, /isProgramDirectorSeat\(seat\) &&\s+readGalleryApproval\(/);
  assert.match(saver, /addClassPhotoPromotionFiles\(localDateKey\(\), matched\)/);
  // Camera capture inputs are unchanged.
  assert.match(saver, /saver-photo-capture/);
  assert.match(saver, /saver-video-record/);
  assert.match(sheet, /children\?: ReactNode/);
  assert.match(sheet, /\{children\}/);
  assert.match(DAILY_VIDEO_STAY, /not the Gallery/);
  // Lesson plans are not opened by this lane.
  const lib = readFileSync(new URL('./dailyVideoDrop.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /lessonPlan|planVideos|dailyLessonPlanAccess/);
});

test('instructors still find daily videos on Daily Training Videos', () => {
  const techniques = readFileSync(new URL('../pages/Techniques.tsx', import.meta.url), 'utf8');
  assert.match(techniques, /purpose="daily-video"/);
  assert.match(techniques, /DriveMediaPicker/);
});

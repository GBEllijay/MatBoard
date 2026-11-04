import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CAMERA_HREF,
  CAMERA_PATH,
  TODAYS_VIDEOS_CONTROLS,
  cameraDailyVideosAllowed,
  cameraHubs,
  cameraModeRequested,
  cameraPhotoAllowed,
  cameraPhotoDestinations,
  cameraVideoDestinations,
  cameraWindowOpen,
  listTodaysCloudVideos,
  loopChoices,
  openTodaysCloudVideo,
  statusAllowsDailyPlay,
} from './pdCamera.ts';
import { coachToolVisible, instructorPresetPermissions, seatGrantsCoachMenus } from './instructorSeats.ts';
import { paidChunkForHref } from './paidChunkAccess.ts';

const pd = { status: 'claimed' as const, presetId: 'program-director' as const, permissions: instructorPresetPermissions('program-director') };
const coach = { status: 'claimed' as const, presetId: 'coach' as const, permissions: instructorPresetPermissions('coach') };
const assistant = {
  status: 'claimed' as const,
  presetId: 'assistant-coach' as const,
  permissions: instructorPresetPermissions('assistant-coach'),
};
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a program director sees the Camera window; coach, assistant, revoked, and owner do not get it', () => {
  assert.equal(cameraWindowOpen(pd), true);
  assert.deepEqual(cameraHubs(pd), [{ title: 'Camera', to: CAMERA_HREF, belt: 'purple' }]);
  for (const seat of [coach, assistant, { ...pd, status: 'revoked' as const }, null]) {
    assert.equal(cameraWindowOpen(seat), false);
    assert.deepEqual(cameraHubs(seat), []);
  }
  assert.equal(cameraModeRequested('1', pd), true);
  assert.equal(cameraModeRequested('1', coach), false);
  assert.equal(cameraModeRequested(null, pd), false);
  // Both switches off: no Camera window.
  const closed = { ...pd, permissions: { ...pd.permissions, galleryUpload: false, dailyVideoUpload: false } };
  assert.equal(cameraWindowOpen(closed), false);
});

test('the Camera window sits in the Media Console paid chunk; entitlements are unchanged', () => {
  assert.equal(paidChunkForHref(CAMERA_HREF), 'media-console');
  const pro = read('../pages/Pro.tsx');
  assert.match(pro, /mediaConsoleDoorOpen\(door\) \? cameraHubs\(door\.seat \?\? null\) : \[\]/);
  const app = read('../App.tsx');
  assert.match(app, /path=\{CAMERA_PATH\} element=\{<CameraRoute \/>\}/);
  assert.match(app, /paidDoorAgrees\('media-console', mediaConsoleDoorOpen\(door\) && cameraWindowOpen\(door\.seat \?\? null\)\)/);
  assert.equal(CAMERA_PATH, '/camera');
});

test('a photo goes to the Gallery; a video offers Gallery and today\'s videos', () => {
  assert.deepEqual(cameraPhotoDestinations(pd), ['gallery']);
  assert.deepEqual(cameraVideoDestinations(pd, 'cloud'), ['gallery', 'daily-videos']);
  assert.deepEqual(cameraVideoDestinations(pd, 'drive'), ['gallery', 'daily-videos']);
  assert.deepEqual(cameraVideoDestinations(pd, null), ['gallery']);
  const noGallery = { ...pd, permissions: { ...pd.permissions, galleryUpload: false } };
  assert.deepEqual(cameraPhotoDestinations(noGallery), []);
  assert.deepEqual(cameraVideoDestinations(noGallery, 'cloud'), ['daily-videos']);
  const noDaily = { ...pd, permissions: { ...pd.permissions, dailyVideoUpload: false } };
  assert.equal(cameraDailyVideosAllowed(noDaily), false);
  assert.equal(cameraPhotoAllowed(noDaily), true);
  assert.deepEqual(cameraVideoDestinations(noDaily, 'cloud'), ['gallery']);

  // Camera mode reuses the same add sheet: photo -> Gallery, video -> the Gallery / Today's videos choice.
  const saver = read('../pages/Screensaver.tsx');
  assert.match(saver, /onTakePhoto=\{\(\) => openAdd\('gallery', 'photo'\)\}/);
  assert.match(saver, /onTakeVideo=\{openCameraVideo\}/);
  assert.match(saver, /openAdd\('gallery', 'video'\);\n\s+if \(!cameraPhotoAllowed\(seat\)\) setVideoDest\('daily-videos'\)/);
  assert.match(saver, /name="saver-video-destination"/);
  assert.match(saver, /value="daily-videos"/);
  // Pick from device stays in the same sheet.
  for (const id of ['saver-photo-capture', 'saver-photo-library', 'saver-video-record', 'saver-video-library']) {
    assert.match(saver, new RegExp(`id="${id}"`), id);
  }
  // Camera view does not auto-enter fullscreen; the slideshow still does.
  assert.match(saver, /usePlayFullscreen\(cameraMode \? \{ auto: false \} : undefined\)/);
});

test('a program director can list, play, loop, and cast today\'s videos, but still cannot open lesson plans', async () => {
  for (const control of ['play', 'stop', 'loop', 'loop-timer', 'mute', 'fullscreen', 'tv-tip']) {
    assert.ok((TODAYS_VIDEOS_CONTROLS as readonly string[]).includes(control), control);
  }
  assert.deepEqual(loopChoices([30, 60]), [null, 30, 60]);
  const player = read('../components/CameraWindow.tsx');
  assert.match(player, /<LoopClip/);
  assert.match(player, /<FullscreenChip/);
  assert.match(player, /<TvTip/);
  assert.match(player, /useWakeLock\(playing\)/);
  assert.match(player, /durationMs=\{loopSec \? loopSec \* 1000 : undefined\}/);
  assert.doesNotMatch(player, /lesson|planVideos|dailyLessonPlanAccess/i);

  // Lesson plans stay closed.
  assert.equal(pd.permissions.dailyLessonPlanAccess, false);
  assert.equal(coachToolVisible('/notes', pd), false);
  assert.equal(seatGrantsCoachMenus(pd), pd.permissions.downloadTodaysVideos);
  assert.equal(coachToolVisible('/notes', coach), true);

  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    calls.push(url);
    if (url.includes('op=status')) return Response.json({ ok: true, cloud: false, dailyVideoPlay: true });
    if (url.includes('op=list')) {
      return Response.json({
        ok: true,
        files: [
          { name: 'drill.mp4', path: 'videos/daily/2026-11-04/drill.mp4', size: 3, mime: 'video/mp4' },
          { name: 'x.json', path: 'lessons/current/x.json', size: 1, mime: 'application/json' },
        ],
      });
    }
    if (url.includes('op=file')) return new Response(Uint8Array.from([1, 2, 3]), { headers: { 'content-type': 'video/mp4' } });
    return new Response('no', { status: 404 });
  }) as typeof fetch;
  const rows = await listTodaysCloudVideos({ dateKey: '2026-11-04', fetcher, token: 't' });
  assert.deepEqual(rows?.map((row) => row.path), ['videos/daily/2026-11-04/drill.mp4']);
  assert.ok(calls.some((url) => url.includes('purpose=daily-video&date=2026-11-04')));
  const blob = await openTodaysCloudVideo({ path: 'videos/daily/2026-11-04/drill.mp4', fetcher, token: 't' });
  assert.equal(blob?.size, 3);
  assert.equal(await openTodaysCloudVideo({ path: 'lessons/current/x.json', fetcher, token: 't' }), null);
  assert.equal(await listTodaysCloudVideos({ dateKey: '2026-11-04', fetcher, token: '' }), null);

  const closedFetcher = (async () => Response.json({ ok: true, cloud: false })) as unknown as typeof fetch;
  assert.equal(await listTodaysCloudVideos({ dateKey: '2026-11-04', fetcher: closedFetcher, token: 't' }), null);
  assert.equal(statusAllowsDailyPlay({ cloud: false, dailyVideoPlay: true }), true);
  assert.equal(statusAllowsDailyPlay({ cloud: true }), true);
  assert.equal(statusAllowsDailyPlay({ cloud: false }), false);
  assert.equal(statusAllowsDailyPlay(null), false);
});

test('coach Daily Training Videos keeps the same looping player', () => {
  const techniques = read('../pages/Techniques.tsx');
  assert.match(techniques, /import \{ LoopClip \} from '..\/components\/LoopClip'/);
  assert.equal((techniques.match(/<LoopClip/g) ?? []).length, 2);
  const clip = read('../components/LoopClip.tsx');
  assert.match(clip, /export function LoopClip/);
  assert.match(clip, /nextLoopStep/);
  assert.match(clip, /disableRemotePlayback/);
});

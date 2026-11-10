import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CLOUD_HOME_CONNECTED,
  CLOUD_HOME_ERROR,
  CLOUD_HOME_UNBOUND,
  CLOUD_UNAVAILABLE_MESSAGE,
  cloudHomeStatusLine,
  CLOUD_ROLE_HOME,
  CLOUD_ROLE_MESSAGE,
  CLOUD_SAVED_MESSAGE,
  loadAdvantageCloudHome,
  uploadAdvantageCloudFile,
  DEFAULT_CLOUD_CAP_BYTES,
  DEFAULT_MAX_UPLOAD_BYTES,
  claimsOpenPlusCloud,
  cloudCapBytes,
  cloudFullMessage,
  cloudListPrefix,
  cloudMediaAccess,
  cloudObjectKey,
  cloudPartPlan,
  cloudRelativePath,
  cloudTooLargeMessage,
  cloudUsageFigures,
  cloudUsageLine,
  formatCloudBytes,
  readCloudMediaHome,
  setCloudUploadReady,
  writeCloudMediaHome,
  cloudUploadSelected,
  CLOUD_DAILY_DROP_ONLY,
  cloudDailyVideoDrop,
  isDailyVideoCloudPath,
} from './advantageCloudMedia.ts';
import { INSTRUCTOR_PRESETS } from './instructorSeats.ts';
import { proPlusCloudDoorOpen } from './proPlusCloud.ts';

const page = readFileSync(new URL('../pages/Techniques.tsx', import.meta.url), 'utf8');
const notes = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
const sheet = readFileSync(new URL('../components/VideoSourceSheet.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/AdvantageCloudMedia.tsx', import.meta.url), 'utf8');
const gallery = readFileSync(new URL('../../functions/api/gym/media.ts', import.meta.url), 'utf8');
const drive = readFileSync(new URL('./lessonDrive.ts', import.meta.url), 'utf8');

test('Plus Cloud claims match the existing door, and seats are not Plus Cloud by themselves', () => {
  const owner = { src: 'owner' as const, tier: 'owner' as const, grants: ['pro'] };
  const code = { src: 'code' as const, tier: 'pro' as const, grants: ['white', 'student', 'coach', 'pro'] };
  const stripe = { src: 'stripe' as const, tier: 'pro' as const, grants: ['pro'], subs: { state: 'active' as const } };
  const locked = { src: 'code' as const, tier: 'pro' as const, grants: ['pro'], subs: { state: 'locked' as const } };
  const seat = { src: 'seat' as const, tier: 'seat' as const, grants: ['pro'], preset: 'coach' };
  const coachCode = { src: 'code' as const, tier: 'coach' as const, grants: ['coach'] };
  const paidCloud = {
    src: 'stripe' as const,
    tier: 'pro' as const,
    grants: ['pro'],
    subs: { state: 'active' as const, cloud: true },
  };
  const seatFlag = {
    src: 'seat' as const,
    tier: 'seat' as const,
    grants: ['pro'],
    subs: { state: 'active' as const, cloud: true },
  };
  for (const claims of [owner, code, stripe, locked, seat, coachCode, paidCloud, seatFlag, null]) {
    assert.equal(claimsOpenPlusCloud(claims), proPlusCloudDoorOpen(claims));
  }
  assert.equal(claimsOpenPlusCloud(paidCloud), true);
  assert.equal(claimsOpenPlusCloud(seatFlag), false);
  assert.equal(claimsOpenPlusCloud(stripe), false);
});

test('assistant coaches view Advantage Cloud; coach and above upload; lower tiers see nothing', () => {
  assert.deepEqual(cloudMediaAccess({ plusCloud: false, kind: 'owner' }), { read: false, upload: false });
  assert.deepEqual(cloudMediaAccess({ plusCloud: true, kind: 'owner' }), { read: true, upload: true });
  assert.deepEqual(cloudMediaAccess({ plusCloud: true, kind: 'seat', preset: 'assistant-coach' }), { read: true, upload: false });
  assert.deepEqual(cloudMediaAccess({ plusCloud: true, kind: 'seat', preset: 'coach' }), { read: true, upload: true });
  assert.deepEqual(cloudMediaAccess({ plusCloud: true, kind: 'seat', preset: 'instructors' }), { read: true, upload: true });
  assert.deepEqual(cloudMediaAccess({ plusCloud: true, kind: 'seat', preset: 'program-director' }), { read: false, upload: false });
  const assistant = INSTRUCTOR_PRESETS.find((preset) => preset.id === 'assistant-coach');
  assert.equal(assistant?.permissions.downloadTodaysVideos, true);
  assert.equal(assistant?.permissions.uploadForDistribution, true);
  assert.equal(assistant?.permissions.dailyLessonPlanAccess, true);
});

test('cloud paths stay on the gym tree and refuse a public or escaped key', () => {
  const daily = cloudRelativePath({
    purpose: 'daily-video',
    role: 'coach',
    dateKey: '2026-11-03',
    fileName: 'armbar.mp4',
  });
  const lesson = cloudRelativePath({
    purpose: 'lesson',
    role: 'owner',
    dateKey: '2026-11-03',
    fileName: 'ignored.json',
  });
  const media = cloudRelativePath({
    purpose: 'lesson-media',
    role: 'instructor',
    dateKey: '2026-11-03',
    fileName: 'demo clip.mp4',
  });
  assert.equal(daily.ok && daily.path, 'videos/daily/2026-11-03/armbar.mp4');
  assert.equal(lesson.ok && lesson.path, 'lessons/current/2026-W45/2026-11-03.json');
  assert.equal(media.ok && media.path, 'lessons/current/2026-W45/media/2026-11-03/demo-clip.mp4');
  assert.equal(cloudObjectKey('lic_owner-1', daily.ok ? daily.path : ''), 'groups/lic_owner-1/videos/daily/2026-11-03/armbar.mp4');
  assert.equal(cloudObjectKey('lic_owner-1', 'gallery/approved/2026-11-03/photo.jpg'), null);
  assert.equal(cloudObjectKey('lic_owner-1', '../secret'), null);
  assert.equal(cloudObjectKey('bad id', 'videos/daily/2026-11-03/armbar.mp4'), null);
  assert.equal(cloudListPrefix('lesson', '2026-11-03')?.plan, 'lessons/current/2026-W45/2026-11-03.json');
  assert.equal(cloudRelativePath({ purpose: 'daily-video', role: 'assistant', dateKey: '2026-11-03', fileName: 'a.mp4' }).ok, true);
  // A program director may drop a video into today's daily videos, and nothing in lesson plans.
  const pdDaily = cloudRelativePath({ purpose: 'daily-video', role: 'program-director', dateKey: '2026-11-03', fileName: 'a.mp4' });
  assert.equal(pdDaily.ok && pdDaily.path, 'videos/daily/2026-11-03/a.mp4');
  const pdLesson = cloudRelativePath({ purpose: 'lesson', role: 'program-director', dateKey: '2026-11-03', fileName: 'plan.json' });
  assert.equal(pdLesson.ok, false);
  const pdMedia = cloudRelativePath({ purpose: 'lesson-media', role: 'program-director', dateKey: '2026-11-03', fileName: 'a.mp4' });
  assert.equal(pdMedia.ok, false);
  if (!pdMedia.ok) assert.equal(pdMedia.error, CLOUD_ROLE_MESSAGE);
  assert.equal(cloudRelativePath({ purpose: 'daily-video', role: 'student', dateKey: '2026-11-03', fileName: 'a.mp4' }).ok, false);
});

test('program director daily-video drop needs Plus Cloud and the PD preset, and never opens Cloud reading', () => {
  assert.equal(cloudDailyVideoDrop({ plusCloud: true, kind: 'seat', preset: 'program-director' }), true);
  assert.equal(cloudDailyVideoDrop({ plusCloud: false, kind: 'seat', preset: 'program-director' }), false);
  assert.equal(cloudDailyVideoDrop({ plusCloud: true, kind: 'seat', preset: 'assistant-coach' }), false);
  assert.equal(cloudDailyVideoDrop({ plusCloud: true, kind: 'seat', preset: null }), false);
  assert.deepEqual(cloudMediaAccess({ plusCloud: true, kind: 'seat', preset: 'program-director' }), { read: false, upload: false });
  assert.equal(isDailyVideoCloudPath('videos/daily/2026-11-03/a.mp4'), true);
  assert.equal(isDailyVideoCloudPath('lessons/current/2026-W45/2026-11-03.json'), false);
  assert.equal(isDailyVideoCloudPath('videos/daily/../lessons/x.json'), false);
  assert.match(CLOUD_DAILY_DROP_ONLY, /today's daily videos/);
});

test('the bucket cap defaults to 8 GB and a full upload says so in plain words', () => {
  assert.equal(cloudCapBytes(undefined), DEFAULT_CLOUD_CAP_BYTES);
  assert.equal(cloudCapBytes(''), 8_000_000_000);
  assert.equal(cloudCapBytes('1000'), 1000);
  assert.equal(cloudCapBytes('nope'), DEFAULT_CLOUD_CAP_BYTES);
  assert.equal(DEFAULT_MAX_UPLOAD_BYTES, 512_000_000);
  assert.equal(formatCloudBytes(8_000_000_000), '8 GB');
  assert.deepEqual(cloudUsageFigures(null), [{ value: '…', unit: '', label: 'Advantage Cloud' }]);
  assert.deepEqual(cloudUsageFigures({ phase: 'unbound' }), [{ value: '—', unit: '', label: 'Not connected' }]);
  assert.deepEqual(cloudUsageFigures({ phase: 'error' }), [{ value: '—', unit: '', label: 'Could not check' }]);
  assert.deepEqual(cloudUsageFigures({ phase: 'connected' }), [{ value: '—', unit: '', label: 'Sign in' }]);
  assert.deepEqual(cloudUsageFigures({ phase: 'unavailable' }), [{ value: '—', unit: '', label: 'Not on this license' }]);
  assert.deepEqual(
    cloudUsageFigures({
      phase: 'ready',
      canUpload: true,
      licenseUsedBytes: 96_000_000,
      bucketUsedBytes: 397_000_000,
      capBytes: 8_000_000_000,
    }),
    [
      { value: '96', unit: 'MB', label: 'This license' },
      { value: '397', unit: 'MB', label: 'of 8 GB' },
    ],
  );
  assert.match(cloudUsageLine(1200, 8_000_000_000, 8_000_000_000), /This license is using 1\.2 KB/);
  assert.match(cloudUsageLine(1200, 8_000_000_000, 8_000_000_000), /8 GB of 8 GB/);
  assert.match(cloudFullMessage(8_000_000_000, 8_000_000_000), /Advantage Cloud is full/);
  assert.match(cloudTooLargeMessage(512_000_000), /512 MB/);
  assert.equal(cloudPartPlan(100).mode, 'single');
  assert.equal(cloudPartPlan(CLOUD_CHUNK_PLUS()).mode, 'multipart');
  assert.equal(cloudPartPlan(20, 8).partCount, 3);
});

function CLOUD_CHUNK_PLUS(): number {
  return 8 * 1024 * 1024 + 1;
}

test('Advantage Cloud is an added choice and does not replace Drive, OneDrive, or the phone', () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
  };
  assert.equal(readCloudMediaHome(storage), 'device');
  setCloudUploadReady(false);
  writeCloudMediaHome(storage, 'advantage-cloud');
  assert.equal(cloudUploadSelected(storage), false);
  setCloudUploadReady(true);
  assert.equal(cloudUploadSelected(storage), true);
  writeCloudMediaHome(storage, 'device');
  assert.equal(cloudUploadSelected(storage), false);
  setCloudUploadReady(false);

  assert.match(page, /syncTodayTrainingVideos\(result\.plan, shareDay\)/);
  assert.match(page, /cloudUploadSelected\(\)/);
  assert.match(page, /AdvantageCloudPanel purpose="daily-video"/);
  assert.match(notes, /proSuite: unlimitedPlan && !saveToCloud/);
  assert.match(notes, /scheduleLessonDriveDraft/);
  assert.match(notes, /AdvantageCloudPanel purpose="lesson"/);
  assert.match(sheet, /VIDEO_RECORD_LABEL/);
  assert.match(sheet, /PICK_FROM_DRIVE_LABEL/);
  assert.match(sheet, /VIDEO_LIBRARY_LABEL/);
  assert.match(drive, /Video bytes go only to the gym's Google Drive/);
  assert.match(gallery, /gallery\/approved\//);
  assert.match(gallery, /probe/);
  assert.doesNotMatch(gallery, /createMultipartUpload/);
  assert.match(panel, /if \(!status\?\.cloud\) return null/);
  assert.match(panel, /Upload a video/);
  assert.match(panel, /Upload lesson media/);
  assert.match(panel, /Play/);
  assert.match(panel, /Download/);
  assert.match(panel, /Save this lesson plan/);
  assert.doesNotMatch(panel, /Upgrade|locked|greyed|coming soon/i);
  assert.equal(CLOUD_SAVED_MESSAGE.includes('Advantage Cloud'), true);
});

test('the head instructor home says when Cloud is unbound, connected, or how full it is', async () => {
  const unbound = await loadAdvantageCloudHome(async () => new Response(JSON.stringify({ ok: false, reason: 'unbound' }), { status: 503 }));
  assert.deepEqual(unbound, { phase: 'unbound' });
  assert.match(CLOUD_HOME_UNBOUND, /not connected/);
  assert.doesNotMatch(CLOUD_HOME_UNBOUND, /Coming soon/);

  const connected = await loadAdvantageCloudHome(async (input) => {
    const url = String(input);
    if (url.includes('probe=1')) return new Response(JSON.stringify({ ok: true, bound: true }), { status: 200 });
    return new Response('Sign in required.', { status: 401 });
  });
  assert.deepEqual(connected, { phase: 'connected' });
  assert.match(CLOUD_HOME_CONNECTED, /connected/);
  assert.match(CLOUD_ROLE_HOME, /assistant coach can play and download/i);
  assert.match(CLOUD_ROLE_HOME, /Coach, and Instructors can upload/);

  const memory = new Map<string, string>([['advantage.entitlement.token', 'signed-token']]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    },
  });
  const ready = await loadAdvantageCloudHome(async (input, init) => {
    const url = String(input);
    if (url.includes('probe=1')) return new Response(JSON.stringify({ ok: true, bound: true }), { status: 200 });
    assert.match(String(init?.headers && (init.headers as { authorization?: string }).authorization), /Bearer signed/);
    return new Response(
      JSON.stringify({
        ok: true,
        cloud: true,
        canUpload: true,
        licenseUsedBytes: 1800000,
        bucketUsedBytes: 2400000,
        capBytes: 8000000000,
      }),
      { status: 200 },
    );
  });
  assert.equal(ready.phase, 'ready');
  if (ready.phase === 'ready') {
    assert.equal(ready.licenseUsedBytes, 1800000);
    assert.equal(ready.capBytes, 8000000000);
    assert.match(cloudHomeStatusLine(ready), /1\.8 MB/);
  }

  const refused = await loadAdvantageCloudHome(async (input) => {
    const url = String(input);
    if (url.includes('probe=1')) return new Response(JSON.stringify({ ok: true, bound: true }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, cloud: false }), { status: 200 });
  });
  assert.deepEqual(refused, { phase: 'unavailable' });
  assert.equal(cloudHomeStatusLine(refused), CLOUD_UNAVAILABLE_MESSAGE);
  const unchecked = await loadAdvantageCloudHome(async (input) => {
    const url = String(input);
    if (url.includes('probe=1')) return new Response(JSON.stringify({ ok: true, bound: true }), { status: 200 });
    return new Response(JSON.stringify({ ok: false }), { status: 503 });
  });
  assert.equal(unchecked.phase, 'error');
  assert.equal(cloudHomeStatusLine(unchecked), CLOUD_HOME_ERROR);
  assert.notEqual(cloudHomeStatusLine(unchecked), CLOUD_UNAVAILABLE_MESSAGE);

  const broken = await loadAdvantageCloudHome(async () => {
    throw new Error('offline');
  });
  assert.deepEqual(broken, { phase: 'error' });
  assert.equal(cloudHomeStatusLine(broken), CLOUD_HOME_ERROR);
  assert.doesNotMatch(CLOUD_HOME_ERROR, /connected/);
});

test('a file larger than one part is uploaded in chunks', async () => {
  const calls: { method: string; size: number; url: string }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const body = init?.body;
    const size = body instanceof Blob ? body.size : typeof body === 'string' ? body.length : 0;
    calls.push({ method, size, url });
    if (method === 'POST' && typeof body === 'string' && body.includes('"action":"start"')) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'multipart',
          key: 'groups/lic/videos/daily/2026-11-03/a.mp4',
          path: 'videos/daily/2026-11-03/a.mp4',
          uploadId: 'up-1',
          partSize: 4,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (method === 'PUT') {
      return new Response(JSON.stringify({ ok: true, etag: `etag-${calls.length}` }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await uploadAdvantageCloudFile({
    purpose: 'daily-video',
    dateKey: '2026-11-03',
    file: new Blob([Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9])], { type: 'video/mp4' }),
    fileName: 'a.mp4',
    mime: 'video/mp4',
    token: 'signed-in-token',
    fetcher,
  });
  assert.equal(result.ok, true);
  const puts = calls.filter((call) => call.method === 'PUT');
  assert.deepEqual(puts.map((call) => call.size), [4, 4, 1]);
  assert.equal(puts.every((call) => call.url.includes('op=part')), true);
  assert.equal(calls.some((call) => call.method === 'POST' && call.url.endsWith('/api/gym/cloud') && call.size > 20), true);
});

test('replay Cloud uploads: direct for owner/Coach/Instructors, pending for Assistant coach and Program director', async () => {
  const { cloudReplayUpload, pendingReplayPath, parsePendingReplayPath, cloudObjectKey } = await import('./advantageCloudMedia.ts');
  assert.equal(cloudReplayUpload({ plusCloud: true, kind: 'owner', preset: null }), 'direct');
  assert.equal(cloudReplayUpload({ plusCloud: true, kind: 'seat', preset: 'coach' }), 'direct');
  assert.equal(cloudReplayUpload({ plusCloud: true, kind: 'seat', preset: 'instructors' }), 'direct');
  assert.equal(cloudReplayUpload({ plusCloud: true, kind: 'seat', preset: 'assistant-coach' }), 'pending');
  assert.equal(cloudReplayUpload({ plusCloud: true, kind: 'seat', preset: 'program-director' }), 'pending');
  assert.equal(cloudReplayUpload({ plusCloud: false, kind: 'seat', preset: 'assistant-coach' }), 'none');
  const path = pendingReplayPath('seat-a', '2026-11-04', 'round 2.mp4');
  assert.ok(path);
  assert.deepEqual(parsePendingReplayPath(path!)?.seatId, 'seat-a');
  assert.ok(cloudObjectKey('owner-test', path!));
});

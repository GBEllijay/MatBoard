import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CLOUD_ROLE_MESSAGE,
  CLOUD_SAVED_MESSAGE,
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
  cloudUsageLine,
  formatCloudBytes,
  readCloudMediaHome,
  setCloudUploadReady,
  writeCloudMediaHome,
  cloudUploadSelected,
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
  for (const claims of [owner, code, stripe, locked, seat, coachCode, null]) {
    assert.equal(claimsOpenPlusCloud(claims), proPlusCloudDoorOpen(claims));
  }
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
  const hidden = cloudRelativePath({ purpose: 'daily-video', role: 'program-director', dateKey: '2026-11-03', fileName: 'a.mp4' });
  assert.equal(hidden.ok, false);
  if (!hidden.ok) assert.equal(hidden.error, CLOUD_ROLE_MESSAGE);
});

test('the bucket cap defaults to 8 GB and a full upload says so in plain words', () => {
  assert.equal(cloudCapBytes(undefined), DEFAULT_CLOUD_CAP_BYTES);
  assert.equal(cloudCapBytes(''), 8_000_000_000);
  assert.equal(cloudCapBytes('1000'), 1000);
  assert.equal(cloudCapBytes('nope'), DEFAULT_CLOUD_CAP_BYTES);
  assert.equal(DEFAULT_MAX_UPLOAD_BYTES, 512_000_000);
  assert.equal(formatCloudBytes(8_000_000_000), '8 GB');
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

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PHOTOS_PICK_MAX } from './googlePhotos.ts';
import {
  DAILY_VIDEO_LANE_NOTE,
  GALLERY_ROUTE_NOTE,
  archiveWeekPath,
  lessonWeekId,
  lessonMediaPath,
  routeUpload,
  treeFolderForConsole,
  weeksReadyToArchive,
} from './gymTree.ts';

test('a class photo and a short class video both stay in the gallery', () => {
  const photo = routeUpload({
    purpose: 'gallery',
    role: 'owner',
    kind: 'photo',
    dateKey: '2026-09-28',
    fileName: 'Promotion.jpg',
  });
  const clip = routeUpload({
    purpose: 'gallery',
    role: 'coach',
    kind: 'video',
    dateKey: '2026-09-28',
    fileName: 'stripe.mp4',
  });
  assert.equal(photo.ok, true);
  assert.equal(clip.ok, true);
  if (!photo.ok || !clip.ok) return;
  assert.equal(photo.path, 'gallery/approved/2026-09-28/Promotion.jpg');
  assert.equal(clip.path, 'gallery/approved/2026-09-28/stripe.mp4');
  assert.equal(photo.path.includes('videos/'), false);
  assert.equal(clip.path.includes('videos/'), false);
  assert.equal(clip.purpose, 'gallery');
});

test('approval on holds the gallery file in pending', () => {
  const pending = routeUpload({
    purpose: 'gallery',
    role: 'assistant',
    kind: 'photo',
    dateKey: '2026-09-28',
    fileName: 'class.jpg',
    approvalRequired: true,
  });
  assert.equal(pending.ok, true);
  if (!pending.ok) return;
  assert.equal(pending.lane, 'pending');
  assert.equal(pending.path, 'gallery/pending/2026-09-28/class.jpg');
});

test('students cannot upload into the gallery or the daily video lane', () => {
  const gallery = routeUpload({
    purpose: 'gallery',
    role: 'student',
    kind: 'photo',
    dateKey: '2026-09-28',
    fileName: 'me.jpg',
  });
  const video = routeUpload({
    purpose: 'daily-video',
    role: 'student',
    kind: 'video',
    dateKey: '2026-09-28',
    fileName: 'move.mp4',
  });
  assert.deepEqual(gallery, { ok: false, reason: 'students-no-gallery' });
  assert.deepEqual(video, { ok: false, reason: 'students-no-daily-video' });
});

test('a program director can send to the daily video lane but not lesson plans', () => {
  const daily = routeUpload({
    purpose: 'daily-video',
    role: 'program-director',
    kind: 'video',
    dateKey: '2026-11-04',
    fileName: 'morning drill.mp4',
  });
  assert.equal(daily.ok, true);
  if (daily.ok) assert.match(daily.path, /^videos\/daily\/2026-11-04\//);
  const lesson = routeUpload({
    purpose: 'lesson',
    role: 'program-director',
    kind: 'video',
    dateKey: '2026-11-04',
    fileName: 'plan.json',
  });
  assert.equal(lesson.ok, false);
  const gallery = routeUpload({
    purpose: 'gallery',
    role: 'program-director',
    kind: 'video',
    dateKey: '2026-11-04',
    fileName: 'class.mp4',
    approvalRequired: true,
  });
  assert.equal(gallery.ok, true);
  if (gallery.ok) assert.match(gallery.path, /^gallery\/pending\//);
});

test('a missing purpose does not fall into the last folder', () => {
  const missing = routeUpload({
    purpose: '',
    role: 'owner',
    kind: 'video',
    dateKey: '2026-09-28',
    fileName: 'clip.mp4',
  });
  assert.deepEqual(missing, { ok: false, reason: 'missing-purpose' });
});

test('daily videos, lessons, and student files use their own lanes', () => {
  const daily = routeUpload({
    purpose: 'daily-video',
    role: 'instructor',
    kind: 'video',
    dateKey: '2026-09-28',
    fileName: 'armbar.mp4',
  });
  const lesson = routeUpload({
    purpose: 'lesson',
    role: 'coach',
    kind: 'json',
    dateKey: '2026-09-28',
    fileName: 'ignored.json',
  });
  const film = routeUpload({
    purpose: 'student-file',
    role: 'student',
    kind: 'video',
    dateKey: '2026-09-28',
    fileName: 'knee-slice.mp4',
    studentCode: 'STU-14',
  });
  const assessment = routeUpload({
    purpose: 'student-assessment',
    role: 'student',
    kind: 'json',
    dateKey: '2026-09-28',
    fileName: 'x.json',
    studentCode: 'STU 14',
  });
  assert.equal(daily.ok && daily.path, 'videos/daily/2026-09-28/armbar.mp4');
  assert.equal(lessonWeekId('2026-09-28'), '2026-W40');
  assert.equal(lesson.ok && lesson.path, 'lessons/current/2026-W40/2026-09-28.json');
  assert.equal(lessonMediaPath('2026-09-28', 'armbar demo.mp4'), 'lessons/current/2026-W40/media/2026-09-28/armbar-demo.mp4');
  assert.equal(lessonMediaPath('not-a-date', 'clip.mp4'), null);
  assert.equal(film.ok && film.path, 'students/STU-14/inbox/2026-09-28/knee-slice.mp4');
  assert.equal(assessment.ok && assessment.path, 'students/STU-14/assessments/2026-09-28.json');
  assert.match(GALLERY_ROUTE_NOTE, /gallery/);
  assert.match(DAILY_VIDEO_LANE_NOTE, /videos\/daily/);
});

test('events and pro shop stay on the media tree, and a finished week can archive', () => {
  assert.equal(treeFolderForConsole('shop'), 'pro-shop');
  assert.equal(treeFolderForConsole('events'), 'events');
  assert.equal(treeFolderForConsole('gallery'), 'gallery/approved');
  const shop = routeUpload({
    purpose: 'pro-shop',
    role: 'owner',
    kind: 'photo',
    dateKey: '2026-09-28',
    fileName: 'belt.jpg',
  });
  assert.equal(shop.ok && shop.path, 'pro-shop/belt.jpg');
  assert.deepEqual(weeksReadyToArchive(['2026-W39', '2026-W40'], '2026-09-28'), ['2026-W39']);
  assert.equal(archiveWeekPath('2026-W39'), 'lessons/archive/2026/2026-W39');
});

test('Google Photos albums stay out of the gym tree', () => {
  assert.equal(PHOTOS_PICK_MAX, '50');
  const photos = readFileSync(new URL('./googlePhotos.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(photos, /gallery\/approved|videos\/daily/);
});

test('class photos and student films no longer use the instructor video lane', () => {
  const photos = readFileSync(new URL('./classPhotoPromotions.ts', import.meta.url), 'utf8');
  const films = readFileSync(new URL('./studentDriveCopy.ts', import.meta.url), 'utf8');
  assert.match(photos, /purpose: 'gallery'/);
  assert.doesNotMatch(photos, /publishClassPhotoPromotions/);
  assert.match(films, /purpose: 'student-file'/);
  assert.doesNotMatch(films, /uploadTrainingVideos/);
  assert.match(films, /students do not upload class photos|Students have no gallery upload/i);
});

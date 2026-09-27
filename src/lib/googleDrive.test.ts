import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLASS_HISTORY_EMPTY,
  DRIVE_CONNECT_BODY,
  DRIVE_CONNECT_TITLE,
  DRIVE_SETUP_NEEDED,
  DRIVE_TODAY_EMPTY,
  buildClassHistory,
  buildLessonDocument,
  driveQueryLiteral,
  lessonDriveFileName,
  parseLessonDocument,
  todayDownloadCopy,
  videosOnDay,
  type DriveFileMeta,
} from './googleDrive.ts';
import { emptyPlan } from './trainingNotesStore.ts';

test('lesson file names and Drive queries stay literal', () => {
  assert.equal(lessonDriveFileName('2026-09-27', 'Alex Rivera'), 'advantage-lesson-2026-09-27-alex-rivera.json');
  assert.equal(lessonDriveFileName('2026-09-27', '***'), 'advantage-lesson-2026-09-27-coach.json');
  assert.equal(driveQueryLiteral("O'Brien\\folder"), "O\\'Brien\\\\folder");
  assert.equal(DRIVE_CONNECT_TITLE, 'Connect your Google Drive folder');
  assert.match(DRIVE_CONNECT_BODY, /does not host photos or videos/);
  assert.doesNotMatch(`${DRIVE_CONNECT_TITLE} ${DRIVE_CONNECT_BODY} ${DRIVE_SETUP_NEEDED}`, /client id|oauth/i);
  assert.match(CLASS_HISTORY_EMPTY, /Nothing in this Google Drive folder yet/);
  assert.match(DRIVE_TODAY_EMPTY, /shared gallery or Google Drive/);
});

test('class history groups Drive files and does not invent an empty day', () => {
  const plan = emptyPlan();
  plan.techniques[0].title = 'Armbar';
  plan.techniques[1].title = 'Armbar';
  plan.techniques[2].title = '  ';
  const doc = buildLessonDocument({
    date: '2026-09-27',
    coachName: 'Alex',
    savedAt: 10,
    kind: 'draft',
    distributedAt: null,
    plan,
    media: [],
  });
  assert.equal(parseLessonDocument(doc)?.date, '2026-09-27');
  assert.equal(parseLessonDocument({ advantage: 'other' }), null);
  assert.equal(JSON.stringify(doc).includes('blob'), false);

  const files: DriveFileMeta[] = [
    {
      id: 'lesson-1',
      name: 'advantage-lesson-2026-09-27-alex.json',
      mimeType: 'application/json',
      appProperties: { advantage: 'lesson', date: '2026-09-27' },
    },
    {
      id: 'photo-1',
      name: 'Promotion.jpg',
      mimeType: 'image/jpeg',
      modifiedTime: '2026-09-27T18:00:00.000Z',
      thumbnailLink: 'https://lh3.googleusercontent.com/photo',
      appProperties: { date: '2026-09-27' },
    },
    {
      id: 'video-1',
      name: 'Drill.mp4',
      mimeType: 'video/mp4',
      appProperties: { date: '2026-09-26' },
    },
  ];
  const days = buildClassHistory({
    files,
    lessons: [{ fileId: 'lesson-1', doc }],
  });
  assert.deepEqual(
    days.map((day) => day.date),
    ['2026-09-27', '2026-09-26'],
  );
  assert.deepEqual(days[0].techniques, ['Armbar']);
  assert.equal(days[0].photos[0]?.name, 'Promotion.jpg');
  assert.equal(days[0].photos[0]?.thumbnailLink, 'https://lh3.googleusercontent.com/photo');
  assert.equal(days[0].videos.length, 0);
  assert.equal(days[1].videos[0]?.id, 'video-1');
  assert.deepEqual(videosOnDay(days, '2026-09-26').map((video) => video.label), ['Drill.mp4']);
  assert.deepEqual(videosOnDay(days, '2026-09-01'), []);
  assert.equal(buildClassHistory({ files: [], lessons: [] }).length, 0);
});

test('today download copy stays honest when Drive was not checked', () => {
  assert.match(
    todayDownloadCopy({ galleryStatus: 'ready', galleryCount: 0, driveStatus: 'skipped', driveCount: 0 }),
    /shared gallery for today/,
  );
  assert.match(
    todayDownloadCopy({ galleryStatus: 'ready', galleryCount: 0, driveStatus: 'disconnected', driveCount: 0 }),
    /shared gallery for today/,
  );
  assert.match(
    todayDownloadCopy({ galleryStatus: 'ready', galleryCount: 0, driveStatus: 'needs-sign-in', driveCount: 0 }),
    /Sign in to Google Drive again/,
  );
  assert.match(
    todayDownloadCopy({ galleryStatus: 'ready', galleryCount: 0, driveStatus: 'ready', driveCount: 0 }),
    /shared gallery or Google Drive/,
  );
  assert.match(
    todayDownloadCopy({ galleryStatus: 'ready', galleryCount: 0, driveStatus: 'error', driveCount: 0 }),
    /could not be checked/,
  );
  assert.match(
    todayDownloadCopy({ galleryStatus: 'ready', galleryCount: 1, driveStatus: 'ready', driveCount: 2 }),
    /1 video in the shared gallery and 2 in Google Drive/,
  );
});

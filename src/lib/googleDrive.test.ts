import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CONNECT_COMING_SOON, CONNECT_WITH_BODY, CONNECT_WITH_TITLE } from './cloudStorage.ts';
import {
  CLASS_HISTORY_EMPTY,
  DRIVE_DEV_CLIENT_HINT,
  DRIVE_SETUP_NEEDED,
  DRIVE_SIGN_IN_FAILED,
  DRIVE_TODAY_EMPTY,
  GOOGLE_CLIENT_ID_KEY,
  applyOwnedGoogleClientId,
  buildClassHistory,
  buildLessonDocument,
  classifyDriveAuthDetail,
  driveOwnerFacingError,
  driveQueryLiteral,
  driveSignInFailureCopy,
  lessonDriveFileName,
  parseLessonDocument,
  requestDriveConsent,
  requestDriveToken,
  resolveOwnedGoogleClientId,
  todayDownloadCopy,
  videosOnDay,
  writeDevGoogleClientId,
  type DriveFileMeta,
  type GoogleClientIdStore,
} from './googleDrive.ts';
import { emptyPlan } from './trainingNotesStore.ts';

function memoryStore(initial?: Record<string, string>): GoogleClientIdStore & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

test('lesson file names and Drive queries stay literal', () => {
  assert.equal(lessonDriveFileName('2026-09-27', 'Alex Rivera'), 'advantage-lesson-2026-09-27-alex-rivera.json');
  assert.equal(lessonDriveFileName('2026-09-27', '***'), 'advantage-lesson-2026-09-27-coach.json');
  assert.equal(driveQueryLiteral("O'Brien\\folder"), "O\\'Brien\\\\folder");
  assert.equal(CONNECT_WITH_TITLE, 'Connect with');
  assert.equal(CONNECT_COMING_SOON, 'Coming soon');
  assert.match(CONNECT_WITH_BODY, /does not host photos or videos/);
  assert.match(CONNECT_WITH_BODY, /folder the gym already owns/);
  assert.match(DRIVE_SETUP_NEEDED, /not available on this build yet — contact Advantage/);
  assert.doesNotMatch(
    `${CONNECT_WITH_TITLE} ${CONNECT_WITH_BODY} ${CONNECT_COMING_SOON} ${DRIVE_SETUP_NEEDED} ${DRIVE_SIGN_IN_FAILED} ${DRIVE_DEV_CLIENT_HINT}`,
    /client id|oauth|cloud console|client secret/i,
  );
  assert.match(CLASS_HISTORY_EMPTY, /Nothing in this Google Drive folder yet/);
  assert.match(DRIVE_TODAY_EMPTY, /shared gallery or Google Drive/);
});

test('owned client id comes from the build and a pasted id cannot override it', () => {
  assert.deepEqual(resolveOwnedGoogleClientId({ envValue: ' env-id ', storedValue: 'pasted', dev: false }), {
    clientId: 'env-id',
    discardStored: true,
  });
  assert.deepEqual(resolveOwnedGoogleClientId({ envValue: '', storedValue: 'pasted', dev: false }), {
    clientId: '',
    discardStored: true,
  });
  assert.deepEqual(resolveOwnedGoogleClientId({ envValue: undefined, storedValue: ' pasted ', dev: true }), {
    clientId: 'pasted',
    discardStored: false,
  });
  assert.deepEqual(resolveOwnedGoogleClientId({ envValue: 'env-id', storedValue: 'pasted', dev: true }), {
    clientId: 'env-id',
    discardStored: true,
  });

  const production = memoryStore({ [GOOGLE_CLIENT_ID_KEY]: 'pasted-id' });
  assert.equal(applyOwnedGoogleClientId(production, { envValue: 'company-id', dev: false }), 'company-id');
  assert.equal(production.values.has(GOOGLE_CLIENT_ID_KEY), false);
  writeDevGoogleClientId(production, { envValue: 'company-id', dev: false, value: 'another-paste' });
  assert.equal(production.values.has(GOOGLE_CLIENT_ID_KEY), false);

  const missing = memoryStore({ [GOOGLE_CLIENT_ID_KEY]: 'pasted-id' });
  assert.equal(applyOwnedGoogleClientId(missing, { envValue: '  ', dev: false }), '');
  assert.equal(missing.values.has(GOOGLE_CLIENT_ID_KEY), false);

  const dev = memoryStore();
  writeDevGoogleClientId(dev, { envValue: '', dev: true, value: ' local-dev ' });
  assert.equal(dev.values.get(GOOGLE_CLIENT_ID_KEY), 'local-dev');
  assert.equal(applyOwnedGoogleClientId(dev, { envValue: undefined, dev: true }), 'local-dev');
  assert.equal(dev.values.get(GOOGLE_CLIENT_ID_KEY), 'local-dev');
});

test('sign-in failure stays plain for owners and names the dev hint only when asked', async () => {
  assert.equal(classifyDriveAuthDetail('invalid_client'), 'invalid-client');
  assert.equal(classifyDriveAuthDetail('The OAuth client was not found.'), 'invalid-client');
  assert.equal(classifyDriveAuthDetail('popup_closed'), 'cancelled');
  assert.equal(classifyDriveAuthDetail('access_denied'), 'cancelled');
  assert.equal(
    driveSignInFailureCopy({ code: 'invalid-client', detail: 'invalid_client', dev: false }),
    DRIVE_SIGN_IN_FAILED,
  );
  assert.doesNotMatch(DRIVE_SIGN_IN_FAILED, /client id|oauth|cloud console|invalid_client/i);
  const devCopy = driveSignInFailureCopy({ code: 'invalid-client', detail: 'invalid_client', dev: true });
  assert.match(devCopy, /test user/);
  assert.doesNotMatch(devCopy, /client id|oauth|cloud console/i);
  assert.equal(
    driveOwnerFacingError(new Error('{"error":"invalid_client"}')),
    DRIVE_SIGN_IN_FAILED,
  );
  assert.equal(
    driveOwnerFacingError('Google Drive did not return the new folder.'),
    'Google Drive did not return the new folder.',
  );
  assert.equal(driveOwnerFacingError('Paste a client id from Cloud Console'), 'Google Drive could not be opened.');

  assert.equal(await requestDriveToken('consent'), null);
  const outcome = await requestDriveConsent();
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.code, 'missing-client');
    assert.equal(driveSignInFailureCopy(outcome), DRIVE_SETUP_NEEDED);
  }
});

test('Vite can inline the owned client id', () => {
  const source = readFileSync(new URL('./googleDrive.ts', import.meta.url), 'utf8');
  assert.match(source, /import\.meta\.env\.VITE_GOOGLE_CLIENT_ID/);
  assert.doesNotMatch(source, /import\.meta\.env\?\.VITE_GOOGLE_CLIENT_ID/);
  assert.match(source, /import\.meta\.env\.DEV/);
});

test('connect card does not ask a gym owner for a client id', () => {
  const card = readFileSync(new URL('../components/DriveConnectCard.tsx', import.meta.url), 'utf8');
  const open = readFileSync(new URL('../components/OpenMyDrive.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(card, /Google OAuth|Cloud Console|client secret|<summary>Advanced<\/summary>|client id/i);
  assert.match(card, /import\.meta\.env\.DEV/);
  assert.match(card, /cloudStorageChoices\(/);
  assert.match(card, /CONNECT_COMING_SOON/);
  assert.match(card, /unavailableMessage/);
  assert.doesNotMatch(card, /Connect your Google Drive folder|Connect Google Drive/);
  assert.match(open, /cloudStorage\(/);
  assert.doesNotMatch(open, /client id|oauth|cloud console|client secret/i);
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

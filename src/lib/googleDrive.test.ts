import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, test } from 'node:test';
import { CONNECT_COMING_SOON, CONNECT_WITH_BODY, CONNECT_WITH_TITLE } from './cloudStorage.ts';
import {
  CLASS_HISTORY_EMPTY,
  DATE_BUCKET_NAMES,
  DRIVE_DEV_CLIENT_HINT,
  DRIVE_FOLDER_MIME,
  DRIVE_SCOPES,
  DRIVE_SETUP_NEEDED,
  DRIVE_SIGN_IN_FAILED,
  DRIVE_TODAY_EMPTY,
  GOOGLE_CLIENT_ID_KEY,
  applyOwnedGoogleClientId,
  buildClassHistory,
  buildLessonDocument,
  classifyDriveAuthDetail,
  clearDateFolderCache,
  driveOwnerFacingError,
  driveQueryLiteral,
  driveSignInFailureCopy,
  ensureDateFolderTree,
  findOrCreateChildFolder,
  coachPlanDriveFileName,
  lessonClassFileToken,
  lessonDriveFileName,
  upsertCoachPlanFile,
  loadClassHistory,
  TRAINING_VIDEOS_FOLDER,
  trainingVideoFileName,
  uploadTrainingVideos,
  parseLessonDocument,
  requestDriveConsent,
  requestDriveToken,
  resolveOwnedGoogleClientId,
  todayDownloadCopy,
  upsertLessonFile,
  videosOnDay,
  writeDevGoogleClientId,
  type DriveFileMeta,
  type DriveLessonDocument,
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
  const labeled = emptyPlan();
  labeled.classDesignation = 'GB1';
  labeled.classTime = '5:00 PM';
  assert.equal(
    lessonDriveFileName('2026-09-27', 'Justin', lessonClassFileToken(labeled)),
    `advantage-lesson-2026-09-27-justin-${labeled.id}.json`,
  );
  assert.equal(lessonClassFileToken(emptyPlan()), '');
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
    {
      id: 'coach-plan-1',
      name: 'advantage-coach-plan-2026-09-01-alex.json',
      mimeType: 'application/json',
      appProperties: { advantage: 'coach-plan', date: '2026-09-01', purpose: 'self' },
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
  assert.equal(days.some((day) => day.date === '2026-09-01'), false);
  assert.equal(buildClassHistory({ files: [], lessons: [] }).length, 0);
});

test('Drive scopes stay file and readonly', () => {
  assert.equal(
    DRIVE_SCOPES,
    ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.readonly'].join(' '),
  );
});

type StoredDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appProperties?: Record<string, string>;
  content?: string;
};

function unescapeDriveLiteral(value: string): string {
  return value.replace(/\\\\/g, '\\').replace(/\\'/g, "'");
}

function fileMatchesQuery(file: StoredDriveFile, query: string): boolean {
  const nameMatch = query.match(/name='((?:\\'|[^'])*)'/);
  if (nameMatch && file.name !== unescapeDriveLiteral(nameMatch[1])) return false;
  const mimeMatch = query.match(/mimeType='([^']*)'/);
  if (mimeMatch && file.mimeType !== mimeMatch[1]) return false;
  const parents = [...query.matchAll(/'((?:\\'|[^'])*)' in parents/g)].map((match) => unescapeDriveLiteral(match[1]));
  if (parents.length > 0 && !parents.some((id) => file.parents.includes(id))) return false;
  if (query.includes('appProperties has')) {
    const prop = query.match(/appProperties has \{ key='([^']+)' and value='((?:\\'|[^'])*)' \}/);
    if (!prop) return false;
    if (file.appProperties?.[prop[1]] !== unescapeDriveLiteral(prop[2])) return false;
  }
  return true;
}

function readMultipart(body: string): string[] {
  const boundary = body.split('\r\n', 1)[0]?.replace(/^--/, '') ?? '';
  if (!boundary) return [];
  return body
    .split(`--${boundary}`)
    .slice(1, -1)
    .map((segment) => {
      const text = segment.replace(/^\r\n/, '').replace(/\r\n$/, '');
      const splitAt = text.indexOf('\r\n\r\n');
      if (splitAt < 0) return '';
      return text.slice(splitAt + 4).replace(/\r\n$/, '');
    });
}

function createFakeDrive(prefix: string) {
  let seq = 1;
  const files: StoredDriveFile[] = [];
  const calls: { method: string; url: string; body: string; uploadLength: string | null }[] = [];
  const sessions = new Map<string, { metadata: Record<string, unknown>; existingId: string; fail: boolean }>();
  const fetcher: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const rawBody = init?.body;
    const body = typeof rawBody === 'string' ? rawBody : rawBody instanceof Blob ? await rawBody.text() : '';
    const headers = new Headers(init?.headers);
    calls.push({
      method,
      url,
      body,
      uploadLength: headers.get('X-Upload-Content-Length'),
    });
    if (method === 'PUT' && url.includes('/sessions/')) {
      const sessionId = decodeURIComponent(url.split('/sessions/')[1]?.split('?')[0] ?? '');
      const session = sessions.get(sessionId);
      if (!session) return new Response('missing session', { status: 404 });
      if (session.fail) return new Response('upload failed', { status: 500 });
      const metadata = session.metadata as {
        name?: string;
        mimeType?: string;
        parents?: string[];
        appProperties?: Record<string, string>;
      };
      if (session.existingId) {
        const file = files.find((item) => item.id === session.existingId);
        if (!file) return new Response('missing', { status: 404 });
        if (metadata.name) file.name = metadata.name;
        if (metadata.mimeType) file.mimeType = metadata.mimeType;
        if (metadata.appProperties) file.appProperties = metadata.appProperties;
        file.content = body;
        return Response.json({ id: file.id });
      }
      const created: StoredDriveFile = {
        id: `${prefix}-${seq}`,
        name: metadata.name ?? 'untitled',
        mimeType: metadata.mimeType ?? 'application/octet-stream',
        parents: metadata.parents ?? [],
        appProperties: metadata.appProperties,
        content: body,
      };
      seq += 1;
      files.push(created);
      return Response.json({ id: created.id });
    }
    if (url.includes('uploadType=resumable')) {
      const metadata = JSON.parse(body || '{}') as {
        name?: string;
        mimeType?: string;
        parents?: string[];
        appProperties?: Record<string, string>;
      };
      const existingId = method === 'PATCH' ? decodeURIComponent(url.match(/\/files\/([^/?]+)/)?.[1] ?? '') : '';
      const sessionId = `${prefix}-session-${seq}`;
      seq += 1;
      sessions.set(sessionId, {
        metadata,
        existingId,
        fail: (metadata.name ?? '').toLowerCase().includes('failvideo'),
      });
      return new Response('{}', {
        status: 200,
        headers: { Location: `https://www.googleapis.com/upload/drive/v3/files/sessions/${sessionId}` },
      });
    }
    if (url.includes('/upload/drive/v3/files')) {
      const parts = readMultipart(body);
      const metadata = JSON.parse(parts[0] || '{}') as {
        name?: string;
        mimeType?: string;
        parents?: string[];
        appProperties?: Record<string, string>;
      };
      if (method === 'PATCH') {
        const id = decodeURIComponent(url.match(/\/files\/([^/?]+)/)?.[1] ?? '');
        const file = files.find((item) => item.id === id);
        if (!file) return new Response('missing', { status: 404 });
        if (metadata.name) file.name = metadata.name;
        if (metadata.mimeType) file.mimeType = metadata.mimeType;
        if (metadata.appProperties) file.appProperties = metadata.appProperties;
        file.content = parts[1] ?? '';
        const params = new URL(url).searchParams;
        const addParents = params.get('addParents');
        const removeParents = params.get('removeParents');
        if (addParents) {
          for (const parentId of addParents.split(',')) {
            if (parentId && !file.parents.includes(parentId)) file.parents.push(parentId);
          }
        }
        if (removeParents) {
          const remove = new Set(removeParents.split(','));
          file.parents = file.parents.filter((parentId) => !remove.has(parentId));
        }
        return Response.json({ id: file.id });
      }
      const created: StoredDriveFile = {
        id: `${prefix}-${seq}`,
        name: metadata.name ?? 'untitled',
        mimeType: metadata.mimeType ?? 'application/json',
        parents: metadata.parents ?? [],
        appProperties: metadata.appProperties,
        content: parts[1] ?? '',
      };
      seq += 1;
      files.push(created);
      return Response.json({ id: created.id });
    }
    if (url.includes('/revisions')) return Response.json({ revisions: [{ id: 'rev-1' }] });
    if (url.includes('alt=media')) {
      const id = decodeURIComponent(url.match(/\/files\/([^/?]+)/)?.[1] ?? '');
      const file = files.find((item) => item.id === id);
      if (!file?.content) return new Response('missing', { status: 404 });
      return new Response(file.content, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (method === 'POST' && url.includes('/drive/v3/files')) {
      const metadata = JSON.parse(body) as {
        name?: string;
        mimeType?: string;
        parents?: string[];
        appProperties?: Record<string, string>;
      };
      const created: StoredDriveFile = {
        id: `${prefix}-${seq}`,
        name: metadata.name ?? 'untitled',
        mimeType: metadata.mimeType ?? DRIVE_FOLDER_MIME,
        parents: metadata.parents ?? [],
        appProperties: metadata.appProperties,
      };
      seq += 1;
      files.push(created);
      return Response.json({ id: created.id, name: created.name });
    }
    if (method === 'GET' && url.includes('/drive/v3/files')) {
      const params = new URL(url).searchParams;
      const query = params.get('q') ?? '';
      const pageSize = Number(params.get('pageSize') ?? '100');
      const matched = files.filter((file) => fileMatchesQuery(file, query)).slice(0, pageSize);
      return Response.json({
        files: matched.map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          appProperties: file.appProperties,
        })),
      });
    }
    return new Response(`unhandled ${method} ${url}`, { status: 500 });
  };
  return {
    files,
    calls,
    fetcher,
    seed(file: StoredDriveFile) {
      files.push(file);
    },
  };
}

function lessonDoc(kind: DriveLessonDocument['kind'], savedAt: number, title: string): DriveLessonDocument {
  const plan = emptyPlan();
  plan.techniques[0].title = title;
  return buildLessonDocument({
    date: '2026-09-28',
    coachName: 'Alex Rivera',
    savedAt,
    kind,
    distributedAt: kind === 'distribution' ? savedAt : null,
    plan,
    media: [],
  });
}

describe('date folder tree', { concurrency: false }, () => {
  beforeEach(() => {
    clearDateFolderCache();
  });

  test('date buckets stay the locked six names', () => {
    assert.deepEqual(
      [...DATE_BUCKET_NAMES],
      ['lesson-plans', 'training-videos', 'technique-trees', 'class-photos', 'roster', 'tournament-results'],
    );
  });

  test('findOrCreateChildFolder reuses an existing folder and remembers it', async () => {
    const drive = createFakeDrive('find');
    drive.seed({
      id: 'find-existing',
      name: 'lesson-plans',
      mimeType: DRIVE_FOLDER_MIME,
      parents: ['parent-find'],
    });
    const first = await findOrCreateChildFolder('token', 'parent-find', 'lesson-plans', drive.fetcher);
    assert.equal(first.id, 'find-existing');
    assert.equal(
      drive.calls.filter((call) => call.method === 'POST').length,
      0,
    );
    const afterLookup = drive.calls.length;
    const second = await findOrCreateChildFolder('token', 'parent-find', 'lesson-plans', drive.fetcher);
    assert.equal(second.id, 'find-existing');
    assert.equal(drive.calls.length, afterLookup);
  });

  test('findOrCreateChildFolder creates one folder when parallel callers miss', async () => {
    const drive = createFakeDrive('create');
    const [first, second] = await Promise.all([
      findOrCreateChildFolder('token', 'parent-create', 'roster', drive.fetcher),
      findOrCreateChildFolder('token', 'parent-create', 'roster', drive.fetcher),
    ]);
    assert.equal(first.id, second.id);
    const posts = drive.calls.filter((call) => call.method === 'POST');
    assert.equal(posts.length, 1);
    const body = JSON.parse(posts[0]?.body ?? '{}') as { name?: string; mimeType?: string; parents?: string[] };
    assert.equal(body.name, 'roster');
    assert.equal(body.mimeType, DRIVE_FOLDER_MIME);
    assert.deepEqual(body.parents, ['parent-create']);
  });

  test('ensureDateFolderTree creates the date folder and six buckets once', async () => {
    const drive = createFakeDrive('tree');
    const tree = await ensureDateFolderTree({
      token: 'token',
      rootFolderId: 'root-tree',
      dateKey: '2026-09-28',
      fetcher: drive.fetcher,
    });
    const dateFolder = drive.files.find((file) => file.id === tree.dateFolderId);
    assert.equal(dateFolder?.name, '2026-09-28');
    assert.equal(dateFolder?.mimeType, DRIVE_FOLDER_MIME);
    assert.deepEqual(dateFolder?.parents, ['root-tree']);
    for (const name of DATE_BUCKET_NAMES) {
      const child = drive.files.find((file) => file.id === tree.folders[name]);
      assert.equal(child?.name, name);
      assert.equal(child?.mimeType, DRIVE_FOLDER_MIME);
      assert.deepEqual(child?.parents, [tree.dateFolderId]);
    }
    assert.equal(
      drive.calls.filter((call) => call.method === 'POST').length,
      7,
    );
    const again = await ensureDateFolderTree({
      token: 'token',
      rootFolderId: 'root-tree',
      dateKey: '2026-09-28',
      fetcher: drive.fetcher,
    });
    assert.equal(again.dateFolderId, tree.dateFolderId);
    assert.deepEqual(again.folders, tree.folders);
    assert.equal(
      drive.calls.filter((call) => call.method === 'POST').length,
      7,
    );
  });

  test('ensureDateFolderTree fills only the buckets that are missing', async () => {
    const drive = createFakeDrive('partial');
    drive.seed({
      id: 'partial-date',
      name: '2026-09-28',
      mimeType: DRIVE_FOLDER_MIME,
      parents: ['root-partial'],
    });
    drive.seed({
      id: 'partial-plans',
      name: 'lesson-plans',
      mimeType: DRIVE_FOLDER_MIME,
      parents: ['partial-date'],
    });
    const tree = await ensureDateFolderTree({
      token: 'token',
      rootFolderId: 'root-partial',
      dateKey: '2026-09-28',
      fetcher: drive.fetcher,
    });
    assert.equal(tree.dateFolderId, 'partial-date');
    assert.equal(tree.folders['lesson-plans'], 'partial-plans');
    const created = drive.calls
      .filter((call) => call.method === 'POST')
      .map((call) => (JSON.parse(call.body) as { name?: string }).name)
      .sort();
    assert.deepEqual(
      created,
      DATE_BUCKET_NAMES.filter((name) => name !== 'lesson-plans').sort(),
    );
  });

  test('ensureDateFolderTree rejects a date that is not a local date key', async () => {
    const drive = createFakeDrive('baddate');
    await assert.rejects(
      () =>
        ensureDateFolderTree({
          token: 'token',
          rootFolderId: 'root-bad',
          dateKey: '09-28-2026',
          fetcher: drive.fetcher,
        }),
      /YYYY-MM-DD/,
    );
    assert.equal(drive.calls.length, 0);
  });

  test('upsertLessonFile writes the lesson into lesson-plans and tags coach and time', async () => {
    const drive = createFakeDrive('upsert');
    const saved = await upsertLessonFile({
      token: 'token',
      folderId: 'root-upsert',
      document: lessonDoc('draft', 1_700_000_000_000, 'Armbar'),
      fetcher: drive.fetcher,
    });
    const lessons = drive.files.filter((file) => file.name.startsWith('advantage-lesson-'));
    assert.equal(lessons.length, 1);
    const lesson = lessons[0];
    assert.ok(lesson);
    assert.equal(lesson.id, saved.fileId);
    assert.equal(lesson.name, 'advantage-lesson-2026-09-28-alex-rivera.json');
    const plansId = drive.files.find((file) => file.name === 'lesson-plans')?.id;
    assert.ok(plansId);
    assert.deepEqual(lesson.parents, [plansId]);
    assert.equal(lesson.parents.includes('root-upsert'), false);
    assert.deepEqual(lesson.appProperties, {
      advantage: 'lesson',
      date: '2026-09-28',
      coach: 'Alex Rivera',
      coachName: 'Alex Rivera',
      savedAt: '1700000000000',
      kind: 'draft',
    });
    const parsed = JSON.parse(lesson.content ?? '{}') as DriveLessonDocument;
    assert.equal(parsed.coachName, 'Alex Rivera');
    assert.equal(parsed.savedAt, 1_700_000_000_000);
    assert.equal(parsed.kind, 'draft');
    assert.equal(
      drive.calls.some((call) => {
        if (call.method !== 'GET') return false;
        const query = new URL(call.url).searchParams.get('q') ?? '';
        return query.includes(lesson.name) && query.includes(`'${plansId}' in parents`);
      }),
      true,
    );
    const created = drive.calls.find((call) => call.method === 'POST' && call.url.includes('/upload/'));
    assert.match(created?.body ?? '', new RegExp(`"parents":\\["${plansId}"\\]`));

    const again = await upsertLessonFile({
      token: 'token',
      folderId: 'root-upsert',
      document: lessonDoc('distribution', 1_700_000_000_100, 'Armbar'),
      fetcher: drive.fetcher,
    });
    assert.equal(again.fileId, saved.fileId);
    assert.equal(drive.files.filter((file) => file.name.startsWith('advantage-lesson-')).length, 1);
    assert.equal(lesson.appProperties?.kind, 'distribution');
    assert.equal(lesson.appProperties?.savedAt, '1700000000100');
    assert.equal(JSON.parse(lesson.content ?? '{}').kind, 'distribution');
    const patches = drive.calls.filter((call) => call.method === 'PATCH');
    assert.equal(patches.length, 1);
    assert.equal(patches[0]?.url.includes('addParents'), false);
  });

  test('upsertLessonFile moves a flat root lesson into lesson-plans', async () => {
    const drive = createFakeDrive('move');
    const name = 'advantage-lesson-2026-09-28-alex-rivera.json';
    drive.seed({
      id: 'move-legacy',
      name,
      mimeType: 'application/json',
      parents: ['root-move'],
      appProperties: { advantage: 'lesson', date: '2026-09-28', coach: 'Alex Rivera' },
      content: '{}',
    });
    const saved = await upsertLessonFile({
      token: 'token',
      folderId: 'root-move',
      document: lessonDoc('distribution', 50, 'Sweep'),
      fetcher: drive.fetcher,
    });
    assert.equal(saved.fileId, 'move-legacy');
    const plansId = drive.files.find((file) => file.name === 'lesson-plans')?.id;
    assert.ok(plansId);
    const lesson = drive.files.find((file) => file.id === 'move-legacy');
    assert.deepEqual(lesson?.parents, [plansId]);
    assert.equal(lesson?.appProperties?.kind, 'distribution');
    assert.equal(lesson?.appProperties?.coachName, 'Alex Rivera');
    assert.equal(lesson?.appProperties?.savedAt, '50');
    const patch = drive.calls.find((call) => call.method === 'PATCH');
    assert.ok(patch);
    const params = new URL(patch.url).searchParams;
    assert.equal(params.get('addParents'), plansId);
    assert.equal(params.get('removeParents'), 'root-move');
    assert.equal(drive.files.filter((file) => file.name === name).length, 1);
  });

  test('overlapping draft and distribution saves share one lesson file', async () => {
    const drive = createFakeDrive('race');
    const [draft, shared] = await Promise.all([
      upsertLessonFile({
        token: 'token',
        folderId: 'root-race',
        document: lessonDoc('draft', 10, 'Armbar'),
        fetcher: drive.fetcher,
      }),
      upsertLessonFile({
        token: 'token',
        folderId: 'root-race',
        document: lessonDoc('distribution', 11, 'Armbar'),
        fetcher: drive.fetcher,
      }),
    ]);
    assert.equal(draft.fileId, shared.fileId);
    const lessons = drive.files.filter((file) => file.mimeType === 'application/json');
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0]?.appProperties?.kind, 'distribution');
    assert.equal(lessons[0]?.appProperties?.savedAt, '11');
    assert.equal(drive.files.filter((file) => file.name === '2026-09-28').length, 1);
    for (const bucket of DATE_BUCKET_NAMES) {
      const folders = drive.files.filter((file) => file.name === bucket);
      assert.equal(folders.length, 1);
      assert.equal(folders[0]?.parents[0], drive.files.find((file) => file.name === '2026-09-28')?.id);
    }
  });

  test('a labeled class plan keeps its own lesson file and the new fields', async () => {
    const drive = createFakeDrive('class');
    const first = emptyPlan();
    first.coachName = 'Justin';
    first.classDesignation = 'GB1';
    first.classTime = '5:00 PM';
    first.intro = 'Guard';
    const second = emptyPlan();
    second.coachName = 'Justin';
    second.classDesignation = 'GB2';
    second.classTime = '6:00 PM';
    second.intro = 'Mount';
    const gb1 = buildLessonDocument({
      date: '2026-09-28',
      coachName: 'Justin',
      savedAt: 10,
      kind: 'draft',
      distributedAt: null,
      plan: first,
      media: [],
    });
    const gb2 = buildLessonDocument({
      date: '2026-09-28',
      coachName: 'Justin',
      savedAt: 11,
      kind: 'draft',
      distributedAt: null,
      plan: second,
      media: [],
    });
    await upsertLessonFile({
      token: 'token',
      folderId: 'root-class',
      document: gb1,
      fetcher: drive.fetcher,
    });
    await upsertLessonFile({
      token: 'token',
      folderId: 'root-class',
      document: gb2,
      fetcher: drive.fetcher,
    });
    const lessons = drive.files.filter((file) => file.name.startsWith('advantage-lesson-'));
    assert.equal(lessons.length, 2);
    const names = lessons.map((file) => file.name).sort();
    assert.deepEqual(names, [
      `advantage-lesson-2026-09-28-justin-${first.id}.json`,
      `advantage-lesson-2026-09-28-justin-${second.id}.json`,
    ].sort());
    const parsed = lessons.map((file) => JSON.parse(file.content ?? '{}') as DriveLessonDocument);
    assert.equal(parsed.find((doc) => doc.plan.id === first.id)?.plan.classDesignation, 'GB1');
    assert.equal(parsed.find((doc) => doc.plan.id === first.id)?.plan.classTime, '5:00 PM');
    assert.equal(parsed.find((doc) => doc.plan.id === second.id)?.plan.classTime, '6:00 PM');
    const plansId = drive.files.find((file) => file.name === 'lesson-plans')?.id;
    assert.ok(plansId);
    assert.ok(lessons.every((file) => file.parents[0] === plansId));
  });

  test('class history keeps flat root files and reads lesson-plans children', async () => {
    const drive = createFakeDrive('history');
    const rootLesson = lessonDoc('draft', 1, 'Root sweep');
    const nestedLesson = lessonDoc('draft', 2, 'Nested armbar');
    drive.seed({
      id: 'hist-date',
      name: '2026-09-28',
      mimeType: DRIVE_FOLDER_MIME,
      parents: ['root-history'],
    });
    drive.seed({
      id: 'hist-plans',
      name: 'lesson-plans',
      mimeType: DRIVE_FOLDER_MIME,
      parents: ['hist-date'],
    });
    drive.seed({
      id: 'hist-root-lesson',
      name: 'advantage-lesson-2026-09-28-legacy.json',
      mimeType: 'application/json',
      parents: ['root-history'],
      appProperties: { advantage: 'lesson', date: '2026-09-28' },
      content: JSON.stringify(rootLesson),
    });
    drive.seed({
      id: 'hist-nested-lesson',
      name: 'advantage-lesson-2026-09-28-alex-rivera.json',
      mimeType: 'application/json',
      parents: ['hist-plans'],
      appProperties: { advantage: 'lesson', date: '2026-09-28' },
      content: JSON.stringify(nestedLesson),
    });
    drive.seed({
      id: 'hist-root-video',
      name: 'Root.mp4',
      mimeType: 'video/mp4',
      parents: ['root-history'],
      appProperties: { date: '2026-09-28' },
    });
    drive.seed({
      id: 'hist-nested-video',
      name: 'Nested.mp4',
      mimeType: 'video/mp4',
      parents: ['hist-plans'],
      appProperties: { date: '2026-09-28' },
    });
    const days = await loadClassHistory('token', 'root-history', drive.fetcher);
    const today = days.find((day) => day.date === '2026-09-28');
    assert.deepEqual(today?.techniques, ['Root sweep', 'Nested armbar']);
    assert.deepEqual(
      videosOnDay(days, '2026-09-28').map((video) => video.label),
      ['Root.mp4', 'Nested.mp4'],
    );
  });

  test('class history still lists a flat root video when the date walk fails', async () => {
    const drive = createFakeDrive('fallback');
    drive.seed({
      id: 'fallback-date',
      name: '2026-09-28',
      mimeType: DRIVE_FOLDER_MIME,
      parents: ['root-fallback'],
    });
    drive.seed({
      id: 'fallback-video',
      name: 'Root.mp4',
      mimeType: 'video/mp4',
      parents: ['root-fallback'],
      appProperties: { date: '2026-09-28' },
    });
    let lists = 0;
    const fetcher: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET' && url.includes('q=')) {
        lists += 1;
        if (lists > 1) return new Response('nope', { status: 500 });
      }
      return drive.fetcher(input, init);
    };
    const days = await loadClassHistory('token', 'root-fallback', fetcher);
    assert.deepEqual(
      videosOnDay(days, '2026-09-28').map((video) => video.id),
      ['fallback-video'],
    );
  });

  test('class history does not walk children when the root has no date folder', async () => {
    const drive = createFakeDrive('flat');
    drive.seed({
      id: 'flat-video',
      name: 'Flat.mp4',
      mimeType: 'video/mp4',
      parents: ['root-flat'],
      appProperties: { date: '2026-09-28' },
    });
    const days = await loadClassHistory('token', 'root-flat', drive.fetcher);
    assert.deepEqual(
      videosOnDay(days, '2026-09-28').map((video) => video.label),
      ['Flat.mp4'],
    );
    assert.equal(drive.calls.filter((call) => call.url.includes('q=')).length, 1);
  });

  test('class history lists a video stored in the date training-videos folder', async () => {
    const drive = createFakeDrive('train');
    drive.seed({
      id: 'train-date',
      name: '2026-09-28',
      mimeType: DRIVE_FOLDER_MIME,
      parents: ['root-train'],
    });
    drive.seed({
      id: 'train-videos',
      name: 'training-videos',
      mimeType: DRIVE_FOLDER_MIME,
      parents: ['train-date'],
    });
    drive.seed({
      id: 'train-clip',
      name: 'Armbar.mp4',
      mimeType: 'video/mp4',
      parents: ['train-videos'],
      appProperties: { advantage: 'training-video', date: '2026-09-28', localClipId: 'clip-1' },
    });
    const days = await loadClassHistory('token', 'root-train', drive.fetcher);
    assert.deepEqual(
      videosOnDay(days, '2026-09-28').map((video) => video.label),
      ['Armbar.mp4'],
    );
  });

  test('uploadTrainingVideos writes bytes into training-videos and retries the same file', async () => {
    const drive = createFakeDrive('upload');
    const marker = 'VIDEO-BYTES-MARKER';
    const progress: number[] = [];
    const video = {
      localClipId: 'clip-armbar',
      name: 'Armbar.mp4',
      mime: 'video/mp4',
      bytes: new Blob([marker]),
      section: 'technique' as const,
      index: 0,
    };
    const [first] = await uploadTrainingVideos({
      token: 'token',
      rootFolderId: 'root-upload',
      dateKey: '2026-09-28',
      videos: [video],
      fetcher: drive.fetcher,
      onProgress: (done) => progress.push(done),
    });
    assert.equal(first?.failed, false);
    assert.ok(first?.driveFileId);
    const videosFolder = drive.files.find((file) => file.name === TRAINING_VIDEOS_FOLDER);
    assert.ok(videosFolder);
    const stored = drive.files.find((file) => file.id === first?.driveFileId);
    assert.equal(stored?.parents[0], videosFolder?.id);
    assert.equal(stored?.mimeType, 'video/mp4');
    assert.equal(stored?.content, marker);
    assert.equal(stored?.appProperties?.advantage, 'training-video');
    assert.equal(stored?.appProperties?.localClipId, 'clip-armbar');
    assert.equal(stored?.appProperties?.date, '2026-09-28');
    assert.equal(
      stored?.name,
      trainingVideoFileName('2026-09-28', 'clip-armbar', 'video/mp4', 'Armbar.mp4'),
    );
    assert.deepEqual(progress, [0, 1]);
    const init = drive.calls.find((call) => call.url.includes('uploadType=resumable'));
    assert.ok(init);
    assert.match(init.url, /^https:\/\/www\.googleapis\.com\/upload\/drive\//);
    assert.equal(init.uploadLength, String(video.bytes.size));
    assert.equal(
      drive.calls.some((call) => /advantage|matboard/i.test(new URL(call.url).host)),
      false,
    );

    const lesson = await upsertLessonFile({
      token: 'token',
      folderId: 'root-upload',
      document: buildLessonDocument({
        date: '2026-09-28',
        coachName: 'Alex Rivera',
        savedAt: 5,
        kind: 'draft',
        distributedAt: null,
        plan: emptyPlan(),
        media: [
          {
            section: 'technique',
            index: 0,
            localClipId: 'clip-armbar',
            driveFileId: first?.driveFileId ?? null,
            name: 'Armbar.mp4',
            mime: 'video/mp4',
          },
        ],
      }),
      fetcher: drive.fetcher,
    });
    const lessonFile = drive.files.find((file) => file.id === lesson.fileId);
    assert.equal(lessonFile?.content?.includes(marker), false);
    assert.match(lessonFile?.content ?? '', /clip-armbar/);

    const renamed = { ...video, name: 'Armbar updated.mp4', bytes: new Blob([`${marker}-2`]) };
    const [again] = await uploadTrainingVideos({
      token: 'token',
      rootFolderId: 'root-upload',
      dateKey: '2026-09-28',
      videos: [renamed],
      fetcher: drive.fetcher,
    });
    assert.equal(again?.driveFileId, first?.driveFileId);
    assert.equal(
      drive.files.filter((file) => file.appProperties?.advantage === 'training-video').length,
      1,
    );
    assert.equal(stored?.content, `${marker}-2`);
    const patch = drive.calls.find((call) => call.method === 'PATCH' && call.url.includes('uploadType=resumable'));
    assert.ok(patch);
  });

  test('one video failure still uploads the rest', async () => {
    const drive = createFakeDrive('partial-video');
    const results = await uploadTrainingVideos({
      token: 'token',
      rootFolderId: 'root-partial-video',
      dateKey: '2026-09-28',
      videos: [
        {
          localClipId: 'clip-ok',
          name: 'Sweep.mp4',
          mime: 'video/mp4',
          bytes: new Blob(['ok-bytes']),
          section: 'warmup',
          index: null,
        },
        {
          localClipId: 'clip-bad',
          name: 'FAILVIDEO.mp4',
          mime: 'video/mp4',
          bytes: new Blob(['bad-bytes']),
          section: 'technique',
          index: 0,
        },
      ],
      fetcher: drive.fetcher,
    });
    assert.equal(results[0]?.failed, false);
    assert.ok(results[0]?.driveFileId);
    assert.equal(results[1]?.failed, true);
    assert.equal(results[1]?.driveFileId, null);
    assert.equal(drive.files.find((file) => file.id === results[0]?.driveFileId)?.content, 'ok-bytes');
    assert.equal(
      drive.files.some((file) => file.content === 'bad-bytes'),
      false,
    );
  });

  test('upsertCoachPlanFile writes plan text and not an instructor lesson or a video', async () => {
    const drive = createFakeDrive('coachplan');
    const plan = emptyPlan();
    plan.coachName = 'Alex Rivera';
    plan.intro = 'Grip fight';
    plan.techniques[0].title = 'Armbar';
    const saved = await upsertCoachPlanFile({
      token: 'token',
      folderId: 'root-coach',
      document: {
        advantage: 'coach-plan',
        version: 1,
        date: '2026-09-30',
        coachName: 'Alex Rivera',
        savedAt: 20,
        purpose: 'self',
        plan,
      },
      fetcher: drive.fetcher,
    });
    const records = drive.files.filter((file) => file.name.startsWith('advantage-coach-plan-'));
    assert.equal(records.length, 1);
    const record = records[0];
    assert.ok(record);
    assert.equal(record.id, saved.fileId);
    assert.equal(record.name, coachPlanDriveFileName('2026-09-30', 'Alex Rivera'));
    assert.equal(record.appProperties?.advantage, 'coach-plan');
    assert.equal(record.appProperties?.purpose, 'self');
    assert.equal(record.appProperties?.kind, undefined);
    const body = JSON.parse(record.content ?? '{}') as { purpose?: string; plan?: { intro?: string }; media?: unknown };
    assert.equal(body.purpose, 'self');
    assert.equal(body.plan?.intro, 'Grip fight');
    assert.equal(body.media, undefined);
    assert.equal(JSON.stringify(body).includes('blob'), false);
    assert.equal(JSON.stringify(body).includes('distribution'), false);
    assert.equal(drive.files.some((file) => file.name.startsWith('advantage-lesson-')), false);
    assert.equal(drive.files.some((file) => file.mimeType.startsWith('video/')), false);
    const plansId = drive.files.find((file) => file.name === 'lesson-plans')?.id;
    assert.ok(plansId);
    assert.deepEqual(record.parents, [plansId]);
  });
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

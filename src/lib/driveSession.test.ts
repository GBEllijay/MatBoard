import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { saveStudentDriveLink } from './academyPathway.ts';
import {
  DRIVE_FILE_LIST_DB_NAMES,
  clearDriveIndexedFileLists,
  disconnectGoogleDrive,
  isDriveFileListDatabase,
  isDriveFileListStorageKey,
} from './driveSession.ts';
import {
  DRIVE_BINDING_KEY,
  DRIVE_CHANGE_FOLDER_LABEL,
  DRIVE_DISCONNECT_CONFIRM,
  DRIVE_DISCONNECT_LABEL,
  DRIVE_FOLDER_UP_LABEL,
  findOrCreateChildFolder,
  openDriveChangeFolder,
  listDriveFolderLevel,
} from './googleDrive.ts';
import { LESSON_DRIVE_QUEUE_KEY } from './lessonDrive.ts';
import { STORAGE_KEY as ROSTER_KEY } from './rosterStore.ts';
import { STUDENT_EDITION_STORAGE_KEY } from './studentEdition.ts';
import { TRAINING_NOTES_STORAGE_KEY } from './trainingNotesStore.ts';

const FOLDER = 'application/vnd.google-apps.folder';

type MemStore = {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function memoryStore(): MemStore {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

function installBrowser() {
  const local = memoryStore();
  const session = memoryStore();
  const previous = {
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    window: globalThis.window,
    indexedDB: globalThis.indexedDB,
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session });
  return {
    local,
    session,
    restore() {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous.localStorage });
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: previous.sessionStorage });
      Object.defineProperty(globalThis, 'window', { configurable: true, value: previous.window });
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: previous.indexedDB });
    },
  };
}

test('Drive file-list caches are named apart from local app data', () => {
  assert.equal(isDriveFileListStorageKey('matboard.pro.googleDriveFiles.v1'), true);
  assert.equal(isDriveFileListStorageKey('matboard.drive.cache.gym-folder'), true);
  assert.equal(isDriveFileListStorageKey(TRAINING_NOTES_STORAGE_KEY), false);
  assert.equal(isDriveFileListStorageKey(ROSTER_KEY), false);
  assert.equal(isDriveFileListStorageKey(STUDENT_EDITION_STORAGE_KEY), false);
  assert.equal(isDriveFileListStorageKey(LESSON_DRIVE_QUEUE_KEY), false);
  assert.equal(isDriveFileListStorageKey('matboard.pro.googleClientId'), false);
  assert.equal(isDriveFileListStorageKey('matboard.pro.oneDriveFolder.v1'), false);
  assert.equal(isDriveFileListStorageKey('matboard.pro.googlePhotos.v1'), false);
  assert.equal(isDriveFileListDatabase('matboard.googleDriveFiles'), true);
  assert.equal(isDriveFileListDatabase('app-google-drive-files'), true);
  assert.equal(isDriveFileListDatabase('matboard'), false);
  assert.equal(isDriveFileListDatabase('matboard-techniques'), false);
  assert.equal(isDriveFileListDatabase('matboard-curriculum-media'), false);
});

test('disconnect revokes the Google token and clears Drive folders without local plans, rosters, or journals', async () => {
  const browser = installBrowser();
  const deleted: string[] = [];
  let revoked = '';
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      google: {
        accounts: {
          oauth2: {
            revoke(token: string) {
              revoked = token;
            },
          },
        },
      },
    },
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      deleteDatabase(name: string) {
        deleted.push(name);
        const request = {} as IDBOpenDBRequest;
        queueMicrotask(() => request.onsuccess?.({} as Event));
        return request;
      },
      databases: async () => [
        { name: 'matboard.googleDriveFiles' },
        { name: 'app-google-drive-files' },
        { name: 'matboard' },
        { name: 'matboard-techniques' },
      ],
    },
  });

  localStorage.setItem(
    DRIVE_BINDING_KEY,
    JSON.stringify({ folderId: 'videosFolder1', folderName: 'Daily Training Videos', email: 'owner@gym.test' }),
  );
  sessionStorage.setItem(
    'matboard.pro.googleDriveToken',
    JSON.stringify({
      accessToken: 'ya29.stuck-token',
      expiresAt: Date.now() + 3_600_000,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
    }),
  );
  localStorage.setItem('matboard.pro.googleDriveFiles.v1', '[{"id":"clip"}]');
  localStorage.setItem(TRAINING_NOTES_STORAGE_KEY, '{"lesson":"armbar"}');
  localStorage.setItem(ROSTER_KEY, '{"students":[{"name":"Sam"}]}');
  localStorage.setItem(STUDENT_EDITION_STORAGE_KEY, '{"journal":[{"note":"keep"}]}');
  localStorage.setItem(LESSON_DRIVE_QUEUE_KEY, '{"version":1,"revisions":[{"dateKey":"2026-10-23"}]}');
  localStorage.setItem('matboard.pro.oneDriveFolder.v1', '{"folderId":"one"}');
  localStorage.setItem('matboard.pro.googlePhotos.v1', '{"folderId":"photos"}');
  localStorage.setItem('matboard.pro.googleClientId', 'dev-client');
  saveStudentDriveLink(localStorage, {
    role: 'academy',
    provider: 'googleDrive',
    folderId: 'videosFolder1',
    folderName: 'Daily Training Videos',
    accountLabel: 'owner@gym.test',
    gymName: 'GB',
  });
  saveStudentDriveLink(localStorage, {
    role: 'personal',
    provider: 'oneDrive',
    folderId: 'personalOne1',
    folderName: 'My OneDrive',
    accountLabel: null,
    gymName: '',
  });

  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return Response.json({ files: [{ id: 'plans', name: 'lesson-plans' }] });
  };
  await findOrCreateChildFolder('tok', 'root', 'lesson-plans', fetcher);
  const cachedCalls = calls;
  await findOrCreateChildFolder('tok', 'root', 'lesson-plans', fetcher);
  assert.equal(calls, cachedCalls);

  await disconnectGoogleDrive();

  assert.equal(revoked, 'ya29.stuck-token');
  assert.equal(localStorage.getItem(DRIVE_BINDING_KEY), null);
  assert.equal(sessionStorage.getItem('matboard.pro.googleDriveToken'), null);
  assert.equal(localStorage.getItem('matboard.pro.googleDriveFiles.v1'), null);
  assert.equal(localStorage.getItem('matboard.studentEdition.academyDrive.v1'), null);
  assert.match(localStorage.getItem('matboard.studentEdition.personalDrive.v1') ?? '', /personalOne1/);
  assert.equal(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY), '{"lesson":"armbar"}');
  assert.equal(localStorage.getItem(ROSTER_KEY), '{"students":[{"name":"Sam"}]}');
  assert.equal(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY), '{"journal":[{"note":"keep"}]}');
  assert.match(localStorage.getItem(LESSON_DRIVE_QUEUE_KEY) ?? '', /2026-10-23/);
  assert.equal(localStorage.getItem('matboard.pro.oneDriveFolder.v1'), '{"folderId":"one"}');
  assert.equal(localStorage.getItem('matboard.pro.googlePhotos.v1'), '{"folderId":"photos"}');
  assert.equal(localStorage.getItem('matboard.pro.googleClientId'), 'dev-client');
  assert.ok(deleted.includes('matboard.googleDriveFiles'));
  assert.ok(deleted.includes('app-google-drive-files'));
  assert.equal(deleted.includes('matboard'), false);
  assert.equal(deleted.includes('matboard-techniques'), false);
  for (const name of DRIVE_FILE_LIST_DB_NAMES) assert.ok(deleted.includes(name));

  await findOrCreateChildFolder('tok', 'root', 'lesson-plans', fetcher);
  assert.ok(calls > cachedCalls);

  browser.restore();
});

test('disconnect still clears Drive when Google revoke is not available', async () => {
  const browser = installBrowser();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { google: { accounts: { oauth2: {} } } },
  });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
  localStorage.setItem(
    DRIVE_BINDING_KEY,
    JSON.stringify({ folderId: 'pictures', folderName: 'pictures', email: null }),
  );
  sessionStorage.setItem(
    'matboard.pro.googleDriveToken',
    JSON.stringify({ accessToken: 'ya29.keep', expiresAt: Date.now() + 3_600_000, scope: 'x' }),
  );
  saveStudentDriveLink(localStorage, {
    role: 'personal',
    provider: 'googleDrive',
    folderId: 'pictures',
    folderName: 'pictures',
    accountLabel: null,
    gymName: '',
  });
  await disconnectGoogleDrive();
  assert.equal(localStorage.getItem(DRIVE_BINDING_KEY), null);
  assert.equal(sessionStorage.getItem('matboard.pro.googleDriveToken'), null);
  assert.equal(localStorage.getItem('matboard.studentEdition.personalDrive.v1'), null);
  browser.restore();
});

test('change folder steps up to the parent so a sibling folder can be chosen', async () => {
  const folders = [
    { id: 'root', name: 'Gym', parents: [] as string[], mimeType: FOLDER },
    { id: 'shared', name: 'Shared', parents: ['root'], mimeType: FOLDER },
    { id: 'videos', name: 'Daily Training Videos', parents: ['shared'], mimeType: FOLDER },
    { id: 'pictures', name: 'pictures', parents: ['shared'], mimeType: FOLDER },
  ];
  const fetcher: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const fileId = url.match(/\/files\/([^/?]+)/)?.[1];
    if (fileId) {
      const file = folders.find((item) => item.id === decodeURIComponent(fileId));
      if (!file) return new Response('missing', { status: 404 });
      return Response.json({ id: file.id, name: file.name, parents: file.parents });
    }
    const query = new URL(url).searchParams.get('q') ?? '';
    const parent = query.match(/'([^']+)' in parents/)?.[1];
    const listed = folders.filter((file) => !parent || file.parents.includes(parent));
    return Response.json({ files: listed.map((file) => ({ id: file.id, name: file.name })) });
  };

  const level = await openDriveChangeFolder('token', 'videos', fetcher);
  assert.deepEqual(
    level.folders.map((folder) => folder.name).sort(),
    ['Daily Training Videos', 'pictures'],
  );
  assert.equal(level.upFolderId, 'root');
  assert.equal(level.upToAccount, false);
  assert.equal(level.upLabel, 'Up to Gym');

  const higher = await listDriveFolderLevel('token', level.upFolderId, fetcher);
  assert.deepEqual(
    higher.folders.map((folder) => folder.name),
    ['Shared'],
  );
  assert.equal(higher.upToAccount, true);
  assert.equal(higher.upLabel, DRIVE_FOLDER_UP_LABEL);

  const account = await listDriveFolderLevel('token', null, fetcher);
  assert.equal(account.upLabel, null);
  assert.ok(account.folders.some((folder) => folder.name === 'pictures'));

  const top = await openDriveChangeFolder('token', 'root', fetcher);
  assert.equal(top.upLabel, null);
  assert.ok(top.folders.some((folder) => folder.id === 'pictures'));
});

test('every Google Drive connection surface keeps connect and adds change folder plus disconnect', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const card = read('../components/DriveConnectCard.tsx');
  const open = read('../components/OpenMyDrive.tsx');
  const tools = read('../components/GoogleDriveFolderTools.tsx');
  const connections = read('../pages/student/ConnectionsPage.tsx');
  const academy = read('../components/AcademyPathwayPanel.tsx');
  const techniques = read('../pages/Techniques.tsx');
  const notes = read('../pages/TrainingNotes.tsx');
  const consolePage = read('../pages/Screensaver.tsx');
  const unlimited = read('../pages/CoachUnlimited.tsx');
  const pro = read('../pages/Pro.tsx');

  assert.equal(DRIVE_DISCONNECT_LABEL, 'Disconnect Google Drive');
  assert.equal(DRIVE_CHANGE_FOLDER_LABEL, 'Change folder');
  assert.match(DRIVE_DISCONNECT_CONFIRM, /Lesson plans, rosters, and journals/);
  assert.match(tools, /DRIVE_DISCONNECT_CONFIRM/);
  assert.match(tools, /disconnectGoogleDrive/);
  assert.match(tools, /openDriveChangeFolder/);
  assert.match(tools, /Cancel/);

  for (const source of [card, open, connections, academy]) {
    assert.match(source, /GoogleDriveFolderTools/);
    assert.match(source, /DRIVE_CHANGE_FOLDER_LABEL|Change folder|picker=/);
  }
  assert.match(card, /DRIVE_BROWSE_LABEL/);
  assert.match(card, /DRIVE_RECONNECT_LABEL/);
  assert.match(card, /requestDriveConsent/);
  assert.match(card, /cloudStorageChoices/);
  assert.match(card, />\s*Disconnect\s*</);
  assert.match(card, /folderLevel\?\.upLabel/);
  assert.match(open, /changeFolderOnOpen/);
  assert.match(techniques, /OpenMyDrive/);
  assert.match(notes, /OpenMyDrive/);
  assert.match(consolePage, /OpenMyDrive/);
  assert.match(consolePage, /<DriveConnectCard \/>/);
  assert.match(unlimited, /<DriveConnectCard \/>/);
  assert.match(pro, /AcademyPathwayPanel/);
  assert.match(connections, /Connect Google Drive/);
  assert.match(connections, /Disconnect academy folder/);
  assert.match(connections, /Disconnect my drive/);
  assert.match(academy, /Copy academy link/);
  assert.match(academy, /Share folder for student edits/);
  assert.match(read('./googleDrive.ts'), /oauth2\?\.revoke/);
  assert.match(read('./googleDrive.ts'), /clearDriveSession/);
  assert.doesNotMatch(card, /Google OAuth|Cloud Console|client secret/i);
});

test('clearDriveIndexedFileLists does nothing when IndexedDB is missing', async () => {
  const previous = globalThis.indexedDB;
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
  await clearDriveIndexedFileLists();
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: previous });
});

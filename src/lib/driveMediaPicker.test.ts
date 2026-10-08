import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { FolderBatchError, folderSaveProgressLabel } from './folderBatch.ts';
import {
  clearVisibleSelection,
  selectAllVisible,
} from './mediaSelection.ts';
import { DEVICE_STORAGE_FULL_NOTE, StorageQuotaError } from './storageQuota.ts';
import {
  DRIVE_PICK_BACK,
  DRIVE_PICK_BESIDE_PHOTOS,
  DRIVE_PICK_DONE,
  DRIVE_PICK_STAY,
  PICK_FROM_DRIVE_LABEL,
  chunkDriveImport,
  driveImportChunkSize,
  driveImportOutcomeNote,
  driveImportProgressLabel,
  driveImportSaveErrorNote,
  drivePickDoneLabel,
  drivePickEmptyCopy,
  drivePickEnterFolder,
  drivePickEntry,
  drivePickGoBack,
  drivePickHint,
  drivePickPath,
  drivePickRootStack,
  drivePickShowsBack,
  runDriveImport,
  splitDriveBrowse,
  toggleDriveSelection,
} from './driveMediaPicker.ts';

const FOLDER = 'application/vnd.google-apps.folder';

test('Drive picker lists folders and the matching photos or videos', () => {
  assert.equal(PICK_FROM_DRIVE_LABEL, 'Pick from Google Drive');
  assert.match(DRIVE_PICK_BESIDE_PHOTOS, /Pick from gallery includes Google Photos/);
  assert.match(DRIVE_PICK_BESIDE_PHOTOS, /additional source/);
  assert.match(DRIVE_PICK_STAY, /gym Google Drive folder/);
  assert.match(DRIVE_PICK_STAY, /Google Photos/);
  assert.match(DRIVE_PICK_STAY, /in addition/);
  assert.match(DRIVE_PICK_STAY, /does not host/);
  assert.doesNotMatch(DRIVE_PICK_STAY, /photos\.google|iCloud|not a source|unavailable/i);
  assert.equal(drivePickHint('photo'), 'Additional source: photos in the gym Google Drive folder');
  assert.equal(drivePickHint('video'), 'Additional source: videos in the gym Google Drive folder');
  assert.equal(drivePickHint('any'), 'Additional source: photos and videos in the gym Google Drive folder');

  const split = splitDriveBrowse(
    [
      { id: 'day', name: '2026-09-28', mimeType: FOLDER },
      { id: 'photos', name: 'class-photos', mimeType: FOLDER },
      { id: 'pic', name: 'Belt.jpg', mimeType: 'image/jpeg', thumbnailLink: 'https://lh3.googleusercontent.com/x' },
      { id: 'clip', name: 'Armbar.mp4', mimeType: 'video/mp4' },
      { id: 'plan', name: 'advantage-lesson.json', mimeType: 'application/json' },
      { id: 'dup', name: 'Belt.jpg', mimeType: 'image/jpeg' },
      { id: 'dup', name: 'Ignored.jpg', mimeType: 'image/jpeg' },
    ],
    'photo',
  );
  assert.deepEqual(
    split.folders.map((folder) => folder.name),
    ['2026-09-28', 'class-photos'],
  );
  assert.deepEqual(
    split.media.map((item) => item.id),
    ['pic', 'dup'],
  );
  assert.equal(split.media.some((item) => item.name === 'Ignored.jpg'), false);
  assert.equal(split.media[0]?.thumbnailLink, 'https://lh3.googleusercontent.com/x');

  const videos = splitDriveBrowse(
    [
      { id: 'clip', name: 'Armbar.mp4', mimeType: 'video/mp4' },
      { id: 'pic', name: 'Belt.jpg', mimeType: 'image/jpeg' },
    ],
    'video',
  );
  assert.deepEqual(
    videos.media.map((item) => item.name),
    ['Armbar.mp4'],
  );
  assert.equal(videos.folders.length, 0);
});

test('Drive picker selection toggles and Done counts the chosen files', () => {
  const photo = { id: 'pic', name: 'Belt.jpg', mime: 'image/jpeg', thumbnailLink: null };
  const other = { id: 'two', name: 'Gi.jpg', mime: 'image/jpeg', thumbnailLink: null };
  const once = toggleDriveSelection([], photo);
  const both = toggleDriveSelection(once, other);
  const back = toggleDriveSelection(both, photo);
  assert.deepEqual(
    both.map((item) => item.id),
    ['pic', 'two'],
  );
  assert.deepEqual(
    back.map((item) => item.id),
    ['two'],
  );
  assert.equal(drivePickDoneLabel(0), DRIVE_PICK_DONE);
  assert.equal(drivePickDoneLabel(1), 'Done · 1 selected');
  assert.equal(drivePickDoneLabel(3), 'Done · 3 selected');
  assert.equal(drivePickEmptyCopy('photo', 2), 'No photos in this folder. Open a folder below.');
  assert.equal(drivePickEmptyCopy('video', 0), 'No videos in this folder.');
  assert.equal(driveImportProgressLabel(0, 3), 'Opening 1 of 3 files from Google Drive…');
  assert.equal(driveImportProgressLabel(2, 3), 'Opening 2 of 3 files from Google Drive…');
  assert.equal(driveImportProgressLabel(1, 1), 'Opening 1 of 1 file from Google Drive…');
});

test('folder navigation, Back, and the connect card entry stay the same', () => {
  assert.equal(DRIVE_PICK_BACK, 'Back');
  assert.equal(drivePickEntry(false), 'connect');
  assert.equal(drivePickEntry(true), 'picker');
  assert.deepEqual(drivePickRootStack(null), []);
  const root = drivePickRootStack({ folderId: 'gym', folderName: 'Gym folder' });
  assert.equal(drivePickShowsBack(root), false);
  assert.deepEqual(drivePickGoBack(root), root);
  assert.equal(drivePickPath(root), 'Gym folder');
  const day = drivePickEnterFolder(root, { id: 'day', name: '2026-09-28' });
  assert.equal(drivePickShowsBack(day), true);
  assert.equal(drivePickPath(day), 'Gym folder / 2026-09-28');
  assert.deepEqual(
    drivePickGoBack(day).map((crumb) => crumb.id),
    ['gym'],
  );
  assert.deepEqual(drivePickEnterFolder(root, { id: ' ', name: 'skip' }), root);
});

test('Select all stays on the visible folder and one tap still changes Done', () => {
  const split = splitDriveBrowse(
    [
      { id: 'day', name: '2026-09-28', mimeType: FOLDER },
      { id: 'pic', name: 'Belt.jpg', mimeType: 'image/jpeg' },
      { id: 'two', name: 'Gi.jpg', mimeType: 'image/jpeg' },
      { id: 'clip', name: 'Armbar.mp4', mimeType: 'video/mp4' },
    ],
    'photo',
  );
  assert.equal(split.media.some((item) => item.id === 'clip'), false);
  const visible = split.media;
  const all = selectAllVisible([], visible);
  assert.deepEqual(
    all.map((item) => item.id),
    ['pic', 'two'],
  );
  const nested = selectAllVisible(all, [
    { id: 'deep', name: 'Deep.jpg', mime: 'image/jpeg', thumbnailLink: null },
  ]);
  assert.deepEqual(
    nested.map((item) => item.id),
    ['pic', 'two', 'deep'],
  );
  const clearedHere = clearVisibleSelection(nested, visible);
  assert.deepEqual(
    clearedHere.map((item) => item.id),
    ['deep'],
  );
  const one = toggleDriveSelection(all, visible[0]);
  assert.deepEqual(
    one.map((item) => item.id),
    ['two'],
  );
  assert.equal(drivePickDoneLabel(one.length), 'Done · 1 selected');
  assert.equal(drivePickDoneLabel(all.length), 'Done · 2 selected');
  assert.equal(drivePickDoneLabel(0), DRIVE_PICK_DONE);
});

test('a small Drive import still shows opening and saving progress, then saves once', async () => {
  const items = [
    { id: 'a', name: 'A.jpg' },
    { id: 'b', name: 'B.jpg' },
    { id: 'c', name: 'C.jpg' },
  ];
  const labels: string[] = [];
  const saved: string[][] = [];
  const result = await runDriveImport({
    items,
    chunkSize: driveImportChunkSize('photo'),
    download: async (item) => ({
      file: new File(['x'], item.name, { type: 'image/jpeg' }),
      driveFileId: item.id,
    }),
    save: async (files, report) => {
      saved.push(files.map((file) => file.driveFileId));
      report({ done: 0, total: files.length, phase: 'shrink' });
      report({ done: files.length, total: files.length, phase: 'save' });
      return files.length;
    },
    onLabel: (label) => labels.push(label),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.outcome.added, 3);
  assert.equal(result.outcome.failedOpen, 0);
  assert.equal(driveImportOutcomeNote(result.outcome), null);
  assert.deepEqual(saved, [['a', 'b', 'c']]);
  assert.deepEqual(labels.slice(0, 3), [
    driveImportProgressLabel(0, 3),
    driveImportProgressLabel(1, 3),
    driveImportProgressLabel(2, 3),
  ]);
  assert.ok(labels.includes(folderSaveProgressLabel({ done: 0, total: 3, phase: 'shrink' })));
  assert.ok(labels.includes(folderSaveProgressLabel({ done: 3, total: 3, phase: 'save' })));
});

test('one Drive file that will not open is skipped and the rest still import', async () => {
  const items = [
    { id: 'a', name: 'A.jpg' },
    { id: 'b', name: 'B.jpg' },
    { id: 'c', name: 'C.jpg' },
  ];
  const saved: string[] = [];
  const result = await runDriveImport({
    items,
    chunkSize: 8,
    download: async (item) => {
      if (item.id === 'b') throw new Error('That Drive video could not be downloaded.');
      return {
        file: new File(['x'], item.name, { type: 'image/jpeg' }),
        driveFileId: item.id,
      };
    },
    save: async (files) => {
      saved.push(...files.map((file) => file.driveFileId));
      return files.length;
    },
    onLabel: () => {},
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(saved, ['a', 'c']);
  assert.equal(
    driveImportOutcomeNote(result.outcome),
    'Saved 2 of 3. 1 file could not be opened.',
  );
  assert.equal(
    driveImportOutcomeNote({ picked: 2, opened: 0, failedOpen: 2, added: 0 }),
    'Those Google Drive files could not be opened. Nothing was saved.',
  );
  assert.equal(
    driveImportOutcomeNote({ picked: 2, opened: 2, failedOpen: 0, added: 0 }),
    'Those files are already in this folder, or this folder does not use that kind.',
  );
});

test('a save error before anything is stored keeps that error message', async () => {
  const quota = new StorageQuotaError(0, 3);
  const stopped = new FolderBatchError(0, 3);
  const result = await runDriveImport({
    items: [{ id: 'a' }, { id: 'b' }],
    chunkSize: 8,
    download: async (item) => ({
      file: new File(['x'], `${item.id}.jpg`, { type: 'image/jpeg' }),
      driveFileId: item.id,
    }),
    save: async () => {
      throw quota;
    },
    onLabel: () => {},
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.outcome.added, 0);
  assert.equal(driveImportSaveErrorNote(result.error, result.outcome.added, result.outcome.picked), quota.message);
  assert.equal(driveImportSaveErrorNote(stopped, 0, 3), stopped.message);
  assert.equal(quota.message, DEVICE_STORAGE_FULL_NOTE);
});

test('Select all downloads a folder in chunks and a later save error keeps earlier files', async () => {
  const items = Array.from({ length: 10 }, (_, index) => ({ id: `p${index}` }));
  let held = 0;
  let peak = 0;
  const batches: number[] = [];
  const result = await runDriveImport({
    items,
    chunkSize: driveImportChunkSize('photo'),
    download: async (item) => {
      held += 1;
      peak = Math.max(peak, held);
      return { file: new File(['x'], `${item.id}.jpg`, { type: 'image/jpeg' }), driveFileId: item.id };
    },
    save: async (files) => {
      batches.push(files.length);
      held -= files.length;
      if (batches.length === 2) throw new FolderBatchError(2, files.length);
      return files.length;
    },
    onLabel: () => {},
  });
  assert.equal(driveImportChunkSize('photo'), 8);
  assert.equal(driveImportChunkSize('video'), 3);
  assert.deepEqual(chunkDriveImport(items, 8).map((chunk) => chunk.length), [8, 2]);
  assert.equal(peak <= 8, true);
  assert.deepEqual(batches, [8, 2]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.outcome.added, 10);
  assert.match(driveImportSaveErrorNote(result.error, result.outcome.added, result.outcome.picked), /^Saved 10 of 10\./);
});

test('the Drive sheet keeps single select, Done, Back, folder navigation, and the host copy', () => {
  const picker = readFileSync(new URL('../components/DriveMediaPicker.tsx', import.meta.url), 'utf8');
  const bar = readFileSync(new URL('../components/MediaSelectBar.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../pages/Screensaver.tsx', import.meta.url), 'utf8');
  const card = readFileSync(new URL('../components/DriveConnectCard.tsx', import.meta.url), 'utf8');
  assert.equal(picker.match(/setSelected\(\[\]\)/g)?.length, 1);
  assert.match(picker, /toggleDriveSelection/);
  assert.match(picker, /drivePickDoneLabel\(selected\.length\)/);
  assert.match(picker, /disabled=\{selected\.length === 0\}/);
  assert.match(picker, /DRIVE_PICK_BACK/);
  assert.match(picker, /drivePickGoBack/);
  assert.match(picker, /drivePickEnterFolder/);
  assert.match(picker, /DRIVE_PICK_STAY/);
  assert.match(picker, /DRIVE_PICK_LOADING/);
  assert.match(picker, /Sign in to Google Drive again to open this folder\./);
  assert.match(picker, /listFolderFiles/);
  assert.match(bar, /btn btn--ghost/);
  assert.match(bar, /SELECT_ALL_LABEL/);
  assert.match(bar, /CLEAR_SELECTION_LABEL/);
  assert.doesNotMatch(bar, /logo-yellow|btn--blue/);
  assert.match(page, /drivePickEntry\(Boolean\(driveBinding\)\)/);
  assert.match(page, /<DriveConnectCard \/>/);
  assert.match(page, /runDriveImport/);
  assert.match(page, /driveImportProgressLabel\(0, picked\.length\)/);
  assert.match(card, /Advantage does not host/);
});

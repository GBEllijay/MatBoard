import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DRIVE_PICK_BESIDE_PHOTOS,
  DRIVE_PICK_DONE,
  DRIVE_PICK_STAY,
  PICK_FROM_DRIVE_LABEL,
  driveImportProgressLabel,
  drivePickDoneLabel,
  drivePickEmptyCopy,
  drivePickHint,
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
});

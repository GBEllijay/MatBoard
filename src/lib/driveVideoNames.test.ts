import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DRIVE_VIDEO_SHOW_LIMIT,
  dateInDriveVideoName,
  driveClipDescription,
  driveVideoShortLabel,
  friendlyTrainingVideoName,
  parseVideoDateFolderName,
  renameDriveVideoName,
  videoDateFolderName,
  visibleDriveVideoCount,
} from './driveVideoNames.ts';

test('new video folders and names stay readable and keep the id off the file name', () => {
  assert.equal(videoDateFolderName('2026-10-13'), '2026-10-13 (Tue)');
  assert.equal(parseVideoDateFolderName('2026-10-13 (Tue)'), '2026-10-13');
  assert.equal(parseVideoDateFolderName('2026-10-13'), '2026-10-13');
  assert.equal(parseVideoDateFolderName('Videos'), null);
  assert.equal(dateInDriveVideoName('advantage-video-2026-10-13-1000015841-0f018a78-abcd.mp4'), '2026-10-13');
  assert.equal(dateInDriveVideoName('clip.mp4'), null);

  const named = friendlyTrainingVideoName({
    dateKey: '2026-10-13',
    classDesignation: 'GB1',
    lessonTitle: 'Armbar from guard',
    clipNumber: 3,
    mime: 'video/mp4',
    originalName: 'advantage-video-2026-10-13-1000015841-0f018a78-abcd.mp4',
  });
  assert.equal(named, '2026-10-13 GB1 Armbar from guard - clip 3.mp4');
  assert.doesNotMatch(named, /0f018a78|1000015841/);
  assert.equal(
    friendlyTrainingVideoName({
      dateKey: '2026-10-13',
      classDesignation: 'GB1',
      lessonTitle: '',
      clipNumber: 3,
      mime: 'video/mp4',
    }),
    '2026-10-13 GB1 Clip 3.mp4',
  );
  assert.equal(driveClipDescription('0f018a78-abcd'), 'advantage-clip:0f018a78-abcd');
  assert.equal(
    driveVideoShortLabel(
      { name: named, lessonTitle: 'Armbar from guard', classDesignation: 'GB1' },
      3,
    ),
    'Armbar from guard',
  );
  assert.equal(
    driveVideoShortLabel(
      { name: 'advantage-video-2026-10-13-1000015841-0f018a78-abcd.mp4' },
      4,
    ),
    'Clip 4',
  );
  assert.equal(renameDriveVideoName(named, 'Guard pass'), 'Guard pass.mp4');
  assert.equal(visibleDriveVideoCount(13, false), DRIVE_VIDEO_SHOW_LIMIT);
  assert.equal(visibleDriveVideoCount(13, true), 13);
});

test('the Drive video list is date folders, compact rows, and a show-more limit', () => {
  const list = readFileSync(new URL('../components/DriveVideoFolders.tsx', import.meta.url), 'utf8');
  assert.match(list, /drive-videos__toggle--on/);
  assert.match(list, /DRIVE_VIDEO_SHOW_LIMIT/);
  assert.match(list, /Show more/);
  assert.match(list, /Show less/);
  assert.match(list, /Rename/);
  assert.match(list, /title=\{row\.label\}/);
  assert.doesNotMatch(list, /className="btn/);
  assert.match(list, /selected \? 'drive-videos__toggle drive-videos__toggle--on'/);

  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /--logo-blue:\s*#004eba/);
  assert.match(css, /\.drive-videos__toggle--on\s*\{[^}]*background:\s*var\(--logo-blue\)/);
  assert.match(css, /\.drive-videos__label\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.drive-videos__label\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.doesNotMatch(css, /\.drive-videos__toggle--on\s*\{[^}]*logo-yellow/);
  assert.doesNotMatch(css, /\.drive-videos__rename\s*\{[^}]*logo-yellow/);

  const notes = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  for (const control of [
    'DOWNLOAD_TODAY_LABEL',
    'OpenMyDrive',
    'OPEN_DRIVE_CLASS_LABEL',
    'PlanDateNav',
    'DriveVideoFolders',
  ]) {
    assert.match(notes, new RegExp(control));
  }
  assert.match(notes, /\n\s*Today\n/);
  assert.match(notes, /\n\s*Yesterday\n/);
  assert.match(notes, /\n\s*Classes\n/);
  const dates = readFileSync(new URL('../components/PlanDateNav.tsx', import.meta.url), 'utf8');
  assert.match(dates, /Search plans/);
  assert.match(dates, /Calendar/);
  assert.match(readFileSync(new URL('./galleryDay.ts', import.meta.url), 'utf8'), /Download today's videos/);
  assert.match(readFileSync(new URL('./lessonRestore.ts', import.meta.url), 'utf8'), /Open a class from Google Drive/);
});

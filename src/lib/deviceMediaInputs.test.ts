import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function deviceInputs(text: string): string[] {
  return text
    .split('<DeviceMediaInput')
    .slice(1)
    .map((block) => block.slice(0, block.indexOf('/>')));
}

function allowsMultiple(block: string): boolean {
  return /\bmultiple\b/.test(block) && !/multiple=\{false\}/.test(block);
}

test('gallery library inputs stay multiple and camera inputs stay single', () => {
  const saver = deviceInputs(source('../pages/Screensaver.tsx'));
  const library = saver.filter((block) => block.includes('library'));
  const camera = saver.filter((block) => block.includes('capture') || block.includes('Record') || block.includes('record'));
  assert.equal(library.length, 2);
  assert.equal(camera.length, 2);
  assert.equal(library.every(allowsMultiple), true);
  assert.equal(camera.some(allowsMultiple), false);

  const promotions = deviceInputs(source('../components/ClassPhotoPromotions.tsx'));
  const promoLibrary = promotions.filter((block) => block.includes('LIBRARY_ID'));
  const promoCamera = promotions.filter((block) => !block.includes('LIBRARY_ID'));
  assert.equal(promoLibrary.length, 1);
  assert.equal(allowsMultiple(promoLibrary[0] ?? ''), true);
  assert.equal(promoCamera.length, 2);
  assert.equal(promoCamera.some(allowsMultiple), false);
  assert.match(source('../components/ClassPhotoPromotions.tsx'), /addClassPhotoPromotionFiles\(dateKey, files\)/);
});

test('one-item photo and video inputs stay single', () => {
  const singleSources = [
    '../components/GymLogoControl.tsx',
    '../pages/Roster.tsx',
    '../pages/Techniques.tsx',
  ];
  for (const path of singleSources) {
    for (const block of deviceInputs(source(path))) {
      assert.equal(allowsMultiple(block), false, path);
    }
  }
  const schedule = source('../pages/Schedule.tsx');
  assert.match(schedule, /accept="image\/\*"/);
  assert.equal(schedule.includes('multiple'), false);
});

test('Media Console folders, gallery day, class history, and OneDrive are not extra select-all grids', () => {
  const toolbox = source('../components/ToolboxFolder.tsx');
  assert.match(toolbox, /Clear \{folder\.label\}/);
  assert.doesNotMatch(toolbox, /Select all/);
  const notes = source('../pages/TrainingNotes.tsx');
  assert.match(notes, /DOWNLOAD_TODAY_LABEL/);
  assert.doesNotMatch(notes, /Select all/);
  const history = source('../pages/ClassHistory.tsx');
  assert.match(history, /OPEN_THIS_CLASS_LABEL/);
  assert.doesNotMatch(history, /Select all/);
  const oneDrive = source('../lib/oneDrive.ts');
  assert.match(oneDrive, /listOneDriveItems/);
  assert.doesNotMatch(oneDrive, /Select all/);
  assert.doesNotMatch(source('../components/DriveConnectCard.tsx'), /Select all/);
});

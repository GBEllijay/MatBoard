import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CLASS_PHOTO_PROMOTIONS_ADD,
  CLASS_PHOTO_PROMOTIONS_DB,
  CLASS_PHOTO_PROMOTIONS_LABEL,
  CLASS_PHOTO_PROMOTIONS_STORE,
  classPhotoPromotionKind,
} from './classPhotoPromotions.ts';
import { CLASS_PHOTOS_FOLDER, CLASS_PHOTO_PROMOTIONS_ROLE } from './googleDrive.ts';
import { PHOTO_CAPTURE_LABEL, VIDEO_LIBRARY_LABEL, VIDEO_RECORD_LABEL } from './mediaPicker.ts';

test('Today class photo promotions label and storage keys stay explicit', () => {
  assert.equal(CLASS_PHOTO_PROMOTIONS_LABEL, "Today's class photo / promotions");
  assert.equal(CLASS_PHOTO_PROMOTIONS_ADD, 'Add photo or video');
  assert.match(CLASS_PHOTO_PROMOTIONS_LABEL, /photo \/ promotions/);
  assert.equal(CLASS_PHOTO_PROMOTIONS_DB, 'matboard-class-photo-promotions');
  assert.equal(CLASS_PHOTO_PROMOTIONS_STORE, 'items');
  assert.equal(CLASS_PHOTOS_FOLDER, 'class-photos');
  assert.equal(CLASS_PHOTO_PROMOTIONS_ROLE, 'class-photo-promotions');
  assert.equal(PHOTO_CAPTURE_LABEL, 'Take photo');
  assert.equal(VIDEO_RECORD_LABEL, 'Record');
  assert.equal(VIDEO_LIBRARY_LABEL, 'Pick from gallery');
});

test('class photo promotions accept a photo or a video file', () => {
  assert.equal(classPhotoPromotionKind(new File(['a'], 'promo.jpg', { type: 'image/jpeg' })), 'photo');
  assert.equal(classPhotoPromotionKind(new File(['a'], 'move.mp4', { type: 'video/mp4' })), 'video');
  assert.equal(classPhotoPromotionKind(new File(['a'], 'notes.txt', { type: 'text/plain' })), null);
});

test('the section sits below instructor distribution on the lesson plan', () => {
  const notes = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  const distribute = notes.indexOf('{DISTRIBUTE_BUTTON}');
  const section = notes.indexOf('<ClassPhotoPromotions');
  assert.ok(distribute > 0);
  assert.ok(section > distribute);
  const ui = readFileSync(new URL('../components/ClassPhotoPromotions.tsx', import.meta.url), 'utf8');
  assert.match(ui, /kind="photo-or-video"/);
  assert.match(ui, /accept=\{PHOTO_PICKER_ACCEPT\}/);
  assert.match(ui, /accept=\{VIDEO_RECORD_ACCEPT\}/);
  assert.match(ui, /capture=\{VIDEO_CAPTURE\}/);
  assert.match(ui, /accept=\{MEDIA_LIBRARY_ACCEPT\}/);
  assert.doesNotMatch(ui, /accept=\{MEDIA_LIBRARY_ACCEPT\}[\s\S]{0,80}capture=/);
  const sheet = readFileSync(new URL('../components/VideoSourceSheet.tsx', import.meta.url), 'utf8');
  assert.match(sheet, /PHOTO_CAPTURE_LABEL/);
  assert.match(sheet, /VIDEO_RECORD_LABEL/);
  assert.match(sheet, /VIDEO_LIBRARY_LABEL/);
});

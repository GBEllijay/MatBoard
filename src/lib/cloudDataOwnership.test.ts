import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudObjectKey } from './advantageCloudMedia.ts';
import { CURRICULUM_STORAGE_KEY } from './competitionCurriculum.ts';
import {
  cloudPathScope,
  instructorEditionStandsAlone,
  isInstructorPersonalStorageKey,
  isStudentPersonalStorageKey,
  personalRecordAfterDisconnect,
  STUDENT_PERSONAL_STORAGE_KEYS,
  INSTRUCTOR_PERSONAL_STORAGE_KEYS,
} from './cloudDataOwnership.ts';
import { RANK_PHOTO_KEY } from './rankPhotos.ts';
import { STUDENT_EDITION_STORAGE_KEY } from './studentEdition.ts';
import { TECHNIQUE_TREE_STORAGE_KEY } from './techniqueTreeStore.ts';
import { TRAINING_NOTES_STORAGE_KEY } from './trainingNotesStore.ts';

test('academy material, shared copies, and student journals stay in different scopes', () => {
  assert.equal(cloudPathScope('videos/daily/2026-11-08/fixture.jpg'), 'academy');
  assert.equal(cloudPathScope('lessons/current/2026-W45/2026-11-08.json'), 'academy');
  assert.equal(cloudPathScope('roster/master.json'), 'academy');
  assert.equal(cloudPathScope('students/stu-1/inbox/update.json'), 'shared');
  assert.equal(cloudPathScope('card-shares/share-1.json'), 'shared');
  assert.equal(cloudPathScope('matboard.studentEdition.v1'), 'refused');
  assert.equal(cloudObjectKey('license-1', 'videos/daily/2026-11-08/fixture.jpg'), 'groups/license-1/videos/daily/2026-11-08/fixture.jpg');
  assert.equal(cloudObjectKey('license-1', 'students/stu-1/inbox/update.json'), null);
});

test('a purchased instructor keeps their own info, and disconnect does not hand it to the academy', () => {
  assert.equal(instructorEditionStandsAlone(), true);
  assert.deepEqual(INSTRUCTOR_PERSONAL_STORAGE_KEYS, [TECHNIQUE_TREE_STORAGE_KEY, TRAINING_NOTES_STORAGE_KEY, CURRICULUM_STORAGE_KEY]);
  const notes = 'instructor stats and lesson notes';
  for (const endedBy of ['instructor', 'student', 'academy'] as const) {
    const ended = personalRecordAfterDisconnect(notes, endedBy);
    assert.equal(ended.record, notes);
    assert.equal(ended.personalAccess, false);
    assert.equal(ended.endedBy, endedBy);
  }
  for (const key of INSTRUCTOR_PERSONAL_STORAGE_KEYS) {
    assert.equal(isInstructorPersonalStorageKey(key), true);
    assert.equal(cloudPathScope(key), 'refused');
    assert.equal(cloudObjectKey('license-1', key), null);
  }
});

test('student personal stores match the device keys and are not academy objects', () => {
  assert.deepEqual(STUDENT_PERSONAL_STORAGE_KEYS, [STUDENT_EDITION_STORAGE_KEY, RANK_PHOTO_KEY]);
  for (const key of STUDENT_PERSONAL_STORAGE_KEYS) {
    assert.equal(isStudentPersonalStorageKey(key), true);
    assert.equal(cloudObjectKey('license-1', key), null);
  }
});

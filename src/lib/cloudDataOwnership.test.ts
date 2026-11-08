import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudObjectKey } from './advantageCloudMedia.ts';
import { cloudPathScope, isStudentPersonalStorageKey, STUDENT_PERSONAL_STORAGE_KEYS } from './cloudDataOwnership.ts';
import { RANK_PHOTO_KEY } from './rankPhotos.ts';
import { STUDENT_EDITION_STORAGE_KEY } from './studentEdition.ts';

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

test('student personal stores match the device keys and are not academy objects', () => {
  assert.deepEqual(STUDENT_PERSONAL_STORAGE_KEYS, [STUDENT_EDITION_STORAGE_KEY, RANK_PHOTO_KEY]);
  for (const key of STUDENT_PERSONAL_STORAGE_KEYS) {
    assert.equal(isStudentPersonalStorageKey(key), true);
    assert.equal(cloudObjectKey('license-1', key), null);
  }
});

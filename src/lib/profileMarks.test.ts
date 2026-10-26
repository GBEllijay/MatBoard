import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultProfileMarks, headerVisibility, readProfileMarks, writeProfileMark } from './profileMarks.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

test('photo and logo switches default off and on for adult and kids', () => {
  const marks = defaultProfileMarks();
  assert.equal(marks.adult.selfie, false);
  assert.equal(marks.kids.selfie, false);
  assert.equal(marks.adult.logo, true);
  assert.equal(marks.kids.logo, true);
  assert.deepEqual(headerVisibility('adult', marks), { selfie: false, logo: true });
  assert.deepEqual(headerVisibility('kids', marks), { selfie: false, logo: true });
});

test('an adult photo switch does not turn the kids photo on', () => {
  const storage = memory();
  writeProfileMark('adult', 'selfie', true, storage);
  const marks = readProfileMarks(storage);
  assert.equal(headerVisibility('adult', marks).selfie, true);
  assert.equal(headerVisibility('kids', marks).selfie, false);
  writeProfileMark('kids', 'selfie', true, storage);
  assert.equal(headerVisibility('kids', readProfileMarks(storage)).selfie, true);
  writeProfileMark('kids', 'selfie', false, storage);
  assert.equal(headerVisibility('kids', readProfileMarks(storage)).selfie, false);
  assert.equal(headerVisibility('adult', readProfileMarks(storage)).selfie, true);
});

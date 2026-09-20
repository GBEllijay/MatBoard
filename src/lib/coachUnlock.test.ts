import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COACH_UNLOCK_STORAGE_KEY,
  applyCoachUnlockSearch,
  coachCodesMatch,
  isCoachUnlocked,
  lockCoach,
  previewCoachUnlockFromSearch,
  stripCoachUnlockParams,
  tryCoachUnlock,
} from './coachUnlock.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

test('Coach owner code matches case-insensitively', () => {
  assert.equal(coachCodesMatch('advantage'), true);
  assert.equal(coachCodesMatch(' Advantage '), true);
  assert.equal(coachCodesMatch('ADVANTAGE'), true);
  assert.equal(coachCodesMatch('nope'), false);
});

test('Coach query preview unlocks, locks, or ignores', () => {
  assert.equal(previewCoachUnlockFromSearch(new URLSearchParams('coach=advantage')), true);
  assert.equal(previewCoachUnlockFromSearch(new URLSearchParams('coach=1')), true);
  assert.equal(previewCoachUnlockFromSearch(new URLSearchParams('coach=0')), false);
  assert.equal(previewCoachUnlockFromSearch(new URLSearchParams('coach=lock')), false);
  assert.equal(previewCoachUnlockFromSearch(new URLSearchParams('coach=nope')), null);
  assert.equal(previewCoachUnlockFromSearch(new URLSearchParams('pro=advantage')), null);
  assert.equal(previewCoachUnlockFromSearch(new URLSearchParams('')), null);
});

test('Coach query apply writes the local flag and strips params', () => {
  lockCoach();
  assert.equal(isCoachUnlocked(), false);
  assert.equal(applyCoachUnlockSearch(new URLSearchParams('coach=advantage')), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(localStorage.getItem(COACH_UNLOCK_STORAGE_KEY), '1');
  assert.equal(tryCoachUnlock('1'), true);
  lockCoach();
  assert.equal(isCoachUnlocked(), false);
  assert.equal(applyCoachUnlockSearch(new URLSearchParams('coach=0')), true);
  assert.equal(isCoachUnlocked(), false);
  const stripped = stripCoachUnlockParams(new URLSearchParams('coach=advantage&stay=1'));
  assert.equal(stripped.has('coach'), false);
  assert.equal(stripped.get('stay'), '1');
});

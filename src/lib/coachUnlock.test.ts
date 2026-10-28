import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COACH_UNLOCK_STORAGE_KEY,
  applyCoachUnlockSearch,
  isCoachUnlocked,
  lockCoach,
  previewCoachUnlockFromSearch,
  setCoachUnlocked,
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
Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });

test('a typed code and ?coach= do not unlock Coach', () => {
  lockCoach();
  assert.equal(tryCoachUnlock('1'), false);
  assert.equal(tryCoachUnlock('not-a-code'), false);
  assert.equal(previewCoachUnlockFromSearch(new URLSearchParams('coach=1')), null);
  assert.equal(previewCoachUnlockFromSearch(new URLSearchParams('coach=0')), null);
  assert.equal(applyCoachUnlockSearch(new URLSearchParams('coach=1')), false);
  assert.equal(isCoachUnlocked(), false);
  setCoachUnlocked(true);
  assert.equal(applyCoachUnlockSearch(new URLSearchParams('coach=0')), false);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(localStorage.getItem(COACH_UNLOCK_STORAGE_KEY), '1');
  const stripped = stripCoachUnlockParams(new URLSearchParams('coach=1&stay=1'));
  assert.equal(stripped.get('coach'), null);
  assert.equal(stripped.get('stay'), '1');
  lockCoach();
});

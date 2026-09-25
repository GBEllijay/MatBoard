import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRO_UNLOCK_STORAGE_KEY,
  applyUnlockSearch,
  codesMatch,
  isProUnlocked,
  lockPro,
  previewUnlockFromSearch,
  stripUnlockParams,
  tryUnlock,
} from './proUnlock.ts';

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

test('Pro owner code matches case-insensitively', () => {
  assert.equal(codesMatch('advantage'), true);
  assert.equal(codesMatch(' Advantage '), true);
  assert.equal(codesMatch('ADVANTAGE'), true);
  assert.equal(codesMatch('nope'), false);
});

test('Pro query preview unlocks, locks, or ignores', () => {
  assert.equal(previewUnlockFromSearch(new URLSearchParams('pro=advantage')), true);
  assert.equal(previewUnlockFromSearch(new URLSearchParams('unlock=1')), true);
  assert.equal(previewUnlockFromSearch(new URLSearchParams('pro=0')), false);
  assert.equal(previewUnlockFromSearch(new URLSearchParams('pro=lock')), false);
  assert.equal(previewUnlockFromSearch(new URLSearchParams('pro=nope')), null);
  assert.equal(previewUnlockFromSearch(new URLSearchParams('')), null);
});

test('Pro query apply writes the local flag and strips params', () => {
  lockPro();
  assert.equal(isProUnlocked(), false);
  assert.equal(applyUnlockSearch(new URLSearchParams('pro=advantage')), true);
  assert.equal(isProUnlocked(), true);
  assert.equal(localStorage.getItem(PRO_UNLOCK_STORAGE_KEY), '1');
  assert.equal(tryUnlock('1'), true);
  lockPro();
  assert.equal(isProUnlocked(), false);
  assert.equal(applyUnlockSearch(new URLSearchParams('pro=0')), true);
  assert.equal(isProUnlocked(), false);
  const stripped = stripUnlockParams(new URLSearchParams('pro=advantage&stay=1'));
  assert.equal(stripped.has('pro'), false);
  assert.equal(stripped.get('stay'), '1');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRACKET_CLEAN_KEY,
  getBracketClean,
  setBracketClean,
  toggleBracketClean,
} from './bracketCleanMode.ts';

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

test('TV Clean mode defaults to off and persists on/off toggles', () => {
  storage.removeItem(BRACKET_CLEAN_KEY);
  assert.equal(getBracketClean(), false);
  setBracketClean(true);
  assert.equal(getBracketClean(), true);
  assert.equal(localStorage.getItem(BRACKET_CLEAN_KEY), '1');
  assert.equal(toggleBracketClean(), false);
  assert.equal(getBracketClean(), false);
  assert.equal(localStorage.getItem(BRACKET_CLEAN_KEY), '0');
});

test('Unknown stored Clean flag falls back to false', () => {
  localStorage.setItem(BRACKET_CLEAN_KEY, 'yes');
  assert.equal(getBracketClean(), false);
});

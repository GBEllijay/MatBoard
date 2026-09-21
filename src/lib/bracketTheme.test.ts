import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRACKET_THEME_KEY,
  DEFAULT_BRACKET_THEME,
  getBracketTheme,
  setBracketTheme,
} from './bracketTheme.ts';

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

test('Bright is the default Mock Tournament theme', () => {
  storage.removeItem(BRACKET_THEME_KEY);
  assert.equal(DEFAULT_BRACKET_THEME, 'bright');
  assert.equal(getBracketTheme(), 'bright');
});

test('Bracket theme persists Bright and Dark', () => {
  setBracketTheme('dark');
  assert.equal(getBracketTheme(), 'dark');
  assert.equal(localStorage.getItem(BRACKET_THEME_KEY), 'dark');
  setBracketTheme('bright');
  assert.equal(getBracketTheme(), 'bright');
  assert.equal(localStorage.getItem(BRACKET_THEME_KEY), 'bright');
});

test('Unknown stored theme falls back to Bright', () => {
  localStorage.setItem(BRACKET_THEME_KEY, 'beige-tatami');
  assert.equal(getBracketTheme(), 'bright');
});

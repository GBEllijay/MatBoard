import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRACKET_THEME_KEY,
  BRACKET_THEME_LABELS,
  BRACKET_THEMES,
  DEFAULT_BRACKET_THEME,
  WHITE_BRACKET_THEME,
  bracketThemeOptions,
  getBracketTheme,
  isBracketTheme,
  podiumThemeOpen,
  setBracketTheme,
  visibleBracketTheme,
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

test('Podium & Mat Strip is a registered bracket theme alongside Bright and Dark', () => {
  assert.deepEqual([...BRACKET_THEMES], ['bright', 'dark', 'podium']);
  assert.equal(WHITE_BRACKET_THEME, 'podium');
  assert.equal(BRACKET_THEME_LABELS.podium, 'Podium & Mat Strip');
  assert.equal(isBracketTheme('podium'), true);
  assert.equal(isBracketTheme('beige-tatami'), false);
});

test('Bracket theme persists Bright, Dark, and Podium', () => {
  setBracketTheme('dark');
  assert.equal(getBracketTheme(), 'dark');
  assert.equal(localStorage.getItem(BRACKET_THEME_KEY), 'dark');
  setBracketTheme('podium');
  assert.equal(getBracketTheme(), 'podium');
  assert.equal(localStorage.getItem(BRACKET_THEME_KEY), 'podium');
  setBracketTheme('bright');
  assert.equal(getBracketTheme(), 'bright');
  assert.equal(localStorage.getItem(BRACKET_THEME_KEY), 'bright');
});

test('Unknown stored theme falls back to Bright', () => {
  localStorage.setItem(BRACKET_THEME_KEY, 'beige-tatami');
  assert.equal(getBracketTheme(), 'bright');
});

test('Podium is listed only when White base skins are open', () => {
  assert.equal(podiumThemeOpen(false), false);
  assert.deepEqual(bracketThemeOptions(false), ['bright', 'dark']);
  assert.equal(podiumThemeOpen(true), true);
  assert.deepEqual(bracketThemeOptions(true), ['bright', 'dark', 'podium']);
});

test('visibleBracketTheme falls back when Podium is not allowed or Coach demo is plain', () => {
  assert.equal(visibleBracketTheme('podium', { whiteBaseSkins: true }), 'podium');
  assert.equal(visibleBracketTheme('podium', { whiteBaseSkins: false }), 'bright');
  assert.equal(visibleBracketTheme('dark', { whiteBaseSkins: false }), 'dark');
  assert.equal(visibleBracketTheme('podium', { plainCoach: true, whiteBaseSkins: true }), 'bright');
  assert.equal(visibleBracketTheme('dark', { plainCoach: true, whiteBaseSkins: true }), 'bright');
});

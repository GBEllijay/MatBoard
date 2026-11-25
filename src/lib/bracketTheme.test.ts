import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRACKET_SKIN_THEMES,
  BRACKET_THEME_KEY,
  BRACKET_THEME_LABELS,
  BRACKET_THEMES,
  DEFAULT_BRACKET_THEME,
  WHITE_BRACKET_THEME,
  bracketThemeOptions,
  getBracketTheme,
  isBracketSkinTheme,
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

test('Podium & Mat Strip is a registered bracket theme alongside Advantage and Dark', () => {
  assert.deepEqual([...BRACKET_THEMES], ['bright', 'dark', 'podium']);
  assert.equal(WHITE_BRACKET_THEME, 'podium');
  assert.equal(BRACKET_THEME_LABELS.bright, 'Advantage');
  assert.equal(BRACKET_THEME_LABELS.dark, 'Dark');
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

test('Polished bracket skins are listed after the base themes only when polished skins are open', () => {
  assert.equal(BRACKET_SKIN_THEMES.length, 16);
  assert.deepEqual(bracketThemeOptions(true, false), ['bright', 'dark', 'podium']);
  assert.deepEqual(bracketThemeOptions(false, true), ['bright', 'dark', ...BRACKET_SKIN_THEMES]);
  assert.deepEqual(bracketThemeOptions(true, true), ['bright', 'dark', 'podium', ...BRACKET_SKIN_THEMES]);
  for (const slug of BRACKET_SKIN_THEMES) {
    assert.equal(isBracketTheme(slug), true, slug);
    assert.equal(isBracketSkinTheme(slug), true, slug);
    assert.ok(BRACKET_THEME_LABELS[slug], slug);
  }
  assert.equal(isBracketSkinTheme('podium'), false);
  assert.equal(BRACKET_THEME_LABELS['arcade-fighter'], 'Arcade Fighter');
  assert.equal(BRACKET_THEME_LABELS.calcadao, 'Calçadão');
});

test('A stored bracket skin persists and paints only when polished skins are open', () => {
  setBracketTheme('mech-battle');
  assert.equal(getBracketTheme(), 'mech-battle');
  assert.equal(localStorage.getItem(BRACKET_THEME_KEY), 'mech-battle');
  assert.equal(visibleBracketTheme('mech-battle', { polishedSkins: true }), 'mech-battle');
  assert.equal(visibleBracketTheme('mech-battle', { polishedSkins: false }), 'bright');
  assert.equal(visibleBracketTheme('mech-battle', {}), 'bright');
  assert.equal(visibleBracketTheme('mech-battle', { plainCoach: true, polishedSkins: true }), 'bright');
  setBracketTheme('bright');
});

test('Saved keynote bracket theme maps to Stage and rewrites the stored slug', () => {
  localStorage.setItem(BRACKET_THEME_KEY, 'keynote');
  assert.equal(getBracketTheme(), 'stage');
  assert.equal(localStorage.getItem(BRACKET_THEME_KEY), 'stage');
});

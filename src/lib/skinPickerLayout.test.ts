import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { POLISHED_SKINS, POLISHED_TIMER_SKINS } from './polishedSkins.ts';
import { SCOREBOARD_SKIN, parseScoreboardSkin, scoreboardPickerSkins } from './scoreboardSkin.ts';
import {
  groupSkinPickerOptions,
  scrollSkinOptionIntoView,
  skinPickerColumnCount,
  skinPickerPopupWidth,
  skinPickerScrollMax,
} from './skinPickerLayout.ts';
import { getTrainingSkin, setTrainingSkin, TRAINING_SKIN_KEY, timerPickerSkins } from './trainingSkin.ts';

const COMING_ANIME = ['Coming anime 1', 'Coming anime 2', 'Coming anime 3', 'Coming anime 4', 'Coming anime 5', 'Coming anime 6'];

test('the picker is 3 columns on a phone and 4 or 5 on a wide screen', () => {
  assert.equal(skinPickerColumnCount(390), 3);
  assert.equal(skinPickerColumnCount(719), 3);
  assert.equal(skinPickerColumnCount(720), 4);
  assert.equal(skinPickerColumnCount(1099), 4);
  assert.equal(skinPickerColumnCount(1100), 5);
  assert.equal(skinPickerColumnCount(1920), 5);
  const phone = skinPickerPopupWidth(390);
  assert.ok(phone <= 390 - 16, `phone popup ${phone}px is wider than the screen`);
  assert.ok(skinPickerPopupWidth(1920) > phone);
});

test('a tall list peeks the next row, and a short list does not scroll', () => {
  const phone = skinPickerScrollMax({
    viewportWidth: 390,
    viewportHeight: 844,
    space: 700,
    rowHeight: 120,
    contentHeight: 2000,
  });
  assert.ok(phone < 2000);
  assert.ok(phone <= 460);
  assert.ok(phone > 120);
  assert.notEqual(phone % 120, 0, 'the next row should peek instead of ending on a row boundary');

  const tv = skinPickerScrollMax({
    viewportWidth: 1920,
    viewportHeight: 1080,
    space: 900,
    rowHeight: 120,
    contentHeight: 2000,
  });
  assert.ok(tv < 2000);
  assert.ok(tv <= 440);
  assert.notEqual(tv % 120, 0);

  const fitted = skinPickerScrollMax({
    viewportWidth: 390,
    viewportHeight: 844,
    space: 700,
    rowHeight: 120,
    contentHeight: 280,
  });
  assert.equal(fitted, 280);
});

test('White sees three Advantage skins and My skins stays hidden while empty', () => {
  const board = scoreboardPickerSkins(true, false, true);
  const timer = timerPickerSkins(false, true);
  assert.deepEqual(
    board.map((skin) => skin.label),
    ['Mock-Tournament', 'Old School', 'Quick Result'],
  );
  assert.deepEqual(
    timer.map((skin) => skin.label),
    ['Mock-Tournament', 'Old School', 'Quick Result'],
  );
  for (const skin of [...board, ...timer]) {
    assert.equal(POLISHED_SKINS.some((polished) => polished.label === skin.label), false);
  }
  const groups = groupSkinPickerOptions(board.map((skin) => ({ id: skin.id })));
  assert.deepEqual(
    groups.map((group) => group.label),
    ['Advantage skins'],
  );
  assert.equal(groupSkinPickerOptions(board.map((skin) => ({ id: skin.id })), false).some((group) => group.id === 'mine'), false);
});

test('Media Edition lists the skins it already had, with no empty My skins section', () => {
  const timer = timerPickerSkins(true, false);
  const plain = scoreboardPickerSkins(true, true, false);
  assert.equal(timer.length, 12);
  assert.deepEqual(
    timer.map((skin) => skin.id),
    ['classic', 'themed', ...POLISHED_TIMER_SKINS.map((skin) => skin.slug)],
  );
  assert.equal(plain.length, 1 + POLISHED_SKINS.length);
  const groups = groupSkinPickerOptions(timer.map((skin) => ({ id: skin.id })));
  assert.deepEqual(
    groups.map((group) => group.label),
    ['Advantage skins'],
  );
  assert.equal(groups[0]?.options.length, 12);
  const coming = groupSkinPickerOptions([
    ...timer.map((skin) => ({ id: skin.id })),
    ...COMING_ANIME.map((label) => ({ id: label })),
  ]);
  assert.equal(coming[0]?.options.length, 18);
  assert.equal(POLISHED_TIMER_SKINS.some((skin) => COMING_ANIME.includes(skin.label)), false);
});

test('My skins appears when it has tiles and stays hidden while empty', () => {
  const hidden = groupSkinPickerOptions([{ id: 'classic' }]);
  assert.deepEqual(
    hidden.map((group) => group.id),
    ['advantage'],
  );
  const shown = groupSkinPickerOptions([
    { id: 'classic' },
    { id: 'custom:skinabc12345', section: 'mine' },
  ]);
  assert.deepEqual(
    shown.map((group) => group.label),
    ['Advantage skins', 'My skins'],
  );
  assert.equal(shown[1]?.options.length, 1);
});

function ensureStorage(): void {
  if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') return;
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
}

test('a chosen skin stays stored on this device', () => {
  ensureStorage();
  setTrainingSkin('QUICK_RESULT');
  assert.equal(getTrainingSkin(), 'QUICK_RESULT');
  assert.equal(localStorage.getItem(TRAINING_SKIN_KEY), 'QUICK_RESULT');
  assert.equal(parseScoreboardSkin(SCOREBOARD_SKIN.OLD_SCHOOL), SCOREBOARD_SKIN.OLD_SCHOOL);
  assert.equal(parseScoreboardSkin('not-a-skin'), SCOREBOARD_SKIN.MOCK_TOURNAMENT);
  setTrainingSkin('classic');
  assert.equal(getTrainingSkin(), 'classic');
});

test('opening the picker scrolls the selected skin into view', () => {
  const calls: string[] = [];
  const selected = {
    getAttribute: (name: string) => (name === 'data-skin-option' ? 'visionary' : null),
    scrollIntoView(options: ScrollIntoViewOptions) {
      calls.push(`${this.getAttribute('data-skin-option')}:${options.block}`);
    },
  };
  const root = {
    querySelector(selector: string) {
      assert.match(selector, /visionary/);
      return selected;
    },
  };
  assert.equal(scrollSkinOptionIntoView(root as unknown as ParentNode, 'visionary'), true);
  assert.deepEqual(calls, ['visionary:nearest']);
  const missing = { querySelector: () => null };
  assert.equal(scrollSkinOptionIntoView(missing as unknown as ParentNode, 'missing'), false);
});

test('the popup scrolls with touch, wheel, and a fade over the peeking row', () => {
  const css = fs.readFileSync(new URL('../components/skinPicker.css', import.meta.url), 'utf8');
  assert.match(css, /\.skin-pick__scroll\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /touch-action:\s*pan-y/);
  assert.match(css, /\.skin-pick__fade\s*\{[^}]*linear-gradient/);
  assert.match(css, /--skin-tile-img:\s*4\.15rem/);
  assert.match(css, /grid-template-columns:\s*repeat\(var\(--skin-cols, 3\)/);
});

test('skin picker dialog regressions', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['scripts/run-skin-picker-regressions.mjs'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env,
  });
  assert.equal(result.status, 0);
});

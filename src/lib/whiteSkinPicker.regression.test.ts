import assert from 'node:assert/strict';
import test from 'node:test';
import type { Door } from './entitlementToken.ts';
import { impliedDoors } from './tierImplications.ts';
import { POLISHED_SKINS, POLISHED_TIMER_SKINS, polishedSkinAccessFromDoors, polishedSkinsUnlocked } from './polishedSkins.ts';
import {
  SCOREBOARD_SKIN,
  SELECTABLE_SCOREBOARD_SKINS,
  scoreboardPickerSkins,
  visibleScoreboardSkin,
} from './scoreboardSkin.ts';
import {
  TRAINING_SKIN_KEY,
  getTrainingSkin,
  setTrainingSkin,
  timerPickerSkins,
  visibleTrainingSkin,
} from './trainingSkin.ts';
import { whiteBaseSkinTier } from './whiteSkinTier.ts';

// Scrolling picker regressions run with this file so `npm test` picks them up.
import './skinPickerLayout.test.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    key: () => null,
    length: 0,
    clear: () => store.clear(),
  };
}

const local = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });

const BASE_LABELS = ['Mock-Tournament', 'Old School', 'Quick Result'] as const;
const HIDDEN = [...POLISHED_TIMER_SKINS.map((skin) => skin.label), 'Classic', 'Advantage', 'Unlock', 'Media Edition'];

function doorsFor(grants: readonly string[]): Record<Door, boolean> {
  const open = new Set(impliedDoors(grants));
  return {
    white: open.has('white'),
    student: open.has('student'),
    media: open.has('media'),
    coach: open.has('coach'),
    pro: open.has('pro'),
  };
}

const TIERS = [
  ['White', ['white'], false],
  ['Student', ['student'], false],
  ['Media', ['media'], true],
  ['Instructor', ['coach'], true],
  ['Pro', ['pro'], true],
] as const;

test('White scoreboard and round timer list exactly the three base skins', () => {
  const doors = doorsFor(['white']);
  assert.equal(whiteBaseSkinTier(doors), true);
  assert.equal(polishedSkinsUnlocked(polishedSkinAccessFromDoors(impliedDoors(['white']))), false);
  const board = scoreboardPickerSkins(true, false, true);
  const timer = timerPickerSkins(false, true);
  assert.deepEqual(board.map((skin) => skin.label), [...BASE_LABELS]);
  assert.deepEqual(timer.map((skin) => skin.label), [...BASE_LABELS]);
  assert.deepEqual(
    board.map((skin) => skin.id),
    [SCOREBOARD_SKIN.MOCK_TOURNAMENT, SCOREBOARD_SKIN.OLD_SCHOOL, SCOREBOARD_SKIN.QUICK_RESULT],
  );
  assert.equal(board.length, 3);
  assert.equal(timer.length, 3);
  for (const label of [...board.map((skin) => skin.label), ...timer.map((skin) => skin.label)]) {
    assert.equal(HIDDEN.includes(label), false, label);
  }
  assert.equal(timer.some((skin) => skin.polished), false);
  // A suite board on White is the same three. The new families stay out.
  assert.deepEqual(scoreboardPickerSkins(false, false, true).map((skin) => skin.label), [...BASE_LABELS]);
});

test('White paints Old School and Quick Result, and a hidden skin falls back to Mock-Tournament', () => {
  assert.equal(
    visibleScoreboardSkin(SCOREBOARD_SKIN.OLD_SCHOOL, false, false, false, false, true),
    SCOREBOARD_SKIN.OLD_SCHOOL,
  );
  assert.equal(
    visibleScoreboardSkin(SCOREBOARD_SKIN.QUICK_RESULT, false, false, false, false, true),
    SCOREBOARD_SKIN.QUICK_RESULT,
  );
  assert.equal(
    visibleScoreboardSkin(SCOREBOARD_SKIN.KEYNOTE, false, false, false, false, true),
    SCOREBOARD_SKIN.MOCK_TOURNAMENT,
  );
  assert.equal(visibleTrainingSkin('OLD_SCHOOL', false, true), 'OLD_SCHOOL');
  assert.equal(visibleTrainingSkin('QUICK_RESULT', false, true), 'QUICK_RESULT');
  assert.equal(visibleTrainingSkin('classic', false, true), 'MOCK_TOURNAMENT');
  assert.equal(visibleTrainingSkin('themed', false, true), 'MOCK_TOURNAMENT');
  local.clear();
  setTrainingSkin('visionary');
  assert.equal(getTrainingSkin(), 'visionary');
  assert.equal(local.getItem(TRAINING_SKIN_KEY), 'visionary');
  assert.equal(visibleTrainingSkin(getTrainingSkin(), false, true), 'MOCK_TOURNAMENT');
  assert.equal(getTrainingSkin(), 'visionary', 'the saved pick is kept');
});

test('Student, Media, Instructor, and Pro keep the skin lists they already had', () => {
  for (const [name, grants, open] of TIERS) {
    const doors = doorsFor(grants);
    const gate = polishedSkinsUnlocked(polishedSkinAccessFromDoors(impliedDoors(grants)));
    assert.equal(gate, open, name);
    assert.equal(gate, doors.media, `${name} follows the Media door`);
    if (name === 'White') {
      assert.equal(whiteBaseSkinTier(doors), true);
      continue;
    }
    assert.equal(whiteBaseSkinTier(doors), false, name);
    const timer = timerPickerSkins(gate, false).map((skin) => skin.id);
    const plain = scoreboardPickerSkins(true, gate, false).map((skin) => skin.id);
    const suite = scoreboardPickerSkins(false, gate, false).map((skin) => skin.id);
    if (open) {
      assert.deepEqual(timer, ['classic', 'themed', ...POLISHED_TIMER_SKINS.map((skin) => skin.slug)], `${name} timer`);
      assert.deepEqual(plain, [SCOREBOARD_SKIN.MOCK_TOURNAMENT, ...POLISHED_SKINS.map((skin) => skin.id)], `${name} plain board`);
      assert.deepEqual(
        suite,
        [...SELECTABLE_SCOREBOARD_SKINS.map((skin) => skin.id), ...POLISHED_SKINS.map((skin) => skin.id)],
        `${name} suite board`,
      );
    } else {
      assert.deepEqual(timer, ['classic', 'themed'], `${name} timer`);
      assert.deepEqual(plain, [SCOREBOARD_SKIN.MOCK_TOURNAMENT], `${name} plain board`);
      assert.deepEqual(
        suite,
        SELECTABLE_SCOREBOARD_SKINS.map((skin) => skin.id),
        `${name} suite board`,
      );
    }
    assert.equal(visibleScoreboardSkin(SCOREBOARD_SKIN.OLD_SCHOOL, false, false, false, open, false), SCOREBOARD_SKIN.MOCK_TOURNAMENT);
    assert.equal(visibleScoreboardSkin(SCOREBOARD_SKIN.OLD_SCHOOL, true, false, false, open, false), SCOREBOARD_SKIN.OLD_SCHOOL);
    assert.equal(visibleTrainingSkin('classic', open, false), 'classic');
    assert.equal(visibleTrainingSkin('themed', open, false), 'themed');
    assert.equal(visibleTrainingSkin('OLD_SCHOOL', open, false), 'classic');
    assert.equal(visibleTrainingSkin('reggae', open, false), open ? 'reggae' : 'classic');
  }
});

test('an open higher door is not the White catalog, including when PR #353 reopens Media', () => {
  // Instructor implies Media. #353 reopens that Media door when Instructor is open.
  // Either way the browser is not White-only, so it keeps the higher-tier list.
  const instructor = doorsFor(['coach']);
  assert.equal(instructor.white, true);
  assert.equal(instructor.media, true);
  assert.equal(whiteBaseSkinTier(instructor), false);
  assert.equal(whiteBaseSkinTier(doorsFor(['pro'])), false);
  assert.equal(whiteBaseSkinTier(doorsFor(['media'])), false);
  assert.equal(whiteBaseSkinTier(doorsFor(['student'])), false);
});

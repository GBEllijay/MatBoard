import assert from 'node:assert/strict';
import test from 'node:test';
import { SCOREBOARD_SKIN, scoreboardSkinClass } from './scoreboardSkin.ts';
import {
  applyEmptyBoutNames,
  applyMatchOutcome,
  applySlotName,
  defaultTournament,
  normalizeBoard,
  sanitizeBoutPoints,
  slotName,
} from './tournamentStore.ts';
import {
  CARLOS_ASSET,
  KIDS_MODE_KEY,
  KIDS_SCOREBOARDS_NAME,
  KIDS_SKINS,
  KIDS_WIN_CHEER,
  getKidsScoreboard,
  kidsLiveLine,
  kidsPointsLine,
  kidsShowWin,
  kidsSkinLabel,
  kidsWallpaperPath,
  kidsWinLines,
  kidsWinState,
  setKidsEnabled,
  setKidsSkin,
} from './kidsScoreboard.ts';

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
    clear: () => {
      store.clear();
    },
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

test("Kids' Scoreboards is off until this device turns it on", () => {
  storage.removeItem(KIDS_MODE_KEY);
  assert.equal(KIDS_SCOREBOARDS_NAME, "Kids' Scoreboards");
  assert.equal(KIDS_WIN_CHEER, 'Bom trabalho!');
  assert.equal(CARLOS_ASSET, '/assets/kids/carlos.webp');
  assert.deepEqual(getKidsScoreboard(), { enabled: false, skin: 'dinos' });
  assert.deepEqual(
    KIDS_SKINS.map((skin) => skin.label),
    ['Dinos', 'Stars & unicorns', 'Robots', 'Space', 'Ocean', 'Superheroes'],
  );
});

test('Kids mode and skin persist on this device', () => {
  setKidsEnabled(true);
  setKidsSkin('ocean');
  assert.deepEqual(getKidsScoreboard(), { enabled: true, skin: 'ocean' });
  assert.equal(localStorage.getItem(KIDS_MODE_KEY), JSON.stringify({ enabled: true, skin: 'ocean' }));
  assert.equal(kidsSkinLabel('unicorns'), 'Stars & unicorns');
  assert.equal(kidsWallpaperPath('robots'), '/assets/kids/robots.webp');
  setKidsEnabled(false);
  assert.equal(getKidsScoreboard().enabled, false);
  assert.equal(getKidsScoreboard().skin, 'ocean');
});

test('Unknown kids skin falls back to Dinos and stays off when the flag is missing', () => {
  localStorage.setItem(KIDS_MODE_KEY, JSON.stringify({ enabled: true, skin: 'tatami' }));
  assert.deepEqual(getKidsScoreboard(), { enabled: true, skin: 'dinos' });
  localStorage.setItem(KIDS_MODE_KEY, '{');
  assert.deepEqual(getKidsScoreboard(), { enabled: false, skin: 'dinos' });
});

test('Carlos appears only after a champion, with a stored score like 12-0', () => {
  assert.equal(kidsShowWin(false, 'Mia Santos'), false);
  assert.equal(kidsShowWin(true, ''), false);
  assert.equal(kidsShowWin(true, '   '), false);
  assert.equal(kidsShowWin(true, 'Mia Santos'), true);
  assert.equal(kidsPointsLine({ winner: 12, loser: 0 }), '12-0');
  assert.equal(kidsPointsLine(undefined), null);
  assert.equal(kidsPointsLine({ winner: 12.5, loser: 0 }), null);
  assert.deepEqual(kidsWinLines('Mia Santos', '12-0'), ['Bom trabalho!', 'Mia Santos', '12-0']);
  assert.deepEqual(kidsWinLines('Mia Santos', null), ['Bom trabalho!', 'Mia Santos']);
  assert.equal(
    kidsLiveLine({
      title: 'T. Rex Cup',
      blueName: 'Mia Santos',
      whiteName: 'Leo Park',
      bluePoints: 2,
      whitePoints: 1,
    }),
    'T. Rex Cup 2 - 1',
  );
});

test('A championship finish over 10 points celebrates even when finalist slots were still placeholders', () => {
  const scored = applyMatchOutcome(
    defaultTournament(2),
    'final-0',
    'a',
    { call: 'win', method: 'points' },
    { toggle: false, points: sanitizeBoutPoints(12, 0) },
  );
  assert.equal(slotName(scored, 'champion'), '');
  const hidden = kidsWinState(false, scored);
  assert.equal(hidden.show, false);
  const win = kidsWinState(true, scored);
  assert.equal(win.show, true);
  assert.equal(win.name, 'Competitor 1');
  assert.equal(win.scoreLine, '12-0');
  assert.deepEqual(kidsWinLines(win.name, win.scoreLine), ['Bom trabalho!', 'Competitor 1', '12-0']);

  const white = applyMatchOutcome(
    defaultTournament(2),
    'final-0',
    'b',
    { call: 'win', method: 'points' },
    { toggle: false, points: sanitizeBoutPoints(11, 2) },
  );
  assert.equal(kidsWinState(true, white).name, 'Competitor 2');
  assert.equal(kidsWinState(true, white).scoreLine, '11-2');

  const openFinal = applyMatchOutcome(
    defaultTournament(4),
    'final-0',
    'a',
    { call: 'win', method: 'points' },
    { toggle: false, points: sanitizeBoutPoints(14, 0) },
  );
  assert.equal(slotName(openFinal, 'champion'), '');
  assert.equal(kidsWinState(true, openFinal).show, true);
  assert.equal(kidsWinState(true, openFinal).name, 'Competitor 1');
  assert.equal(kidsWinState(true, openFinal).scoreLine, '14-0');
});

test('Carlos stays off during an earlier live bout, and a scoreboard name fills an empty finalist', () => {
  let board = defaultTournament(4);
  board = applySlotName(board, 'sf-0-a', 'Mia Santos');
  board = applySlotName(board, 'sf-0-b', 'Leo Park');
  board = applyMatchOutcome(
    board,
    'sf-0',
    'a',
    { call: 'win', method: 'points' },
    { toggle: false, points: sanitizeBoutPoints(12, 0) },
  );
  assert.equal(kidsWinState(true, board).show, false);
  assert.equal(kidsWinState(true, defaultTournament(2)).show, false);

  const named = applyEmptyBoutNames(defaultTournament(2), 'final-0', {
    a: 'Mia Santos',
    b: 'Competitor 2',
  });
  assert.equal(slotName(named, 'final-0-a'), 'Mia Santos');
  assert.equal(slotName(named, 'final-0-b'), '');
  const kept = applyEmptyBoutNames(named, 'final-0', { a: 'Someone Else', b: 'Leo Park' });
  assert.equal(slotName(kept, 'final-0-a'), 'Mia Santos');
  assert.equal(slotName(kept, 'final-0-b'), 'Leo Park');
  const scored = applyMatchOutcome(
    kept,
    'final-0',
    'a',
    { call: 'win', method: 'points' },
    { toggle: false, points: sanitizeBoutPoints(12, 0) },
  );
  const win = kidsWinState(true, scored);
  assert.equal(win.show, true);
  assert.equal(win.name, 'Mia Santos');
  assert.equal(win.scoreLine, '12-0');
  assert.equal(slotName(scored, 'champion'), 'Mia Santos');
});

test('A scoreboard win stores the points on the bracket without changing adult skins', () => {
  const board = applyMatchOutcome(
    defaultTournament(4),
    'final-0',
    'a',
    { call: 'win', method: 'points' },
    { toggle: false, points: sanitizeBoutPoints(12, 0) },
  );
  assert.deepEqual(board.results['final-0']?.points, { winner: 12, loser: 0 });
  const restored = normalizeBoard(JSON.parse(JSON.stringify(board)));
  assert.deepEqual(restored.results['final-0']?.points, { winner: 12, loser: 0 });
  assert.equal(sanitizeBoutPoints(100, 0), undefined);
  setKidsEnabled(true);
  setKidsSkin('dinos');
  assert.equal(scoreboardSkinClass(), 'scoreboard-skin--mock-tournament');
  assert.equal(scoreboardSkinClass(SCOREBOARD_SKIN.KIDS), 'scoreboard-skin--mock-tournament');
});

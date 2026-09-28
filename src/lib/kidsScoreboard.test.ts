import assert from 'node:assert/strict';
import test from 'node:test';
import { SCOREBOARD_SKIN, scoreboardSkinClass } from './scoreboardSkin.ts';
import {
  applyMatchOutcome,
  defaultTournament,
  normalizeBoard,
  sanitizeBoutPoints,
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

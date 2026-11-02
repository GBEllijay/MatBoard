import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_GRANDMASTER_POINTS_THRESHOLD,
  DEFAULT_GRANDMASTER_PREFS,
  LEGACY_GRANDMASTER_PREFS_KEY,
  grandmasterMatchComplete,
  grandmasterOnScoreboard,
  grandmasterPrefsFromStored,
  matchGrandmasterView,
  parseGrandmasterPrefs,
  parseGrandmasterThreshold,
  refereeDecisionWin,
  type GrandmasterCelebrationPrefs,
} from './grandmasterCelebration.ts';
import type { MatchOutcome } from './outcomes.ts';

const base = {
  prefs: { ...DEFAULT_GRANDMASTER_PREFS, enabled: true },
  outcome: null as MatchOutcome | null,
  blueName: 'Mia Santos',
  whiteName: 'Leo Park',
  bluePoints: 0,
  whitePoints: 0,
  matchComplete: false,
};

function win(side: 'blue' | 'white'): MatchOutcome {
  return { call: 'win', method: 'points', side, source: 'manual', at: 1 };
}

test('Grandmaster cheer on the match board is Pro suite only', () => {
  assert.equal(grandmasterOnScoreboard(true), true);
  assert.equal(grandmasterOnScoreboard(false), false);
});

test('Grandmaster cheer stays off until the controller turns it on', () => {
  assert.equal(DEFAULT_GRANDMASTER_PREFS.enabled, false);
  assert.equal(DEFAULT_GRANDMASTER_PREFS.onWin, true);
  assert.equal(DEFAULT_GRANDMASTER_PREFS.onPoints, true);
  assert.equal(DEFAULT_GRANDMASTER_POINTS_THRESHOLD, 10);
  assert.deepEqual(parseGrandmasterPrefs(undefined), DEFAULT_GRANDMASTER_PREFS);
  assert.deepEqual(
    matchGrandmasterView({ ...base, prefs: DEFAULT_GRANDMASTER_PREFS, outcome: win('blue'), bluePoints: 12 }),
    { show: false, lines: [] },
  );
});

test('A match win brings the grandmaster out with Bom trabalho and the score', () => {
  const view = matchGrandmasterView({ ...base, outcome: win('blue'), bluePoints: 12, whitePoints: 0 });
  assert.equal(view.show, true);
  assert.deepEqual(view.lines, ['Bom trabalho!', 'Mia Santos', '12-0']);
});

test('a DQ stays quiet even when that athlete is over the points total', () => {
  const dq: MatchOutcome = { call: 'dq', reason: 'technical', side: 'blue', source: 'manual', at: 3 };
  const prefs: GrandmasterCelebrationPrefs = { ...base.prefs, onWin: true, onPoints: true, pointsThreshold: 1 };
  assert.equal(
    matchGrandmasterView({ ...base, prefs, outcome: dq, bluePoints: 4, whitePoints: 0, matchComplete: true }).show,
    false,
  );
});

test('DQ is not a win trigger, and the win trigger can be turned off alone', () => {
  const dq: MatchOutcome = { call: 'dq', reason: 'technical', side: 'white', source: 'manual', at: 2 };
  assert.equal(matchGrandmasterView({ ...base, outcome: dq, bluePoints: 4 }).show, false);
  const prefs: GrandmasterCelebrationPrefs = { ...base.prefs, onWin: false };
  assert.equal(matchGrandmasterView({ ...base, prefs, outcome: win('white'), whitePoints: 4 }).show, false);
});

test('Points over the threshold stay hidden until the match ends, and the threshold itself does not', () => {
  assert.equal(matchGrandmasterView({ ...base, bluePoints: 11, whitePoints: 2 }).show, false);
  assert.equal(matchGrandmasterView({ ...base, matchComplete: true, bluePoints: 10 }).show, false);
  const over = matchGrandmasterView({ ...base, matchComplete: true, bluePoints: 11, whitePoints: 2 });
  assert.equal(over.show, true);
  assert.deepEqual(over.lines, ['Bom trabalho!', 'Mia Santos', '11']);
  const prefs: GrandmasterCelebrationPrefs = { ...base.prefs, onPoints: false };
  assert.equal(matchGrandmasterView({ ...base, prefs, matchComplete: true, bluePoints: 14 }).show, false);
});

test('A live or paused clock is not match end; 0:00 or a recorded result is', () => {
  assert.equal(grandmasterMatchComplete({ running: true, remainingMs: 60_000, outcome: null }), false);
  assert.equal(grandmasterMatchComplete({ running: false, remainingMs: 60_000, outcome: null }), false);
  assert.equal(grandmasterMatchComplete({ running: false, remainingMs: 0, outcome: null }), true);
  assert.equal(grandmasterMatchComplete({ running: true, remainingMs: 30_000, outcome: win('blue') }), true);
});

test('A win is the cheer when both triggers are on, and a custom threshold is kept', () => {
  const prefs: GrandmasterCelebrationPrefs = { ...base.prefs, pointsThreshold: 6 };
  const view = matchGrandmasterView({
    ...base,
    prefs,
    outcome: win('white'),
    bluePoints: 11,
    whitePoints: 8,
  });
  assert.deepEqual(view.lines, ['Bom trabalho!', 'Leo Park', '8-11']);
  assert.equal(parseGrandmasterThreshold(6), 6);
  assert.equal(parseGrandmasterThreshold(0), 10);
  assert.equal(parseGrandmasterThreshold(99), 10);
  assert.deepEqual(parseGrandmasterPrefs({ enabled: true, onWin: false, pointsThreshold: 8 }), {
    enabled: true,
    onWin: false,
    onPoints: true,
    pointsThreshold: 8,
    masterId: null,
    cheerKey: null,
    boutSerial: 0,
  });
});

test('The higher score is named when both competitors are over, and a tie names both', () => {
  assert.equal(matchGrandmasterView({ ...base, bluePoints: 12, whitePoints: 15 }).show, false);
  const leader = matchGrandmasterView({ ...base, matchComplete: true, bluePoints: 12, whitePoints: 15 });
  assert.deepEqual(leader.lines, ['Bom trabalho!', 'Leo Park', '15']);
  const tied = matchGrandmasterView({ ...base, matchComplete: true, bluePoints: 12, whitePoints: 12 });
  assert.deepEqual(tied.lines, ['Bom trabalho!', 'Mia Santos & Leo Park', '12']);
});

test('A referee-decision win brings the grandmaster out only after the bout is over', () => {
  assert.equal(matchGrandmasterView({ ...base, refDecisionSide: 'white', bluePoints: 2, whitePoints: 2 }).show, false);
  const pending = matchGrandmasterView({
    ...base,
    matchComplete: true,
    refDecisionSide: 'white',
    bluePoints: 2,
    whitePoints: 2,
  });
  assert.equal(pending.show, true);
  assert.deepEqual(pending.lines, ['Bom trabalho!', 'Leo Park', '2-2']);
  const recorded = matchGrandmasterView({
    ...base,
    outcome: refereeDecisionWin('blue'),
    bluePoints: 4,
    whitePoints: 4,
  });
  assert.equal(recorded.show, true);
  assert.deepEqual(recorded.lines, ['Bom trabalho!', 'Mia Santos', '4-4']);
  assert.equal(refereeDecisionWin('blue').method, 'decision');
});

test('the grandmaster slide-in stands still when motion is reduced', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const start = css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .kids-grandmaster__figure');
  assert.ok(start >= 0);
  const slice = css.slice(start, start + 320);
  assert.match(slice, /animation: none/);
  assert.match(slice, /\.kids-grandmaster__frame--nod \{\s*animation: none;\s*opacity: 0/);
  assert.match(slice, /\.kids-confetti \{\s*display: none/);
});

test('a cheer switch saved under the previous key stays on, then is stored under grandmaster', () => {
  const migrated = grandmasterPrefsFromStored({
    [LEGACY_GRANDMASTER_PREFS_KEY]: { enabled: true, onWin: false, onPoints: true, pointsThreshold: 8 },
  });
  assert.equal(migrated.enabled, true);
  assert.equal(migrated.onWin, false);
  assert.equal(migrated.onPoints, true);
  assert.equal(migrated.pointsThreshold, 8);
  assert.equal(migrated.masterId, null);
  const saved = { grandmaster: migrated };
  assert.equal(Object.hasOwn(saved, LEGACY_GRANDMASTER_PREFS_KEY), false);
  assert.deepEqual(grandmasterPrefsFromStored(saved), migrated);
  const preferNew = grandmasterPrefsFromStored({
    grandmaster: { enabled: false, pointsThreshold: 4 },
    [LEGACY_GRANDMASTER_PREFS_KEY]: { enabled: true, pointsThreshold: 9 },
  });
  assert.equal(preferNew.enabled, false);
  assert.equal(preferNew.pointsThreshold, 4);
});

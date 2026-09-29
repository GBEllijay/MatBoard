import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CARLOS_POINTS_THRESHOLD,
  DEFAULT_CARLOS_PREFS,
  matchCarlosView,
  parseCarlosPrefs,
  parseCarlosThreshold,
  type CarlosCelebrationPrefs,
} from './carlosCelebration.ts';
import type { MatchOutcome } from './outcomes.ts';

const base = {
  prefs: { ...DEFAULT_CARLOS_PREFS, enabled: true },
  outcome: null as MatchOutcome | null,
  blueName: 'Mia Santos',
  whiteName: 'Leo Park',
  bluePoints: 0,
  whitePoints: 0,
};

function win(side: 'blue' | 'white'): MatchOutcome {
  return { call: 'win', method: 'points', side, source: 'manual', at: 1 };
}

test('Master Carlos stays off until the controller turns him on', () => {
  assert.equal(DEFAULT_CARLOS_PREFS.enabled, false);
  assert.equal(DEFAULT_CARLOS_PREFS.onWin, true);
  assert.equal(DEFAULT_CARLOS_PREFS.onPoints, true);
  assert.equal(DEFAULT_CARLOS_POINTS_THRESHOLD, 10);
  assert.deepEqual(parseCarlosPrefs(undefined), DEFAULT_CARLOS_PREFS);
  assert.deepEqual(
    matchCarlosView({ ...base, prefs: DEFAULT_CARLOS_PREFS, outcome: win('blue'), bluePoints: 12 }),
    { show: false, lines: [] },
  );
});

test('A match win brings Carlos out with Bom trabalho and the score', () => {
  const view = matchCarlosView({ ...base, outcome: win('blue'), bluePoints: 12, whitePoints: 0 });
  assert.equal(view.show, true);
  assert.deepEqual(view.lines, ['Bom trabalho!', 'Mia Santos', '12-0']);
});

test('DQ is not a win trigger, and the win trigger can be turned off alone', () => {
  const dq: MatchOutcome = { call: 'dq', reason: 'technical', side: 'white', source: 'manual', at: 2 };
  assert.equal(matchCarlosView({ ...base, outcome: dq, bluePoints: 4 }).show, false);
  const prefs: CarlosCelebrationPrefs = { ...base.prefs, onWin: false };
  assert.equal(matchCarlosView({ ...base, prefs, outcome: win('white'), whitePoints: 4 }).show, false);
});

test('Points over the threshold bring Carlos out, and the threshold itself does not', () => {
  assert.equal(matchCarlosView({ ...base, bluePoints: 10 }).show, false);
  const over = matchCarlosView({ ...base, bluePoints: 11, whitePoints: 2 });
  assert.equal(over.show, true);
  assert.deepEqual(over.lines, ['Bom trabalho!', 'Mia Santos', '11']);
  const prefs: CarlosCelebrationPrefs = { ...base.prefs, onPoints: false };
  assert.equal(matchCarlosView({ ...base, prefs, bluePoints: 14 }).show, false);
});

test('A win is the cheer when both triggers are on, and a custom threshold is kept', () => {
  const prefs: CarlosCelebrationPrefs = { ...base.prefs, pointsThreshold: 6 };
  const view = matchCarlosView({
    ...base,
    prefs,
    outcome: win('white'),
    bluePoints: 11,
    whitePoints: 8,
  });
  assert.deepEqual(view.lines, ['Bom trabalho!', 'Leo Park', '8-11']);
  assert.equal(parseCarlosThreshold(6), 6);
  assert.equal(parseCarlosThreshold(0), 10);
  assert.equal(parseCarlosThreshold(99), 10);
  assert.deepEqual(parseCarlosPrefs({ enabled: true, onWin: false, pointsThreshold: 8 }), {
    enabled: true,
    onWin: false,
    onPoints: true,
    pointsThreshold: 8,
  });
});

test('The higher score is named when both competitors are over, and a tie names both', () => {
  const leader = matchCarlosView({ ...base, bluePoints: 12, whitePoints: 15 });
  assert.deepEqual(leader.lines, ['Bom trabalho!', 'Leo Park', '15']);
  const tied = matchCarlosView({ ...base, bluePoints: 12, whitePoints: 12 });
  assert.deepEqual(tied.lines, ['Bom trabalho!', 'Mia Santos & Leo Park', '12']);
});

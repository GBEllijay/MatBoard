import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const board = readFileSync(new URL('../pages/MatchController.tsx', import.meta.url), 'utf8');
const display = readFileSync(new URL('../pages/MatchDisplay.tsx', import.meta.url), 'utf8');
const bout = readFileSync(new URL('./bracketBout.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('./matchStore.ts', import.meta.url), 'utf8');

test('scoreboard controller keeps every control that was not part of this redesign', () => {
  for (const needle of [
    'Reset clock',
    'Reset scores',
    'aria-label="Division"',
    'aria-label="Weight"',
    'aria-label="Round"',
    'Start beep',
    '10-second warning',
    'Match end sound',
    'aria-label="Preview match cues"',
    'Auto-announce winner',
    '<EndCueControls label="Match end cue"',
    'Cast',
    'Display',
    'Back to bracket',
    'ScoreboardSkinPicker',
    'Open scoreboard on this device',
  ]) {
    assert.ok(board.includes(needle), needle);
  }
  assert.match(board, /label="Match length"/);
  assert.match(board, /label="Subtract one second"/);
  assert.match(board, /label="Add one second"/);
  assert.match(board, /aria-label=\{label\}/);
  assert.match(board, /setInterval\(fire, 80\)/);
  assert.doesNotMatch(board, /CLOCK_NUDGES_SEC|Subtract 5 seconds|Add 5 seconds|Match length presets|inputMode="decimal"/);
});

test('weight shows on the display only when it is filled, beside division', () => {
  assert.match(display, /division\.trim\(\) \|\| 'Open'/);
  assert.match(display, /weightText \?/);
  assert.match(display, /focus="weight"/);
  assert.match(display, /<ClassLine division=\{match\.division\} weight=\{match\.weight\}/);
});

test('a bracket launch still links the bout and fills the round from that slot', () => {
  assert.match(bout, /round: roundFromBracket\(matchId, tournament\.size\)/);
  assert.match(bout, /division: tournament\.title\.trim\(\)/);
  assert.match(store, /bracketMatchId: action\.matchId/);
  assert.match(store, /setMatchOutcome\(/);
  assert.match(store, /normalizeMatchClock\(parsed\.durationMs, parsed\.remainingMs\)/);
  assert.match(store, /snapDurationMs\(action\.durationMs, MATCH_LENGTH_RANGE, DEFAULT_MATCH_MS\)/);
  assert.match(store, /weight: action\.matchId === current\.bracketMatchId \? current\.weight : ''/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { formatMinuteInput, parseTypedDurationMs } from './format.ts';

const MIN = 1_000;
const MAX = (99 * 60 + 59) * 1_000;

test('decimal minutes and m:ss both become a custom length', () => {
  assert.equal(parseTypedDurationMs('4.5', MIN, MAX), 4.5 * 60_000);
  assert.equal(parseTypedDurationMs('4:30', MIN, MAX), 4.5 * 60_000);
  assert.equal(parseTypedDurationMs('.5', 0, MAX), 30_000);
  assert.equal(parseTypedDurationMs('0', 0, 10 * 60_000), 0);
  assert.equal(parseTypedDurationMs('', MIN, MAX), null);
  assert.equal(parseTypedDurationMs('4:60', MIN, MAX), null);
  assert.equal(parseTypedDurationMs('abc', MIN, MAX), null);
  assert.equal(parseTypedDurationMs('0', MIN, MAX), MIN);
  assert.equal(parseTypedDurationMs('500', MIN, MAX), MAX);
});

test('minute field text round-trips to the second', () => {
  assert.equal(formatMinuteInput(5 * 60_000), '5');
  assert.equal(formatMinuteInput(90_000), '1.5');
  assert.equal(formatMinuteInput(0), '0');
  for (let seconds = 0; seconds <= 90; seconds += 1) {
    const ms = seconds * 1_000;
    const parsed = parseTypedDurationMs(formatMinuteInput(ms), 0, MAX);
    assert.equal(parsed, ms);
  }
});

test('custom length fields use a decimal keypad and cue buttons only select', () => {
  const match = fs.readFileSync(new URL('../pages/MatchController.tsx', import.meta.url), 'utf8');
  const rounds = fs.readFileSync(new URL('../components/TrainingOptions.tsx', import.meta.url), 'utf8');

  assert.match(match, /Minutes[\s\S]*inputMode="decimal"/);
  assert.match(rounds, /inputMode="decimal"/);
  assert.match(rounds, /label="Custom round length"/);
  assert.match(rounds, /label="Custom break length"/);
  assert.match(rounds, /aria-label="Subtract one minute"/);
  assert.match(rounds, /aria-label="Add one second"/);

  const chooseMatch = match.slice(match.indexOf('const chooseMatchEndCue'), match.indexOf('const onCast'));
  const chooseRounds = rounds.slice(rounds.indexOf('const chooseEndCue'), rounds.indexOf('return ('));
  assert.doesNotMatch(chooseMatch, /playSelectedEndCue/);
  assert.doesNotMatch(chooseRounds, /playSelectedEndCue/);
  assert.match(match, /playSelectedEndCue\('match', match\.endCue\)/);
  assert.match(rounds, /playSelectedEndCue\('training', audio\.endCue\)/);
});

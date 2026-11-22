import assert from 'node:assert/strict';
import test from 'node:test';
import { isFirstStart, parseStartSoundWhen, startSoundKind } from './startSoundPolicy.ts';

test('the default start-sound mode is first start only', () => {
  assert.equal(parseStartSoundWhen(undefined), 'first');
  assert.equal(parseStartSoundWhen('first'), 'first');
  assert.equal(parseStartSoundWhen('every'), 'every');
  assert.equal(parseStartSoundWhen('nope'), 'first');
});

test('first start is a full clock, a reset, or a restart from 0:00', () => {
  assert.equal(isFirstStart(300_000, 300_000), true);
  assert.equal(isFirstStart(0, 300_000), true);
  assert.equal(isFirstStart(-1, 300_000), true);
  assert.equal(isFirstStart(299_000, 300_000), false);
  assert.equal(isFirstStart(120_000, 300_000), false);
});

test('default first-start mode: Combat on the first start, beep on a later resume', () => {
  assert.equal(startSoundKind('first', true), 'combat');
  assert.equal(startSoundKind('first', false), 'beep');
});

test('every-start mode: Combat on the first start and on every later resume', () => {
  assert.equal(startSoundKind('every', true), 'combat');
  assert.equal(startSoundKind('every', false), 'combat');
});

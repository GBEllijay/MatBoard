import assert from 'node:assert/strict';
import test from 'node:test';
import { nextLoopStep } from './videoLoop.ts';

test('a short clip restarts while the card duration still has time left', () => {
  assert.equal(nextLoopStep(1_000, 5 * 60_000, false), 'play');
  assert.equal(nextLoopStep(1_000, 5 * 60_000, true, 1_000), 'restart');
});

test('a clip stops when the card duration is reached, even if it has not ended', () => {
  assert.equal(nextLoopStep(5 * 60_000, 5 * 60_000, false), 'stop');
  assert.equal(nextLoopStep(5 * 60_000 + 40, 5 * 60_000, false), 'stop');
  assert.equal(nextLoopStep(5 * 60_000, 5 * 60_000, true, 4_000), 'stop');
});

test('an ended clip that restarts too quickly is treated as empty and stops', () => {
  assert.equal(nextLoopStep(10, 4_000, true, 0), 'stop');
  assert.equal(nextLoopStep(10, 4_000, true, 79), 'stop');
  assert.equal(nextLoopStep(10, 4_000, true, 80), 'restart');
});

test('a missing duration stops the loop', () => {
  assert.equal(nextLoopStep(0, 0, false), 'stop');
  assert.equal(nextLoopStep(0, Number.NaN, true), 'stop');
  assert.equal(nextLoopStep(Number.NaN, 5_000, false), 'stop');
});

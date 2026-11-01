import assert from 'node:assert/strict';
import test from 'node:test';
import { guardOutcome } from './guardWait.ts';

test('an open door renders at once, even before the pass check finishes', () => {
  assert.equal(guardOutcome(true, false), 'render');
  assert.equal(guardOutcome(true, true), 'render');
});

test('a closed door waits for the saved pass check instead of bouncing to /buy', () => {
  assert.equal(guardOutcome(false, false), 'wait');
});

test('a closed door still redirects once the check is done (no door is opened by waiting)', () => {
  assert.equal(guardOutcome(false, true), 'redirect');
});

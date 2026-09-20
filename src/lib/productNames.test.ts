import assert from 'node:assert/strict';
import test from 'node:test';
import { GYM_CONSOLE_NAME, parentToolboxPath, toolEyebrow } from './productNames.ts';

test('Console name uses the exact Instructor apostrophe', () => {
  assert.equal(GYM_CONSOLE_NAME, "Gym Owner and Instructor's Console");
  assert.doesNotMatch(GYM_CONSOLE_NAME, /Owner.?s Toolbox/i);
  assert.doesNotMatch(GYM_CONSOLE_NAME, /Owners Toolbox/i);
});

test('Shared tools prefer Pro console, then Coach', () => {
  assert.equal(parentToolboxPath(true, true), '/pro');
  assert.equal(parentToolboxPath(true, false), '/pro');
  assert.equal(parentToolboxPath(false, true), '/coach');
  assert.equal(parentToolboxPath(false, false), '/');
  assert.equal(toolEyebrow(true, false), GYM_CONSOLE_NAME);
  assert.equal(toolEyebrow(false, true), 'Advantage Coach');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GYM_CONSOLE_NAME,
  MOCK_TOURNAMENT_NAME,
  PRO_LADDER_DETAIL,
  WHITE_LADDER_DETAIL,
  parentToolboxPath,
  TOURNAMENT_SOFTWARE_NAME,
  toolEyebrow,
  tournamentToolLabel,
} from './productNames.ts';

test('Console name uses the exact Instructor apostrophe', () => {
  assert.equal(GYM_CONSOLE_NAME, "Gym Owner and Instructor's Console");
  assert.doesNotMatch(GYM_CONSOLE_NAME, /Owner.?s Toolbox/i);
  assert.doesNotMatch(GYM_CONSOLE_NAME, /Owners Toolbox/i);
});

test('Home ladder details keep White meaning and a plain Pro subtitle', () => {
  assert.equal(WHITE_LADDER_DETAIL, 'BJJ scoreboard and timer, live match and rounds');
  assert.equal(PRO_LADDER_DETAIL, 'Gym Owner and Instructors Console');
  assert.doesNotMatch(PRO_LADDER_DETAIL, /for this gym/i);
  assert.doesNotMatch(PRO_LADDER_DETAIL, /'/);
});

test('Owner tournament tool is Tournament Software; Coach keeps Mock Tournament', () => {
  assert.equal(TOURNAMENT_SOFTWARE_NAME, 'Tournament Software');
  assert.equal(MOCK_TOURNAMENT_NAME, 'Mock Tournament');
  assert.equal(tournamentToolLabel(true), TOURNAMENT_SOFTWARE_NAME);
  assert.equal(tournamentToolLabel(false), MOCK_TOURNAMENT_NAME);
});

test('Shared tools prefer Pro console, then Coach', () => {
  assert.equal(parentToolboxPath(true, true), '/pro');
  assert.equal(parentToolboxPath(true, false), '/pro');
  assert.equal(parentToolboxPath(false, true), '/coach');
  assert.equal(parentToolboxPath(false, false), '/');
  assert.equal(toolEyebrow(true, false), GYM_CONSOLE_NAME);
  assert.equal(toolEyebrow(false, true), 'Advantage Coach');
});

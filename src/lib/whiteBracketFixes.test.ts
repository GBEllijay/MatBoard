import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WHITE_BRACKETS_PATH } from './bracketRosterStore.ts';

const origin = readFileSync(new URL('../hooks/useSuiteOrigin.ts', import.meta.url), 'utf8');
const board = readFileSync(new URL('../hooks/useMatchBoard.ts', import.meta.url), 'utf8');
const tournament = readFileSync(new URL('../pages/Tournament.tsx', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../pages/MatchController.tsx', import.meta.url), 'utf8');
const bout = readFileSync(new URL('./bracketBout.ts', import.meta.url), 'utf8');

test('White Back to bracket returns to /white/brackets?from=white, not /tournament', () => {
  assert.match(
    origin,
    /if \(path === '\/tournament' \|\| path.startsWith\('\/tournament\?'\)\) return WHITE_BRACKETS_PATH/,
  );
  assert.match(origin, /fromWhite/);
  assert.equal(WHITE_BRACKETS_PATH, '/white/brackets?from=white');
});

test('Open scoreboard on this device keeps from=white', () => {
  assert.match(board, /fromWhite: suite.fromWhite/);
  assert.match(controller, /fromWhite: suite.fromWhite/);
});

test('a leftover linked bout without ?bout= can be cleared; a bout link stays linked', () => {
  assert.match(bout, /export function isLeftoverLinkedBout\(/);
  assert.match(controller, /isLeftoverLinkedBout\(linkedId, searchParams.get\('bout'\)\)/);
  assert.match(
    readFileSync(new URL('../pages/MatchDisplay.tsx', import.meta.url), 'utf8'),
    /isLeftoverLinkedBout\(linkedId, searchParams.get\('bout'\)\)/,
  );
});

test('Fill uses the selected White size and the champion name is shown once', () => {
  assert.match(tournament, /fillFromWhiteRoster\(tournament\.size\)/);
  assert.match(tournament, /fillFromWhiteRoster\(size, \{ newBoard: false \}\)/);
  assert.match(tournament, /setFillPlaced\(null\)/);
  assert.match(
    tournament,
    /champLabel \? \([\s\S]*bracket__champ-flash[\s\S]*\) : \([\s\S]*<RosterNameField/,
  );
});

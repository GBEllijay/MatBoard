import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { defaultCompetitorName, resolvedCompetitorName } from './competitorName.ts';

const store = readFileSync(new URL('./matchStore.ts', import.meta.url), 'utf8');
const field = readFileSync(new URL('../components/RosterNameField.tsx', import.meta.url), 'utf8');
const picker = readFileSync(new URL('../components/WhiteNamePicker.tsx', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../pages/MatchController.tsx', import.meta.url), 'utf8');
const tournament = readFileSync(new URL('../pages/Tournament.tsx', import.meta.url), 'utf8');

test('blue is Competitor 1 and white is Competitor 2, including after a cleared name', () => {
  assert.equal(defaultCompetitorName('blue'), 'Competitor 1');
  assert.equal(defaultCompetitorName('white'), 'Competitor 2');
  assert.equal(resolvedCompetitorName('blue', 'Alex Rivera'), 'Alex Rivera');
  assert.equal(resolvedCompetitorName('blue', ''), 'Competitor 1');
  assert.equal(resolvedCompetitorName('blue', '   '), 'Competitor 1');
  assert.equal(resolvedCompetitorName('white', ''), 'Competitor 2');
  assert.equal(resolvedCompetitorName('white', '  Mia  '), '  Mia  ');
});

test('clearing a scoreboard name keeps the default in the store and on reload', () => {
  assert.match(store, /export \{ defaultCompetitorName, resolvedCompetitorName \} from '\.\/competitorName'/);
  assert.match(store, /action\.field === 'name'\s*\n\s*\? applyCompetitorName\(action\.side, current\[action\.side\], action\.value\)/);
  assert.match(store, /blue: applyCompetitorName\(/);
  assert.match(store, /white: applyCompetitorName\(/);
});

test('the match controller picker can clear a name back to the side default', () => {
  assert.match(controller, /defaultName=\{defaultCompetitorName\(side\)\}/);
  assert.match(field, /if \(!typed && defaultName\)/);
  assert.match(field, /Clear name/);
  assert.match(picker, /Clear name/);
  assert.match(picker, /roster-pick__clear/);
  assert.doesNotMatch(tournament, /defaultName=/);
});

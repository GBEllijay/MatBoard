import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { tvTipHiddenOnWhiteBoard } from './tvTip.ts';

test('the TV tip is hidden on White scoreboard and timer screens', () => {
  for (const path of ['/match', '/training', '/match/control', '/training/control']) {
    assert.equal(tvTipHiddenOnWhiteBoard(path, 'white'), true, path);
  }
  assert.equal(tvTipHiddenOnWhiteBoard('/match', 'suite'), false);
  assert.equal(tvTipHiddenOnWhiteBoard('/match', null), false);
  assert.equal(tvTipHiddenOnWhiteBoard('/techniques', 'white'), false);
  assert.equal(tvTipHiddenOnWhiteBoard('/white', 'white'), false);
  const tip = readFileSync(new URL('../components/TvTip.tsx', import.meta.url), 'utf8');
  assert.match(tip, /tvTipHiddenOnWhiteBoard\(pathname, searchParams\.get\('from'\)\)/);
});

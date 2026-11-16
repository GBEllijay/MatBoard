import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { OPTIONS_REOPEN_GUARD_MS, optionsReopenBlocked } from './optionsReopenGuard.ts';

test('a leftover click right after Close does not reopen the Media Console menu', () => {
  const closedAt = 1_000;
  assert.equal(optionsReopenBlocked(0, closedAt), false, 'a menu that was never closed can still open');
  assert.equal(optionsReopenBlocked(closedAt, closedAt), true, 'the click that follows pointerup is ignored');
  assert.equal(optionsReopenBlocked(closedAt, closedAt + OPTIONS_REOPEN_GUARD_MS - 1), true);
  assert.equal(optionsReopenBlocked(closedAt, closedAt + OPTIONS_REOPEN_GUARD_MS), false);
  assert.equal(optionsReopenBlocked(closedAt, closedAt + 1_000), false, 'a later tap can open the menu again');
});

test('the gallery console stamps the close time and uses the reopen guard', () => {
  const page = readFileSync(new URL('../pages/Screensaver.tsx', import.meta.url), 'utf8');
  assert.match(page, /from '\.\.\/lib\/optionsReopenGuard'/);
  assert.match(page, /optionsClosedAtRef\.current = Date\.now\(\)/);
  assert.match(page, /if \(optionsReopenBlocked\(optionsClosedAtRef\.current, Date\.now\(\)\)\) return;/);
  assert.match(page, /if \(slides\.length\) setOptions\(true\)/);
});

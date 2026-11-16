import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  OPTIONS_REOPEN_GUARD_MS,
  SHEET_CLOSE_GUARD_CLASS,
  accountButtonBlocked,
  armOptionsCloseGuard,
  lastOptionsClosedAt,
  optionsReopenBlocked,
  resetOptionsCloseGuard,
} from './optionsReopenGuard.ts';

function mockBody() {
  const classes = new Set<string>();
  return {
    classes,
    classList: {
      add(name: string) {
        classes.add(name);
      },
      remove(name: string) {
        classes.delete(name);
      },
      contains(name: string) {
        return classes.has(name);
      },
    },
  };
}

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

test('arming the close guard blocks the account button until the window ends', async () => {
  const body = mockBody();
  resetOptionsCloseGuard(body);
  assert.equal(accountButtonBlocked(1_000, body), false);
  armOptionsCloseGuard(1_000, body, 20);
  assert.equal(lastOptionsClosedAt(), 1_000);
  assert.equal(body.classes.has(SHEET_CLOSE_GUARD_CLASS), true);
  assert.equal(accountButtonBlocked(1_000, body), true, 'the leftover Close tap cannot open Account');
  assert.equal(accountButtonBlocked(1_000 + 19, body), true);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(body.classes.has(SHEET_CLOSE_GUARD_CLASS), false, 'the class clears when the window ends');
  assert.equal(accountButtonBlocked(1_000 + OPTIONS_REOPEN_GUARD_MS, body), false, 'a later tap can open Account');
  resetOptionsCloseGuard(body);
});

test('every Sheet Close arms the guard, and the account button ignores that leftover tap', () => {
  const sheet = readFileSync(new URL('../components/Sheet.tsx', import.meta.url), 'utf8');
  const header = readFileSync(new URL('../components/HeaderAccount.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(sheet, /import \{ armOptionsCloseGuard \} from '\.\.\/lib\/optionsReopenGuard'/);
  assert.match(sheet, /armOptionsCloseGuard\(\)/);
  assert.match(header, /import \{ accountButtonBlocked \} from '\.\.\/lib\/optionsReopenGuard'/);
  assert.match(header, /if \(isSheetLayerOpen\(\) \|\| accountButtonBlocked\(\)\)/);
  assert.match(header, /event\.preventDefault\(\)/);
  assert.match(css, /body:has\(\.sheet\) \.header-account \{[^}]*pointer-events:\s*none/s);
  assert.match(css, /body:has\(\.sheet\) \.header-account \{[^}]*visibility:\s*hidden/s);
  assert.match(css, /body\.is-sheet-close-guard \.header-account \{[^}]*pointer-events:\s*none/s);
});

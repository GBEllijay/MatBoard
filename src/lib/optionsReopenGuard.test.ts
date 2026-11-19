import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  LEFTOVER_CLICK_MS,
  OPTIONS_REOPEN_GUARD_MS,
  SHEET_CLOSE_GUARD_CLASS,
  accountButtonBlocked,
  armOptionsCloseGuard,
  lastOptionsClosedAt,
  optionsReopenBlocked,
  resetOptionsCloseGuard,
  swallowLeftoverClick,
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
  assert.match(sheet, /import \{ armOptionsCloseGuard, swallowLeftoverClick \} from '\.\.\/lib\/optionsReopenGuard'/);
  assert.match(sheet, /armOptionsCloseGuard\(\)/);
  assert.match(header, /import \{ accountButtonBlocked \} from '\.\.\/lib\/optionsReopenGuard'/);
  assert.match(header, /if \(isSheetLayerOpen\(\) \|\| accountButtonBlocked\(\)\)/);
  assert.match(header, /event\.preventDefault\(\)/);
  assert.match(css, /body:has\(\.sheet\) \.header-account \{[^}]*pointer-events:\s*none/s);
  assert.match(css, /body:has\(\.sheet\) \.header-account \{[^}]*visibility:\s*hidden/s);
  assert.match(css, /body\.is-sheet-close-guard \.header-account \{[^}]*pointer-events:\s*none/s);
});

function mockTarget() {
  const fns = new Set<(event: Event) => void>();
  return {
    fns,
    addEventListener(_type: 'click', fn: (event: Event) => void) {
      fns.add(fn);
    },
    removeEventListener(_type: 'click', fn: (event: Event) => void) {
      fns.delete(fn);
    },
    click() {
      let prevented = false;
      let stopped = false;
      const event = {
        preventDefault: () => (prevented = true),
        stopPropagation: () => (stopped = true),
        stopImmediatePropagation: () => (stopped = true),
      } as unknown as Event;
      for (const fn of [...fns]) fn(event);
      return { prevented, stopped };
    },
  };
}

test('the leftover click after Close is eaten once, then taps work again', () => {
  const target = mockTarget();
  swallowLeftoverClick(1_000, target);
  assert.deepEqual(target.click(), { prevented: true, stopped: true }, 'the leftover click never reaches the timer or board');
  assert.deepEqual(target.click(), { prevented: false, stopped: false }, 'the next real tap goes through');
  assert.equal(target.fns.size, 0);
  assert.ok(LEFTOVER_CLICK_MS >= 400 && LEFTOVER_CLICK_MS <= 1_000);
});

test('the leftover-click window ends on its own when no click arrives', async () => {
  const target = mockTarget();
  swallowLeftoverClick(15, target);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(target.fns.size, 0);
  assert.deepEqual(target.click(), { prevented: false, stopped: false });
});

test('Close on every skin: pointer Close eats the leftover click, Escape closes, timer and board ignore the closing tap', () => {
  const sheet = readFileSync(new URL('../components/Sheet.tsx', import.meta.url), 'utf8');
  const header = readFileSync(new URL('../components/HeaderAccount.tsx', import.meta.url), 'utf8');
  const training = readFileSync(new URL('../pages/Training.tsx', import.meta.url), 'utf8');
  const display = readFileSync(new URL('../pages/MatchDisplay.tsx', import.meta.url), 'utf8');
  const outcome = readFileSync(new URL('../components/OutcomeCalls.tsx', import.meta.url), 'utf8');
  const controller = readFileSync(new URL('../pages/MatchController.tsx', import.meta.url), 'utf8');
  const picker = readFileSync(new URL('../components/SkinPicker.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(sheet, /if \(event\.pointerId != null\) swallowLeftoverClick\(\);\s*onClose\(\);/);
  assert.match(sheet, /event\.key !== 'Escape' \|\| event\.defaultPrevented/);
  assert.match(sheet, /escapeStack\[escapeStack\.length - 1\] !== token/);
  assert.match(picker, /if \(event\.key === 'Escape'\) \{[^}]*event\.preventDefault\(\);/s);
  assert.match(training, /optionsReopenBlocked\(lastOptionsClosedAt\(\), Date\.now\(\)\)\) return;\s*setOptions\(true\)/);
  assert.match(training, /title="Training options" onClose=\{\(\) => setOptions\(false\)\} pinClose/);
  assert.match(display, /optionsReopenBlocked\(lastOptionsClosedAt\(\), Date\.now\(\)\)\) return;\s*openController\(/);
  assert.match(outcome, /portal=\{portal\} pinClose>/);
  assert.match(controller, /className="sheet--help"\s*pinClose/);
  assert.match(header, /new Set\(\['\/', '\/match', '\/training'\]\)/);
  assert.match(header, /useSyncExternalStore\(subscribeSheetLayer, isSheetLayerOpen/);
  assert.match(css, /\.sheet__close \{[^}]*min-width: 48px;[^}]*min-height: 48px;/s);
  assert.match(css, /\.sheet\.sheet--pin-close \.sheet__panel \{[^}]*flex-direction: column;[^}]*overflow: hidden;/s);
  assert.match(css, /\.sheet\.sheet--pin-close \.sheet__body \{[^}]*min-height: 0;[^}]*overflow-y: auto;/s);
  assert.match(css, /max-height: calc\(88vh - env\(safe-area-inset-top, 0px\)\);\s*max-height: min\(88dvh/);
});

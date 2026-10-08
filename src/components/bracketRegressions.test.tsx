import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { KidsScoreboardSwitcher } from './KidsScoreboardSwitcher.tsx';
import { RosterNameField } from './RosterNameField.tsx';
import { kidsBracketScoring, kidsSkinButtonSuppressed } from '../lib/kidsScoreboard.ts';
import { PRO_UNLOCK_STORAGE_KEY } from '../lib/proUnlock.ts';
import { addStudent, resetRoster } from '../lib/rosterStore.ts';

const dom = new Window({ url: 'http://localhost/tournament?from=suite' });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('sessionStorage', view.sessionStorage);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('HTMLInputElement', view.HTMLInputElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('DocumentFragment', view.DocumentFragment);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('PointerEvent', view.PointerEvent);
installGlobal('InputEvent', view.InputEvent);
installGlobal('FocusEvent', view.FocusEvent);
installGlobal('MutationObserver', view.MutationObserver);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => {
    mounted.root.unmount();
  });
  mounted.host.remove();
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  proto?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function topRosterMatch(ariaLabel: string, extra?: { placeholder?: string; compact?: boolean }) {
  localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');
  const mounted = mount(
    <RosterNameField
      value=""
      ariaLabel={ariaLabel}
      names="competitor"
      placeholder={extra?.placeholder}
      compact={extra?.compact}
      onChange={() => {}}
      onPrefill={() => {}}
    />,
  );
  try {
    const field = document.querySelector(`[aria-label="${ariaLabel}"]`);
    assert.ok(field instanceof HTMLInputElement, `${ariaLabel} renders an input`);
    await act(async () => {
      field.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
    const typed = document.querySelector('input.roster-pick__name');
    assert.ok(typed instanceof HTMLInputElement, `${ariaLabel} opens the roster popup`);
    const listed = [...document.querySelectorAll('.roster-pick__row strong')].map((row) => row.textContent);
    assert.ok(listed.length >= 3, `${ariaLabel} lists roster names`);
    await act(async () => {
      setInputValue(typed, 'mi');
    });
    await settle();
    return [...document.querySelectorAll('.roster-pick__row strong')].map((row) => row.textContent);
  } finally {
    unmount(mounted);
  }
}

test('bracket and scoreboard name fields show the same closest roster match', async () => {
  resetRoster();
  addStudent({ name: 'Mila Chen', belt: 'White', division: '', gym: '', lastPromotion: '', note: '' });
  addStudent({ name: 'Mia Santos', belt: 'Grey', division: '', gym: '', lastPromotion: '', note: '' });
  addStudent({ name: 'Sam Miller', belt: 'Blue', division: '', gym: '', lastPromotion: '', note: '' });

  const scoreboard = await topRosterMatch('Blue name');
  const bracket = await topRosterMatch('Quarterfinal 1, top competitor', {
    placeholder: 'Competitor 1',
    compact: true,
  });

  assert.equal(scoreboard[0], 'Mia Santos');
  assert.deepEqual(scoreboard, bracket);
  assert.deepEqual(scoreboard, ['Mia Santos', 'Mila Chen', 'Sam Miller']);
  resetRoster();
});

test('Skin opens the thumbnail picker when a linked bout has no result', async () => {
  assert.equal(kidsBracketScoring('final-0', false), true);
  const suppressed = kidsSkinButtonSuppressed({ fullscreen: false, sheetOpen: false });
  assert.equal(suppressed, false);

  const mounted = mount(
    <KidsScoreboardSwitcher
      prefs={{ enabled: true, skin: 'dinos', mascot: true }}
      suppressed={suppressed}
    />,
  );
  try {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Skin');
    assert.ok(button);
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    await act(async () => {
      button.click();
    });
    await settle();
    const picker = document.querySelector('.kids-skin__picker');
    assert.ok(picker, 'Skin picker opens');
    assert.equal(picker.getAttribute('role'), 'dialog');
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(picker.querySelectorAll('.kids-skin__thumb').length, 6);
  } finally {
    unmount(mounted);
  }
});

test('Skin stays shut while a sheet is open and still opens again after it closes', async () => {
  const mounted = mount(
    <KidsScoreboardSwitcher
      prefs={{ enabled: false, skin: 'ocean', mascot: true }}
      suppressed={kidsSkinButtonSuppressed({ fullscreen: false, sheetOpen: true })}
    />,
  );
  try {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Skin');
    assert.ok(button);
    assert.equal(button.disabled, true);
    button.click();
    await settle();
    assert.equal(document.querySelector('.kids-skin__picker'), null);
  } finally {
    unmount(mounted);
  }
});

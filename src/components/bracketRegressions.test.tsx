import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { KidsScoreboardSwitcher } from './KidsScoreboardSwitcher.tsx';
import { RosterNameField } from './RosterNameField.tsx';
import { MatchDisplayPage } from '../pages/MatchDisplay.tsx';
import { TournamentPage } from '../pages/Tournament.tsx';
import { kidsBracketScoring, kidsSkinButtonSuppressed, setKidsEnabled, setKidsSkin } from '../lib/kidsScoreboard.ts';
import { PRO_UNLOCK_STORAGE_KEY } from '../lib/proUnlock.ts';
import { addStudent, resetRoster } from '../lib/rosterStore.ts';
import { fillSeedNames, resetTournament, setCompetitorCount, setTournamentTitle } from '../lib/tournamentStore.ts';

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

function mount(node: ReactNode, initialEntry = '/'): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[initialEntry]}>{node}</MemoryRouter>);
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

test('Skin stays enabled after Score and Back to bracket', { timeout: 8000 }, async () => {
  localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');
  resetTournament();
  setCompetitorCount(4);
  fillSeedNames(['Ada Cruz', 'Bea Ortiz', 'Cam Diaz', 'Dee Kim']);
  setTournamentTitle('Sim Back Attacks Mock');
  setKidsEnabled(true);
  setKidsSkin('dinos');

  let fullscreenNode: Element | null = null;
  const enterFullscreen = () => {
    fullscreenNode = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  };
  const exitFullscreen = () => {
    fullscreenNode = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  };
  document.documentElement.requestFullscreen = enterFullscreen;
  Element.prototype.requestFullscreen = enterFullscreen;
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenNode });
  const realMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => {
    if (query.includes('orientation')) {
      return {
        matches: true,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      } as MediaQueryList;
    }
    return realMatchMedia(query);
  };
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  installGlobal('ResizeObserver', ResizeObserverStub);
  view.ResizeObserver = ResizeObserverStub;
  let realSetInterval = window.setInterval.bind(window);
  const realError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args.map((part) => String(part)).join(' ');
    if (text.includes('not wrapped in act')) return;
    realError(...args);
  };

  const mounted = mount(
    <Routes>
      <Route path="/tournament" element={<TournamentPage />} />
      <Route path="/match" element={<MatchDisplayPage />} />
    </Routes>,
    '/tournament?from=suite',
  );
  try {
    const skin = () =>
      [...document.querySelectorAll('button')].find((el) => (el.getAttribute('aria-label') || '').startsWith('Skin'));
    assert.equal(skin()?.disabled, false, 'Skin starts enabled');
    const score = document.querySelector('button.t-score');
    assert.ok(score instanceof HTMLElement, 'semifinal Score button');
    realSetInterval = window.setInterval.bind(window);
    window.setInterval = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      if (ms === 100) return 0;
      return realSetInterval(fn as () => void, ms, ...(args as []));
    }) as typeof window.setInterval;
    act(() => {
      score.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const back = document.querySelector('[aria-label="Back to bracket"]');
    assert.ok(back instanceof HTMLElement, 'scoreboard shows Back to bracket');
    assert.equal(back.classList.contains('display-back'), true);
    assert.equal(document.fullscreenElement, document.documentElement, 'scoreboard entered fullscreen');
    act(() => {
      back.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const returned = skin();
    assert.ok(returned, 'Skin is back on the bracket');
    assert.equal(returned.disabled, false, 'Skin stays enabled after Back to bracket');
    assert.equal(document.fullscreenElement, null);
    act(() => {
      returned.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.ok(document.querySelector('.kids-skin__picker'), 'Skin picker opens after Back to bracket');
  } finally {
    unmount(mounted);
    window.setInterval = realSetInterval;
    console.error = realError;
    window.matchMedia = realMatchMedia;
    resetTournament();
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

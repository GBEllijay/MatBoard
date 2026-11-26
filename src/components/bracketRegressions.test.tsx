import { readFileSync } from 'node:fs';
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
import { openBracketBout } from '../lib/bracketBout.ts';
import { BRACKET_CLEAN_KEY, setBracketClean } from '../lib/bracketCleanMode.ts';
import { setBracketTheme } from '../lib/bracketTheme.ts';
import { setWhiteUnlocked, lockWhite } from '../lib/whiteUnlock.ts';
import { KIDS_SKINS, kidsBracketScoring, kidsSkinButtonSuppressed, setKidsEnabled, setKidsSkin } from '../lib/kidsScoreboard.ts';
import { PRO_UNLOCK_STORAGE_KEY } from '../lib/proUnlock.ts';
import { addStudent, getRoster, resetRoster } from '../lib/rosterStore.ts';
import { dispatchMatch, getMatch } from '../lib/matchStore.ts';
import {
  addBracketRosterEntry,
  clearBracketRoster,
  resetBracketRosterForTests,
  seedWhiteBracketFromRoster,
} from '../lib/bracketRosterStore.ts';
import {
  DEFAULT_BRACKET_HEADLINE,
  fillSeedNames,
  getTournament,
  resetTournament,
  seedSlots,
  setCompetitorCount,
  setMatchOutcome,
  setTournamentTitle,
  slotName,
  STORAGE_KEY,
  renameActiveBracket,
  getLibrary,
  switchBracket,
} from '../lib/tournamentStore.ts';

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
installGlobal('HTMLTextAreaElement', view.HTMLTextAreaElement);
installGlobal('HTMLButtonElement', view.HTMLButtonElement);
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

function reactProps(node: Element): Record<string, (...args: never[]) => void> | null {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  return key ? (node as unknown as Record<string, Record<string, (...args: never[]) => void>>)[key] : null;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  proto?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  // happy-dom does not deliver bubbled portal events to React. Invoke the handler too.
  reactProps(input)?.onChange?.({
    target: input,
    currentTarget: input,
    nativeEvent: new Event('input'),
  } as never);
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
  const hinted = await topRosterMatch('Semifinals, bottom competitor', {
    placeholder: 'TBD',
    compact: true,
  });

  assert.equal(scoreboard[0], 'Mia Santos');
  assert.deepEqual(scoreboard, bracket);
  assert.deepEqual(scoreboard, hinted);
  assert.deepEqual(scoreboard, ['Mia Santos', 'Mila Chen', 'Sam Miller']);
  resetRoster();
});

test('a free-typed bracket name sticks on blur, Enter, dismiss, win, and undo', async () => {
  localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  installGlobal('ResizeObserver', ResizeObserverStub);
  view.ResizeObserver = ResizeObserverStub;
  resetRoster();
  resetTournament();
  addStudent({ name: 'Mia Santos', belt: 'White', division: '', gym: '', lastPromotion: '', note: '' });
  setCompetitorCount(4);

  const mounted = mount(<TournamentPage />, '/tournament?from=suite');
  try {
    const top = document.querySelector('[aria-label="Semifinals, top competitor"]');
    assert.ok(top instanceof HTMLInputElement);
    await act(async () => {
      top.click();
    });
    await settle();
    const typed = document.querySelector('input.roster-pick__name');
    assert.ok(typed instanceof HTMLInputElement);
    await act(async () => {
      setInputValue(typed, 'Jordan Hale');
    });
    await settle();
    assert.equal(typed.value, 'Jordan Hale');
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    proto?.set?.call(typed, '');
    typed.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(typed.value, 'Jordan Hale');
    await act(async () => {
      typed.focus();
      typed.blur();
    });
    await settle();
    assert.equal(slotName(getTournament(), 'sf-0-a'), 'Jordan Hale');
    assert.equal(document.querySelector('input.roster-pick__name') instanceof HTMLInputElement, true);
    const add = document.querySelector('.roster-pick__add input');
    assert.ok(add instanceof HTMLInputElement);
    await act(async () => {
      add.click();
    });
    await settle();
    const backdrop = document.querySelector('[aria-label="Close options"]');
    assert.equal(backdrop.tagName, 'BUTTON');
    await act(async () => {
      reactProps(backdrop)?.onClick?.();
    });
    await settle();
    assert.equal(slotName(getTournament(), 'sf-0-a'), 'Jordan Hale');
    assert.equal(
      getRoster().students.some((student) => student.name === 'Jordan Hale'),
      false,
    );

    const remounted = mount(<TournamentPage />, '/tournament?from=suite');
    try {
      const kept = remounted.host.querySelector('[aria-label="Semifinals, top competitor"]');
      assert.ok(kept instanceof HTMLInputElement);
      assert.equal(kept.value, 'Jordan Hale');
    } finally {
      unmount(remounted);
    }

    const bottom = document.querySelector('[aria-label="Semifinals, bottom competitor"]');
    assert.ok(bottom instanceof HTMLInputElement);
    await act(async () => {
      bottom.click();
    });
    await settle();
    const suggest = document.querySelector('input.roster-pick__name');
    assert.ok(suggest instanceof HTMLInputElement);
    await act(async () => {
      setInputValue(suggest, 'mi');
    });
    await settle();
    const mia = [...document.querySelectorAll('.roster-pick__row')].find((row) => row.textContent?.includes('Mia Santos'));
    assert.equal(mia.tagName, 'BUTTON');
    await act(async () => {
      reactProps(mia)?.onClick?.();
    });
    await settle();
    assert.equal(slotName(getTournament(), 'sf-0-b'), 'Mia Santos');
    assert.equal(bottom.value, 'Mia Santos');

    const other = [...document.querySelectorAll('[aria-label="Semifinals, top competitor"]')][1];
    assert.ok(other instanceof HTMLInputElement);
    await act(async () => {
      other.click();
    });
    await settle();
    const entered = document.querySelector('input.roster-pick__name');
    assert.ok(entered instanceof HTMLInputElement);
    await act(async () => {
      setInputValue(entered, 'Casey Ng');
    });
    await settle();
    const named = document.querySelector('input.roster-pick__name');
    assert.ok(named instanceof HTMLInputElement);
    await act(async () => {
      reactProps(named)?.onKeyDown?.({ key: 'Enter', preventDefault() {} } as never);
    });
    await settle();
    assert.equal(slotName(getTournament(), 'sf-1-a'), 'Casey Ng');
    assert.equal(
      getRoster().students.some((student) => student.name === 'Casey Ng' || student.name === 'Jordan Hale'),
      false,
    );

    const win = [...mounted.host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Win');
    assert.ok(win);
    await act(async () => {
      win.click();
    });
    await settle();
    const submission = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Submission'));
    assert.ok(submission);
    await act(async () => {
      submission.click();
    });
    await settle();
    assert.equal(slotName(getTournament(), 'final-0-a'), 'Jordan Hale');
    const undo = [...mounted.host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Undo last result');
    assert.ok(undo);
    await act(async () => {
      undo.click();
    });
    await settle();
    assert.equal(slotName(getTournament(), 'sf-0-a'), 'Jordan Hale');
    assert.equal(slotName(getTournament(), 'final-0-a'), '');
    assert.match(localStorage.getItem('matboard.tournament.v1') ?? '', /Jordan Hale/);
  } finally {
    unmount(mounted);
    resetTournament();
    resetRoster();
  }
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
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Skins');
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
    assert.equal(picker.querySelectorAll('.kids-skin__grid .kids-skin__thumb').length, 6);
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
      [...document.querySelectorAll('button')].find((el) => (el.getAttribute('aria-label') || '').startsWith('Skins'));
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

test('Coach Unlimited Score keeps the Skin picker on Back to bracket', async () => {
  localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');
  resetTournament();
  setCompetitorCount(4);
  fillSeedNames(['Ada Cruz', 'Bea Ortiz', 'Cam Diaz', 'Dee Kim']);
  setKidsEnabled(true);
  setKidsSkin('dinos');
  const realSetInterval = window.setInterval.bind(window);
  window.setInterval = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
    if (ms === 100) return 0;
    return realSetInterval(fn as () => void, ms, ...(args as []));
  }) as typeof window.setInterval;

  const mounted = mount(
    <Routes>
      <Route path="/tournament" element={<TournamentPage />} />
      <Route path="/match" element={<MatchDisplayPage />} />
    </Routes>,
    '/tournament?from=unlimited',
  );
  try {
    const score = document.querySelector('button.t-score');
    assert.ok(score instanceof HTMLElement, 'semifinal Score button');
    act(() => {
      score.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const back = document.querySelector('[aria-label="Back to bracket"]');
    assert.ok(back instanceof HTMLElement, 'scoreboard shows Back to bracket');
    assert.equal(back.tagName, 'A');
    assert.match(back.getAttribute('href') || '', /from=unlimited/);
    assert.match(back.getAttribute('href') || '', /^\/tournament\?/);
    assert.equal(document.querySelector('main')?.classList.contains('kids-board--dinos'), true);
    act(() => {
      back.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const skin = [...document.querySelectorAll('button')].find((el) =>
      (el.getAttribute('aria-label') || '').startsWith('Skins'),
    );
    assert.ok(skin, 'Skin is back on the Coach Unlimited bracket');
    assert.equal(skin.disabled, false);
    assert.equal(document.querySelector('main')?.classList.contains('tournament--kids-dinos'), true);
  } finally {
    unmount(mounted);
    window.setInterval = realSetInterval;
    resetTournament();
  }
});

test('empty seed slots hint TBD, Undo is logo blue, and the live match wears a LIVE pill', async () => {
  localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');
  resetTournament();
  setCompetitorCount(4);
  fillSeedNames(['Ada Cruz']);
  setMatchOutcome('sf-0', 'a', { call: 'win', method: 'points' }, { toggle: false });
  openBracketBout('sf-1');
  setKidsEnabled(true);
  setKidsSkin('dinos');

  const mounted = mount(<TournamentPage />, '/tournament?from=suite');
  try {
    const placeholders = [...mounted.host.querySelectorAll('.t-slot input')].map((input) =>
      input.getAttribute('placeholder'),
    );
    assert.ok(placeholders.includes('TBD'));
    assert.equal(
      placeholders.some((value) => /^Competitor \d+$/.test(value || '')),
      false,
    );
    const undo = [...mounted.host.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Undo last result',
    );
    assert.ok(undo);
    assert.equal(undo.classList.contains('btn--blue'), true);
    assert.equal(undo.disabled, false);
    const pill = mounted.host.querySelector('.t-match--live .t-live-pill');
    assert.equal(pill?.textContent?.trim(), 'LIVE');
    const names = [...mounted.host.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Edit names',
    );
    assert.ok(names);
    act(() => {
      names.click();
    });
    await settle();
    assert.ok(document.querySelector('.sheet--names'), 'names editor uses the navy sheet');
    const advanced = slotName(getTournament(), 'final-0-a');
    assert.equal(advanced, 'Ada Cruz');
    act(() => {
      undo.click();
    });
    await settle();
    assert.equal(slotName(getTournament(), 'final-0-a'), '');
    assert.equal(getTournament().results['sf-0'], undefined);
  } finally {
    unmount(mounted);
    resetTournament();
  }
});

test('one tap sets bracket size, and kids connector pairs stay on an eight-person board', async () => {
  localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');
  resetTournament();
  setCompetitorCount(4);
  fillSeedNames(['Ada Cruz', 'Bea Ortiz', 'Cam Diaz', 'Dee Kim']);
  setMatchOutcome('sf-0', 'a', { call: 'win', method: 'points' }, { toggle: false });
  setKidsEnabled(true);
  setKidsSkin('ocean');

  const mounted = mount(<TournamentPage />, '/tournament?from=suite');
  try {
    assert.equal(mounted.host.querySelector('main')?.classList.contains('tournament--kids'), true);
    const size = [...mounted.host.querySelectorAll('.tournament__actions button')].find(
      (button) => button.textContent?.trim() === '4',
    );
    assert.ok(size, 'size chip shows 4');
    act(() => {
      size.click();
    });
    await settle();
    const eight = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '8');
    assert.ok(eight);
    act(() => {
      eight.click();
    });
    await settle();
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(getTournament().size, 8);
    assert.ok(mounted.host.querySelector('.bracket__pair'), 'eight-person kids board keeps connector pairs');
    assert.equal(seedSlots(getTournament()).length, 8);
  } finally {
    unmount(mounted);
    resetTournament();
  }
});

test('the kids Skin picker opens on Pro, Coach Unlimited, and Instructor Edition boards', async () => {
  // Owner, 14 Nov 2026: Instructor Edition (coach unlock, no Pro) gets the full suite and its skins.
  localStorage.removeItem(PRO_UNLOCK_STORAGE_KEY);
  localStorage.setItem('advantage.coachUnlocked', '1');
  resetTournament();
  setKidsEnabled(true);
  setKidsSkin('dinos');

  const coach = mount(<TournamentPage />, '/tournament?from=coach');
  try {
    assert.equal(coach.host.querySelector('main')?.classList.contains('tournament--kids-dinos'), true);
    assert.match(coach.host.querySelector('h1')?.textContent ?? '', /Tournament Software/);
  } finally {
    unmount(coach);
  }
  localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');

  for (const entry of ['/tournament?from=suite', '/tournament?from=unlimited', '/tournament?from=coach'] as const) {
    setKidsEnabled(true);
    setKidsSkin('dinos');
    const board = mount(<TournamentPage />, entry);
    try {
      assert.equal(board.host.querySelector('main')?.classList.contains('tournament--kids-dinos'), true);
      const skin = [...board.host.querySelectorAll('button')].find((button) =>
        (button.getAttribute('aria-label') || '').startsWith('Skins'),
      );
      assert.ok(skin, `Skin on ${entry}`);
      assert.equal(skin.disabled, false);
      act(() => {
        skin.click();
      });
      await settle();
      assert.equal(document.querySelectorAll('.kids-skin__grid .kids-skin__thumb').length, 6);
      const ocean = [...document.querySelectorAll('.kids-skin__grid .kids-skin__thumb')].find(
        (button) => button.textContent?.includes('Ocean'),
      );
      assert.ok(ocean instanceof HTMLElement);
      act(() => {
        ocean.click();
      });
      await settle();
      assert.equal(board.host.querySelector('main')?.classList.contains('tournament--kids-ocean'), true);
    } finally {
      unmount(board);
    }
  }

  resetTournament();
});

test('bracket controls sit under the board and each one still clicks', async () => {
  localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');
  localStorage.setItem('advantage.coachUnlocked', '1');
  localStorage.setItem('matboard.bracketTheme.v1', 'bright');
  resetTournament();
  setCompetitorCount(16);
  setTournamentTitle('Stars & unicorns');
  fillSeedNames([
    'Ada Cruz',
    'Bea Ortiz',
    'Cam Diaz',
    'Dee Kim',
    'Eli Park',
    'Faye Cho',
    'Gus Hale',
    'Hana Ito',
    'Ian Brooks',
    'Jade Nguyen',
    'Kai Silva',
    'Luz Marin',
    'Max Patel',
    'Noa Berg',
    'Omar Shah',
    'Pia Rossi',
  ]);
  setMatchOutcome('r16-0', 'a', { call: 'win', method: 'points' }, { toggle: false });
  setKidsEnabled(true);
  setKidsSkin('unicorns');

  let fullscreenCalls = 0;
  const enterFullscreen = () => {
    fullscreenCalls += 1;
    return Promise.resolve();
  };
  document.documentElement.requestFullscreen = enterFullscreen;
  Element.prototype.requestFullscreen = enterFullscreen;
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });

  const mounted = mount(<TournamentPage />, '/tournament?from=suite');
  try {
    await settle();
    const main = mounted.host.querySelector('main');
    assert.equal(main?.classList.contains('tournament--kids-unicorns'), true);
    const bar = mounted.host.querySelector('.tournament__bar');
    const tools = mounted.host.querySelector('.tournament__tools');
    const bracket = mounted.host.querySelector('.bracket');
    assert.ok(bar instanceof HTMLElement);
    assert.ok(tools instanceof HTMLElement);
    assert.ok(bracket instanceof HTMLElement);
    assert.equal(bar.querySelector('.tournament__actions'), null, 'header no longer holds the control bar');
    assert.equal(bar.querySelector('.tournament__center'), null, 'seed line left the header');
    assert.equal(bar.querySelector('[aria-label="Division or class name"]'), null);
    const center = tools.querySelector('.tournament__center');
    assert.ok(center instanceof HTMLElement);
    assert.ok(center.querySelector('[aria-label="Division or class name"]') instanceof HTMLInputElement);
    assert.ok(center.querySelector('.tournament__roundline'));
    const skinButton = [...tools.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Skins');
    assert.ok(skinButton);
    assert.ok(
      center.compareDocumentPosition(skinButton) & Node.DOCUMENT_POSITION_FOLLOWING,
      'seed line sits above Skins',
    );
    assert.equal(tools.getAttribute('aria-label'), 'Bracket controls');
    assert.ok(
      bracket.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING,
      'controls follow the bracket',
    );

    const control = (label: string) =>
      [...tools.querySelectorAll('button')].find((button) => button.textContent?.trim() === label);
    for (const label of ['Skins', '16', 'Edit names', 'Fill from check-in', 'Undo last result', 'Reset']) {
      assert.ok(control(label), `${label} is under the bracket`);
    }
    assert.equal(control('Bright'), undefined, 'Bright left the bar');
    assert.equal(control('Dark'), undefined, 'Dark left the bar');
    assert.equal(control('Advantage'), undefined, 'Advantage is in Skins, not on the bar');
    const save = tools.querySelector('.tournament__save-btn');
    assert.ok(save instanceof HTMLButtonElement, 'Save is under the bracket');
    assert.equal(save.disabled, false);
    const fullscreen = tools.querySelector('.play-fs');
    assert.ok(fullscreen instanceof HTMLButtonElement, 'Fullscreen is under the bracket');

    const click = async (button: HTMLElement) => {
      await act(async () => {
        button.click();
      });
      await settle();
    };
    const closeSheet = async () => {
      const close = [...document.querySelectorAll('.sheet__head button')].find(
        (button) => button.textContent?.trim() === 'Close',
      );
      assert.ok(close instanceof HTMLElement);
      await click(close);
      assert.equal(document.querySelector('.sheet'), null);
    };

    const themeBtn = (label: string) =>
      [...document.querySelectorAll('.kids-skin__themes button')].find((button) => button.textContent?.trim() === label);
    await click(control('Skins')!);
    assert.ok(themeBtn('Advantage'), 'Advantage is in the Skins menu');
    assert.ok(themeBtn('Dark'), 'Dark is in the Skins menu');
    await click(themeBtn('Dark')!);
    assert.equal(main?.classList.contains('tournament--dark'), true);
    await click(control('Skins')!);
    await click(themeBtn('Advantage')!);
    assert.equal(main?.classList.contains('tournament--bright'), true);

    await click(control('16')!);
    assert.equal(document.querySelector('.sheet h2')?.textContent, 'Bracket size');
    await closeSheet();

    await click(save);
    assert.equal(document.querySelector('.sheet h2')?.textContent, 'Saved brackets');
    await closeSheet();

    await click(control('Edit names')!);
    assert.equal(document.querySelector('.sheet h2')?.textContent, 'Competitor names');
    await closeSheet();

    await click(control('Fill from check-in')!);
    assert.equal(document.querySelector('.sheet h2')?.textContent, 'Fill from check-in');
    await closeSheet();

    assert.equal(control('Undo last result')?.disabled, false);
    await click(control('Undo last result')!);
    assert.equal(getTournament().results['r16-0'], undefined);
    assert.equal(slotName(getTournament(), 'r16-0-a'), 'Ada Cruz');

    await click(control('Reset')!);
    assert.equal(document.querySelector('.sheet h2')?.textContent, 'Reset this bracket?');
    await closeSheet();
    assert.equal(slotName(getTournament(), 'r16-0-a'), 'Ada Cruz');

    await click(control('Skins')!);
    assert.ok(document.querySelector('.kids-skin__picker'), 'Skins picker opens from under the bracket');
    assert.equal(document.querySelectorAll('.kids-skin__grid .kids-skin__thumb').length, 6);

    await click(fullscreen);
    assert.equal(fullscreenCalls, 1);
  } finally {
    unmount(mounted);
    resetTournament();
  }
});

test('the bracket title is editable on every skin and never shows the skin name', async () => {
  localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');
  localStorage.setItem('advantage.coachUnlocked', '1');
  localStorage.setItem('matboard.bracketTheme.v1', 'bright');
  resetTournament();
  setKidsEnabled(true);
  setKidsSkin('space');
  setBracketTheme('bright');

  const headline = (host: ParentNode) => host.querySelector('[aria-label="Tournament title"]');

  const kids = mount(<TournamentPage />, '/tournament?from=suite');
  try {
    await settle();
    const first = headline(kids.host);
    assert.ok(first instanceof HTMLInputElement);
    assert.equal(first.value, DEFAULT_BRACKET_HEADLINE);
    assert.equal(kids.host.querySelector('.kids-banner__title'), null);
    assert.equal(kids.host.textContent?.includes("Kids' Scoreboards"), false);
    const bracket = kids.host.querySelector('.bracket');
    const back = kids.host.querySelector('.play-exit');
    assert.ok(bracket instanceof HTMLElement);
    assert.ok(back instanceof HTMLElement);
    assert.ok(first.compareDocumentPosition(bracket) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(kids.host.querySelector('.tournament__bar .tournament__center'), null);
    const hint = kids.host.querySelector('.empty-hint');
    assert.ok(hint instanceof HTMLElement);
    assert.ok(bracket.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING);
    const hintEdit = [...hint.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Edit names');
    assert.ok(hintEdit instanceof HTMLElement);
    await act(async () => {
      hintEdit.click();
    });
    await settle();
    assert.equal(document.querySelector('.sheet h2')?.textContent, 'Competitor names');
    const close = [...document.querySelectorAll('.sheet__head button')].find((button) => button.textContent?.trim() === 'Close');
    assert.ok(close instanceof HTMLElement);
    await act(async () => {
      close.click();
    });
    await settle();
    assert.equal(document.querySelector('.sheet'), null);

    setInputValue(first, 'Spring Open');
    await settle();
    assert.equal(getTournament().headline, 'Spring Open');
    assert.equal(getTournament().title, '');

    for (const skin of KIDS_SKINS) {
      setKidsSkin(skin.id);
      await settle();
      const current = headline(kids.host);
      assert.ok(current instanceof HTMLInputElement);
      assert.equal(current.value, 'Spring Open');
      assert.equal(kids.host.querySelector('main')?.classList.contains(`tournament--kids-${skin.id}`), true);
      assert.equal(current.closest('.bracket-headline')?.textContent?.includes(skin.label), false);
    }

    setBracketTheme('dark');
    await settle();
    assert.equal(kids.host.querySelector('main')?.classList.contains('tournament--dark'), true);
    assert.equal((headline(kids.host) as HTMLInputElement).value, 'Spring Open');

    const division = kids.host.querySelector('[aria-label="Division or class name"]');
    assert.ok(division instanceof HTMLInputElement);
    assert.equal(division.closest('.tournament__tools') instanceof HTMLElement, true);
    setInputValue(division, 'Kids Gi');
    await settle();
    assert.equal(getTournament().title, 'Kids Gi');
    assert.equal(getTournament().headline, 'Spring Open');

    setInputValue(headline(kids.host) as HTMLInputElement, '');
    await settle();
    assert.equal(getTournament().headline, '');
    const raw = localStorage.getItem(STORAGE_KEY);
    assert.ok(raw);
    const saved = JSON.parse(raw) as {
      activeId: string;
      saved: { id: string; board: { headline?: string; title?: string } }[];
    };
    const active = saved.saved.find((row) => row.id === saved.activeId);
    assert.equal(active?.board.headline, '');
    assert.equal(active?.board.title, 'Kids Gi');
  } finally {
    unmount(kids);
  }

  const kept = mount(<TournamentPage />, '/tournament?from=suite');
  try {
    await settle();
    const input = headline(kept.host);
    assert.ok(input instanceof HTMLInputElement);
    assert.equal(input.value, '');
    assert.equal(kept.host.querySelector('[aria-label="Division or class name"]') instanceof HTMLInputElement, true);
    assert.equal((kept.host.querySelector('[aria-label="Division or class name"]') as HTMLInputElement).value, 'Kids Gi');
  } finally {
    unmount(kept);
  }

  resetTournament();
  setKidsEnabled(false);
  setBracketTheme('bright');
  const adult = mount(<TournamentPage />, '/tournament?from=suite');
  try {
    await settle();
    const input = headline(adult.host);
    assert.ok(input instanceof HTMLInputElement);
    assert.equal(input.value, DEFAULT_BRACKET_HEADLINE);
    assert.equal(adult.host.querySelector('main')?.classList.contains('tournament--kids'), false);
    assert.equal(adult.host.querySelector('.tournament__tools .tournament__center') instanceof HTMLElement, true);
    setInputValue(input, 'Adult Open');
    await settle();
    assert.equal(getTournament().headline, 'Adult Open');
  } finally {
    unmount(adult);
    resetTournament();
  }

  setKidsEnabled(true);
  const coach = mount(<TournamentPage />, '/tournament?from=coach');
  try {
    await settle();
    const input = headline(coach.host);
    assert.ok(input instanceof HTMLInputElement);
    assert.equal(input.value, DEFAULT_BRACKET_HEADLINE);
    assert.equal(coach.host.querySelector('.tournament__tools .tournament__roundline') instanceof HTMLElement, true);
    assert.equal(coach.host.querySelector('.tournament__bar .tournament__roundline'), null);
    // Instructor Edition gets the full suite, so the from=coach board keeps the Skin button too.
    assert.equal([...coach.host.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Skins'), true);
  } finally {
    unmount(coach);
    resetTournament();
    setKidsEnabled(false);
    setBracketTheme('bright');
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
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Skins');
    assert.ok(button);
    assert.equal(button.disabled, true);
    button.click();
    await settle();
    assert.equal(document.querySelector('.kids-skin__picker'), null);
  } finally {
    unmount(mounted);
  }
});

test('TV Clean toggle, Current match jump, and phone/TV CSS contracts hold', async () => {
  localStorage.clear();
  resetTournament();
  setBracketTheme('bright');
  setBracketClean(false);
  setCompetitorCount(8);
  fillSeedNames(['Alex', 'Blair', 'Casey', 'Drew', 'Eli', 'Finn', 'Gabe', 'Hugo']);
  setMatchOutcome('qf-0', 'a', { call: 'win', method: 'points' });
  setMatchOutcome('qf-1', 'b', { call: 'win', method: 'points' });
  setMatchOutcome('qf-2', 'a', { call: 'win', method: 'points' });
  setMatchOutcome('qf-3', 'b', { call: 'win', method: 'points' });
  setMatchOutcome('sf-0', 'a', { call: 'win', method: 'points' });
  setMatchOutcome('sf-1', 'a', { call: 'win', method: 'points' });
  setMatchOutcome('final-0', 'a', { call: 'win', method: 'points' });

  const mounted = mount(<TournamentPage />, '/white/brackets?from=white');
  try {
    await settle();
    const main = mounted.host.querySelector('main.tournament');
    assert.ok(main);
    // Headline sits in .tournament__bar above .tournament__board so Back never covers seed #1
    assert.ok(mounted.host.querySelector('.tournament__bar .bracket-headline'));
    assert.equal(mounted.host.querySelector('.tournament__board .bracket-headline'), null);
    // .tournament__tools is a direct child of main.tournament outside the zoomed board
    assert.ok(mounted.host.querySelector('main.tournament > .tournament__tools'));
    assert.equal(mounted.host.querySelector('.tournament__board .tournament__tools'), null);

    const cleanBtn = [...mounted.host.querySelectorAll('button')].find(
      (b) => b.getAttribute('role') === 'switch' && /TV Clean/i.test(b.textContent ?? ''),
    );
    assert.ok(cleanBtn, 'TV Clean switch renders');
    assert.equal(cleanBtn.getAttribute('aria-checked'), 'false');
    cleanBtn.click();
    await settle();
    assert.equal(main.classList.contains('tournament--clean'), true);
    assert.equal(localStorage.getItem(BRACKET_CLEAN_KEY), '1');


    const jumpBtn = [...mounted.host.querySelectorAll('button')].find(
      (b) => /Current match/i.test(b.textContent ?? ''),
    );
    assert.ok(jumpBtn, 'Current match jump button renders');
  } finally {
    unmount(mounted);
    resetTournament();
    setBracketClean(false);
    setBracketTheme('bright');
  }

  const css = readFileSync('src/pages/tournamentBoard.css', 'utf8');
  assert.match(css, /\.tournament__bar[\s\S]*padding:[^;]*calc\(4\.5rem/);
  assert.match(css, /\.tournament\.tournament--clean\s+\.t-slot__marks/);
  assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*\.tournament__actions[\s\S]*overflow-x:\s*auto/);
});

test('Podium & Mat Strip registers as a White-gated theme with mat edges, gold finals, and a podium', async () => {
  localStorage.clear();
  resetTournament();
  setWhiteUnlocked(true);
  setBracketTheme('bright');
  setBracketClean(false);
  setCompetitorCount(8);
  fillSeedNames(['Alex Rivera', 'Blair Costa', 'Casey Nguyen', 'Drew Patel', 'Eli Nakamura', 'Finn Alvarez', 'Gabe Moreau', 'Hugo Bennett']);
  setMatchOutcome('qf-0', 'a', { call: 'win', method: 'points' });
  setMatchOutcome('qf-1', 'b', { call: 'win', method: 'points' });
  setMatchOutcome('qf-2', 'a', { call: 'win', method: 'points' });
  setMatchOutcome('qf-3', 'b', { call: 'win', method: 'points' });
  setMatchOutcome('sf-0', 'a', { call: 'win', method: 'points' });
  setMatchOutcome('sf-1', 'a', { call: 'win', method: 'points' });
  setMatchOutcome('final-0', 'a', { call: 'win', method: 'points' });

  const mounted = mount(<TournamentPage />, '/white/brackets?from=white');
  try {
    await settle();
    const skins = [...mounted.host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Skins');
    assert.ok(skins, 'Skins button is on the White bar');
    skins.click();
    await settle();
    const podiumChip = [...mounted.host.querySelectorAll('.kids-skin__themes button')].find(
      (button) => button.textContent?.trim() === 'Podium & Mat Strip',
    );
    assert.ok(podiumChip, 'Podium & Mat Strip is listed in Skins for White');
    podiumChip.click();
    await settle();
    const main = mounted.host.querySelector('main.tournament');
    assert.ok(main);
    assert.equal(main.classList.contains('tournament--podium'), true);
    assert.equal(mounted.host.querySelectorAll('.mat-edge').length, 4);
    assert.ok(mounted.host.querySelector('.podium-banner'));
    assert.match(mounted.host.querySelector('.podium-banner__step--1st')?.textContent ?? '', /1st/);
    assert.match(mounted.host.querySelector('.podium-banner__step--2nd')?.textContent ?? '', /2nd/);
    assert.match(mounted.host.querySelector('.podium-banner__step--3rd')?.textContent ?? '', /3rd/);
    assert.ok(mounted.host.querySelector('.podium-banner__step--3rd .podium-banner__names--pair'));
    const finals = mounted.host.querySelector('.t-match--final');
    assert.ok(finals);
    assert.match(finals.textContent ?? '', /Finals/i);
    assert.ok(finals.querySelector('.t-slot--won'));
    assert.ok(finals.querySelector('.t-slot--lost'));
  } finally {
    unmount(mounted);
    resetTournament();
    setBracketTheme('bright');
    setBracketClean(false);
    lockWhite();
  }

  localStorage.clear();
  resetTournament();
  lockWhite();
  setBracketTheme('podium');
  const closed = mount(<TournamentPage />, '/white/brackets?from=white');
  try {
    await settle();
    const skins = [...closed.host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Skins');
    assert.ok(skins, 'Skins stays on the bar when Podium is gated off');
    skins.click();
    await settle();
    const labels = [...closed.host.querySelectorAll('.kids-skin__themes button')].map((button) => button.textContent?.trim());
    assert.equal(labels.includes('Podium & Mat Strip'), false);
    assert.equal(labels.includes('Advantage'), true);
    assert.equal(labels.includes('Dark'), true);
    assert.equal(labels.includes('Bright'), false);
    assert.equal(closed.host.querySelector('main.tournament')?.classList.contains('tournament--bright'), true);
    assert.equal(closed.host.querySelector('main.tournament')?.classList.contains('tournament--podium'), false);
  } finally {
    unmount(closed);
    resetTournament();
    setBracketTheme('bright');
  }

  const css = readFileSync('src/pages/tournamentPodium.css', 'utf8');
  assert.match(css, /\.tournament--podium \.t-match--final/);
  assert.match(css, /border:\s*2px solid var\(--champ-yellow\)/);
  assert.match(css, /--mat-edge-green:\s*#0f8a45/);
  assert.match(css, /--mat-edge-yellow:\s*#ffe34a/);
  assert.match(css, /--champ-yellow:\s*#ffe34a/);
  assert.match(css, /--champ-card:\s*#071a14/);
  assert.match(css, /\.podium-banner__step--1st[^{]*\{[^}]*height:\s*6\.75rem/);
  assert.match(css, /\.podium-banner__step--2nd[^{]*\{[^}]*height:\s*5\.15rem/);
  assert.match(css, /\.podium-banner__step--3rd[^{]*\{[^}]*height:\s*4\.15rem/);
  assert.match(css, /\.podium-banner__names--pair/);
  assert.match(css, /\.t-match--final \.t-slot--won/);
  assert.doesNotMatch(css, /\.t-match--final[^{]*\{[^}]*var\(--logo-yellow\)/);
  assert.doesNotMatch(css, /#b08948|#d4a574|#c4921c|#1f1a12|#16130f/);
  const boardCss = readFileSync('src/pages/tournamentBoard.css', 'utf8');
  assert.match(boardCss, /tournament--podium \.bracket/);
});

test('the White bar drops Seeded and keeps Advantage and Dark inside Skins', async () => {
  localStorage.clear();
  resetTournament();
  setCompetitorCount(16);
  setWhiteUnlocked(true);
  setBracketTheme('bright');
  setKidsEnabled(false);
  const mounted = mount(<TournamentPage />, '/white/brackets?from=white');
  try {
    await settle();
    const line = mounted.host.querySelector('.tournament__roundline')?.textContent?.trim();
    assert.equal(line, 'Round of 16 · 16 competitors');
    assert.equal(line?.includes('Seeded'), false);
    assert.equal(mounted.host.querySelector('.tournament__theme'), null);
    const skins = [...mounted.host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Skins');
    assert.ok(skins);
    await act(async () => {
      skins.click();
    });
    await settle();
    const themes = [...mounted.host.querySelectorAll('.kids-skin__themes button')].map((button) => button.textContent?.trim());
    assert.deepEqual(themes, ['Advantage', 'Dark', 'Podium & Mat Strip']);
    assert.equal(mounted.host.querySelectorAll('.kids-skin__grid .kids-skin__thumb').length, 6);
  } finally {
    unmount(mounted);
    resetTournament();
    setBracketTheme('bright');
    lockWhite();
  }
});

test('White size chips include 32 and 64, and the custom range goes to 64', async () => {
  localStorage.clear();
  resetTournament();
  setCompetitorCount(16);
  setWhiteUnlocked(true);
  const mounted = mount(<TournamentPage />, '/white/brackets?from=white');
  try {
    await settle();
    const sizeChip = [...mounted.host.querySelectorAll('button')].find((button) => button.textContent?.trim() === '16');
    assert.ok(sizeChip);
    await act(async () => {
      sizeChip.click();
    });
    await settle();
    const sheet = document.querySelector('.sheet');
    assert.ok(sheet);
    assert.match(sheet.textContent ?? '', /Brackets hold up to 64 competitors/);
    assert.match(sheet.textContent ?? '', /Custom 2–64/);
    assert.doesNotMatch(sheet.textContent ?? '', /Placement|Lineup|Seeded is the default/);
    const chips = [...sheet.querySelectorAll('.tournament__size-presets [class*="chip"]')].map((button) => button.textContent?.trim());
    // Size chips match Pro presets, including 32 and 64, not 36. Seeded and Lineup stay hidden.
    assert.ok(chips.includes('32'));
    assert.ok(chips.includes('64'));
    assert.equal(chips.includes('36'), false);
    assert.equal(chips.includes('Seeded'), false);
    assert.equal(chips.includes('Lineup'), false);
  } finally {
    unmount(mounted);
    resetTournament();
    lockWhite();
  }
});

test('saved bracket warns before size change or paste overwrites and offers Make a new one instead', async () => {
  localStorage.clear();
  resetTournament();
  setWhiteUnlocked(true);
  setCompetitorCount(4);
  fillSeedNames(['Ana', 'Bea', 'Cam', 'Dee']);
  renameActiveBracket('Saturday Open');
  const savedId = getLibrary().activeId;

  const mounted = mount(<TournamentPage />, '/white/brackets?from=white');
  try {
    await settle();
    const sizeChip = [...mounted.host.querySelectorAll('button')].find((b) => b.textContent?.trim() === '4');
    assert.ok(sizeChip);
    await act(async () => {
      sizeChip.click();
    });
    await settle();
    const eightBtn = [...document.querySelectorAll('.sheet .tournament__size-presets button')].find(
      (b) => b.textContent?.trim() === '8',
    ) as HTMLButtonElement | undefined;
    assert.ok(eightBtn);
    await act(async () => {
      eightBtn.click();
    });
    await settle();

    const alertText = document.querySelector('.sheet [role="alert"]')?.textContent ?? '';
    assert.match(alertText, /Saturday Open/);
    assert.match(alertText, /Changing size to 8/);
    const makeNewBtn = [...document.querySelectorAll('.sheet [role="alert"] button')].find(
      (b) => b.textContent?.trim() === 'Make a new one instead',
    ) as HTMLButtonElement | undefined;
    assert.ok(makeNewBtn);
    await act(async () => {
      makeNewBtn.click();
    });
    await settle();

    assert.notEqual(getLibrary().activeId, savedId);
    assert.equal(getTournament().size, 8);
    const savedRow = getLibrary().saved.find((item) => item.id === savedId);
    assert.equal(savedRow?.name, 'Saturday Open');
    assert.equal(savedRow?.board.size, 4);
    assert.equal(savedRow ? slotName(savedRow.board, seedSlots(savedRow.board)[0]) : undefined, 'Ana');

    // Switch back to saved bracket and verify Edit names -> Fill bracket also warns & offers Make a new one instead
    await act(async () => {
      switchBracket(savedId);
    });
    await settle();
    assert.equal(getLibrary().activeId, savedId);

    const editNamesBtn = [...mounted.host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Edit names',
    ) as HTMLButtonElement | undefined;
    assert.ok(editNamesBtn);
    await act(async () => {
      editNamesBtn.click();
    });
    await settle();
    const textarea = document.querySelector('.sheet--names textarea') as HTMLTextAreaElement | null;
    assert.ok(textarea);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, 'Eli, Finn, Gus, Hal');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      reactProps(textarea)?.onChange?.({
        target: textarea,
        currentTarget: textarea,
        nativeEvent: new Event('input'),
      } as never);
    });
    await settle();
    const fillBtn = [...document.querySelectorAll('.sheet--names button')].find(
      (b) => b.textContent?.trim() === 'Fill bracket',
    ) as HTMLButtonElement | undefined;
    assert.ok(fillBtn);
    await act(async () => {
      fillBtn.click();
    });
    await settle();
    const pasteAlert = document.querySelector('.sheet--names [role="alert"]')?.textContent ?? '';
    assert.match(pasteAlert, /Saturday Open/);
    const makeNewPaste = [...document.querySelectorAll('.sheet--names [role="alert"] button')].find(
      (b) => b.textContent?.trim() === 'Make a new one instead',
    ) as HTMLButtonElement | undefined;
    assert.ok(makeNewPaste);
    await act(async () => {
      makeNewPaste.click();
    });
    await settle();
    assert.notEqual(getLibrary().activeId, savedId);
    assert.equal(slotName(getTournament(), seedSlots(getTournament())[0]), 'Eli');
    const savedAfter = getLibrary().saved.find((item) => item.id === savedId);
    assert.equal(savedAfter ? slotName(savedAfter.board, seedSlots(savedAfter.board)[0]) : undefined, 'Ana');
  } finally {
    unmount(mounted);
    resetTournament();
    lockWhite();
  }
});

test('adult Bracket Roster fill resets stale kids mode so adult brackets default to Advantage', () => {
  localStorage.clear();
  resetTournament();
  resetBracketRosterForTests();
  clearBracketRoster();
  setKidsEnabled(true);
  setKidsSkin('dinos');

  addBracketRosterEntry({ name: 'Alex Rivera', gym: 'QA Gym', weight: '170', division: 'Adult Blue Belt', age: '26', rank: 'Blue' });
  addBracketRosterEntry({ name: 'Omar Hassan', gym: 'QA Gym', weight: '170', division: 'Adult Blue Belt', age: '28', rank: 'Blue' });

  const placed = seedWhiteBracketFromRoster(8);
  assert.equal(placed, 2);
  assert.equal(slotName(getTournament(), 'qf-0-a'), 'Alex Rivera');
  assert.equal(
    (localStorage.getItem('matboard.kidsScoreboard.v1') ?? '').includes('"enabled":false'),
    true,
  );
  resetBracketRosterForTests();
  resetTournament();
});

test('matchStore penalty bump applies IBJJF adult and kids ladders, auto-DQ, and undo reversal', () => {
  localStorage.clear();
  resetTournament();
  fillSeedNames(['Alex', 'Ben', 'Cam', 'Dan', 'Eli', 'Finn', 'Gus', 'Hal']);

  dispatchMatch({
    type: 'loadBracketBout',
    matchId: 'qf-0',
    blueName: 'Alex',
    whiteName: 'Ben',
    blueGym: '',
    whiteGym: '',
    round: 'Quarterfinal',
    division: 'Adult Blue Belt',
  });

  // Adult: 1st marked, 2nd +1 adv, 3rd +2 pts, 4th DQ
  dispatchMatch({ type: 'bump', side: 'blue', kind: 'disadvantages', delta: 1 });
  dispatchMatch({ type: 'bump', side: 'blue', kind: 'disadvantages', delta: 1 });
  dispatchMatch({ type: 'bump', side: 'blue', kind: 'disadvantages', delta: 1 });
  assert.equal(getMatch().blue.disadvantages, 3);
  assert.equal(getMatch().white.advantages, 1);
  assert.equal(getMatch().white.points, 2);
  assert.equal(getMatch().outcome, null);

  dispatchMatch({ type: 'bump', side: 'blue', kind: 'disadvantages', delta: 1 });
  assert.equal(getMatch().blue.disadvantages, 4);
  assert.equal(getMatch().outcome?.call, 'dq');
  assert.equal(getMatch().outcome?.side, 'blue');
  assert.equal(getTournament().results['qf-0']?.call, 'dq');
  assert.equal(getTournament().results['qf-0']?.winnerSide, 'b');

  // Undo 4 -> 3 reverses DQ on match and linked bracket
  dispatchMatch({ type: 'bump', side: 'blue', kind: 'disadvantages', delta: -1 });
  assert.equal(getMatch().blue.disadvantages, 3);
  assert.equal(getMatch().outcome, null);
  assert.equal(getTournament().results['qf-0'], undefined);

  // Kids: 1st marked, 2nd +1 adv, 3rd/4th/5th +2 pts each, 6th DQ
  dispatchMatch({ type: 'resetScores' });
  dispatchMatch({ type: 'setField', field: 'division', value: 'Kids 2 Grey' });
  for (let i = 0; i < 5; i += 1) {
    dispatchMatch({ type: 'bump', side: 'white', kind: 'disadvantages', delta: 1 });
  }
  assert.equal(getMatch().white.disadvantages, 5);
  assert.equal(getMatch().blue.advantages, 1);
  assert.equal(getMatch().blue.points, 6);
  assert.equal(getMatch().outcome, null);

  dispatchMatch({ type: 'bump', side: 'white', kind: 'disadvantages', delta: 1 });
  assert.equal(getMatch().white.disadvantages, 6);
  assert.equal(getMatch().outcome?.call, 'dq');
  assert.equal(getMatch().outcome?.side, 'white');
  assert.equal(getTournament().results['qf-0']?.call, 'dq');
  assert.equal(getTournament().results['qf-0']?.winnerSide, 'a');

  resetTournament();
});

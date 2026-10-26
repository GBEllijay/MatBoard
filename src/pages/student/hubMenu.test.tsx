/**
 * Grouped Student Edition hub. Old destinations stay reachable, and the
 * vague Menu card is gone.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { setBeltMode, setKidsBelt, setKidsTapeCount } from '../../lib/beltBook.ts';
import { blankStudentReport, saveStudentReport, todayIso } from '../../lib/studentEdition.ts';
import { setRankBelt, setRankTapeCount } from '../../lib/studentRank.ts';
import { emptyCompetition } from '../../lib/progress/competition.ts';
import {
  FORMER_HUB_ITEMS,
  NO_EVENT_LABEL,
  NO_MATCHES_LABEL,
  RANK_MENU_STRIPES,
  SCOUTING_LABEL,
  TRAINING_GROUP_LABEL,
  WEIGHT_UNSET_LABEL,
  menuDestination,
} from '../../lib/studentHubMenu.ts';
import { BackupMenu, ClearStudentMenu } from './BackupMenu.tsx';
import { CoachMenu, CompeteMenu, ProgressMenu, StudentHub, TrainingMenu } from './StudentMenus.tsx';

const dom = new Window({ url: 'http://localhost/student?student=1' });
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
installGlobal('navigator', view.navigator);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode, entry: string): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function hrefs(host: ParentNode): string[] {
  return [...host.querySelectorAll('a')].map((node) => node.getAttribute('href') ?? '');
}

test('the hub is five groups and has no Menu card', () => {
  const hub = mount(<StudentHub />, '/student?student=1');
  const text = hub.host.textContent ?? '';
  assert.equal(text.includes(TRAINING_GROUP_LABEL), true);
  assert.equal(text.includes('Training and Journal'), false);
  assert.equal(hub.host.querySelector('summary'), null);
  assert.equal(text.includes('>Menu<'), false);
  assert.equal(hub.host.querySelector('[aria-label="Menu"]'), null);
  assert.equal(hub.host.querySelector('a[aria-label="Back. Hold for Home."]'), null);
  assert.match(hub.host.querySelector('a[aria-label="Home"]')?.getAttribute('href') ?? '', /\/products\?student=1$/);
  const labels = [...hub.host.querySelectorAll('a')].map((node) => node.getAttribute('aria-label') ?? '');
  assert.equal(labels.includes('Training & Journal'), true);
  assert.equal(labels.includes('My profile'), true);
  assert.match(hub.host.querySelector('a[aria-label="My profile"]')?.getAttribute('href') ?? '', /\/student\/profile\?student=1$/);
  assert.equal(text.includes('Pan Pacific'), false);
  assert.equal(text.includes('(mock)'), false);
  assert.equal(labels.includes('Rank & Progress'), true);
  assert.equal(labels.includes('Competitor'), true);
  assert.equal(labels.includes('Coach & Academy'), true);
  assert.equal(labels.some((label) => label.startsWith('Backup & Print')), true);
  assert.equal(text.includes(NO_EVENT_LABEL), true);
  assert.equal(text.includes(NO_MATCHES_LABEL), true);
  assert.equal(text.includes('Scouting-Opponent'), false);
  const journal = hub.host.querySelector('.s-journal');
  assert.equal(journal?.getAttribute('aria-label'), TRAINING_GROUP_LABEL);
  assert.match(journal?.getAttribute('href') ?? '', /\/student\/training\?student=1$/);
  assert.equal(journal?.querySelector('.s-journal__pages'), null);
  assert.equal(journal?.querySelector('.s-journal__elastic') instanceof view.HTMLElement, true);
  assert.equal(journal?.querySelector('.s-journal__stamp') instanceof view.HTMLElement, true);
  assert.equal(journal?.querySelector('.s-journal__ribbon') instanceof view.HTMLElement, true);
  const worn = hub.host.querySelector('.s-belt-mark');
  assert.equal(worn?.getAttribute('data-stripes'), '0');
  assert.equal(worn?.getAttribute('data-belt'), 'white');
  assert.equal(worn?.getAttribute('data-system'), 'adult');
  assert.equal(worn?.querySelectorAll('.stripe.is-on').length, 0);
  assert.equal(worn?.querySelector('.mini-belt'), null);
  assert.match(
    hub.host.querySelector('a[aria-label="Rank & Progress"]')?.getAttribute('href') ?? '',
    /\/student\/progress\?student=1$/,
  );
  assert.match(
    hub.host.querySelector('a[aria-label="Current belt"]')?.getAttribute('href') ?? '',
    /\/student\/rank\?student=1#current$/,
  );
  unmount(hub);
});

test('every former hub item is linked from a group menu', () => {
  const pages = [
    mount(<TrainingMenu />, '/student/training?student=1'),
    mount(<ProgressMenu />, '/student/progress?student=1'),
    mount(<CompeteMenu />, '/student/compete?student=1'),
    mount(<CoachMenu />, '/student/coach?student=1'),
    mount(<BackupMenu />, '/student/backup?student=1'),
    mount(<ClearStudentMenu />, '/student/backup/clear?student=1'),
  ];
  const links = pages.flatMap((page) => hrefs(page.host));
  for (const item of FORMER_HUB_ITEMS) {
    const target = menuDestination(item.to);
    assert.equal(
      links.some((href) => menuDestination(href) === target),
      true,
      item.label,
    );
  }
  const progress = pages[1];
  for (const row of RANK_MENU_STRIPES) {
    const link = progress?.host.querySelector(`[aria-label="${row.label}"]`);
    assert.equal(link?.getAttribute('data-stripes'), String(row.stripes));
    assert.equal(link?.querySelector('.s-belt'), null);
    const rail = link?.querySelector('.belt-rail');
    assert.equal(rail?.classList.contains('belt-rail--white'), true);
    assert.equal(rail?.classList.contains('belt-rail--degrees'), true);
    assert.equal(rail?.classList.contains(`belt-rail--stripes-${row.stripes}`), true);
    assert.equal(link?.querySelectorAll('.belt-slot').length, 4);
  }
  assert.equal(progress?.host.querySelector('.s-rank-summary .s-belt-mark')?.getAttribute('data-stripes'), '0');
  assert.equal(progress?.host.querySelector('.s-rank-summary .s-belt-mark')?.getAttribute('data-belt'), 'white');
  assert.equal(progress?.host.querySelector('a[aria-label="Current belt"]'), null);
  assert.match(progress?.host.querySelector('a[aria-label="My profile"]')?.getAttribute('href') ?? '', /\/student\/profile\?student=1$/);
  assert.equal(
    progress?.host.querySelector('a[aria-label="Self-assessment"]')?.getAttribute('href'),
    '/student/self-assessment?from=progress&student=1',
  );
  const compete = pages[2];
  assert.equal(
    compete?.host.querySelector('a[aria-label="Self-assessment"]')?.getAttribute('href'),
    '/student/self-assessment?from=compete&student=1',
  );
  const competeText = compete?.host.textContent ?? '';
  assert.equal(competeText.includes(SCOUTING_LABEL), true);
  assert.equal(competeText.includes(NO_EVENT_LABEL), true);
  assert.equal(competeText.includes('Add a tournament'), true);
  assert.equal(compete?.host.querySelector('a.s-score__add')?.getAttribute('href'), '/student/competitor?student=1');
  assert.equal(competeText.includes(NO_MATCHES_LABEL), true);
  assert.equal(competeText.includes(WEIGHT_UNSET_LABEL), true);
  assert.equal(competeText.includes('Scouting-Opponent'), false);
  const training = pages[0];
  assert.equal(training?.host.textContent?.includes(TRAINING_GROUP_LABEL), true);
  assert.ok(training?.host.querySelector('a[aria-label="Back. Hold for Home."]'));
  assert.match(
    training?.host.querySelector('a[aria-label="Back. Hold for Home."]')?.getAttribute('href') ?? '',
    /\/student\?student=1$/,
  );
  const clear = pages[5];
  assert.match(clear?.host.textContent ?? '', /Clear all Student Edition data/);
  assert.match(
    clear?.host.querySelector('a[aria-label="Back. Hold for Home."]')?.getAttribute('href') ?? '',
    /\/student\/backup\?student=1$/,
  );
  for (const page of pages) unmount(page);
});

test('Training & Journal has no Log today bar, and the four journal links stay', () => {
  const hub = mount(<StudentHub />, '/student?student=1');
  assert.equal(hub.host.textContent?.includes("Log today's class"), false);
  assert.equal(hub.host.querySelector('.s-pin'), null);
  assert.match(
    hub.host.querySelector('a[aria-label="Training & Journal"]')?.getAttribute('href') ?? '',
    /\/student\/training\?student=1$/,
  );
  unmount(hub);

  const page = mount(<TrainingMenu />, '/student/training?student=1');
  assert.equal(page.host.textContent?.includes("Log today's class"), false);
  assert.equal(page.host.querySelector('.s-pin'), null);
  const rows = [...page.host.querySelectorAll('a.s-row')].map((node) => ({
    label: node.getAttribute('aria-label'),
    href: node.getAttribute('href'),
    note: node.querySelector('small')?.textContent ?? '',
    leather: node.classList.contains('s-row--leather'),
  }));
  assert.deepEqual(rows, [
    {
      label: "Today's page",
      href: '/student/journal?student=1',
      note: 'The journal for class',
      leather: true,
    },
    {
      label: 'Journal cards',
      href: '/student/cards?student=1',
      note: 'Search your notes',
      leather: true,
    },
    {
      label: 'Calendar',
      href: '/student/calendar?student=1',
      note: 'Classes, open mats, and tournaments',
      leather: true,
    },
    {
      label: 'Video Library',
      href: '/student/videos?student=1',
      note: 'Technique and drill links',
      leather: true,
    },
  ]);
  assert.deepEqual(
    [...page.host.querySelectorAll('a.s-extra__link')].map((node) => [node.textContent, node.getAttribute('href')]),
    [
      ['Film a move', '/student/videos?student=1#student-film-record'],
      ['Log a roll result', '/student/results?student=1'],
    ],
  );
  unmount(page);
});

test('competitor chips show a named event and a win-loss record when results exist', () => {
  const now = new Date();
  const date = todayIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 18));
  const report = blankStudentReport(1);
  report.competition = {
    ...emptyCompetition(),
    tournaments: [
      {
        id: 't1',
        name: 'Atlanta Open',
        date,
        location: 'Atlanta',
        division: '',
        deadline: '',
        link: '',
        status: 'entered',
        targetWeight: null,
        targetUnit: 'lb',
        goals: [],
      },
    ],
    results: [
      {
        id: 'r1',
        tournamentId: '',
        tournamentName: 'Fall Open',
        division: '',
        matches: [
          { id: 'm1', opponent: 'A', result: 'win', method: 'sub', note: '' },
          { id: 'm2', opponent: 'B', result: 'win', method: 'points', note: '' },
          { id: 'm3', opponent: 'C', result: 'win', method: 'points', note: '' },
          { id: 'm4', opponent: 'D', result: 'loss', method: 'points', note: '' },
        ],
        bracket: [],
        bracketPhoto: false,
      },
    ],
  };
  saveStudentReport(localStorage, report);
  const page = mount(<CompeteMenu />, '/student/compete?student=1');
  const text = page.host.textContent ?? '';
  assert.equal(text.includes('Next: Atlanta Open · 18d'), true);
  assert.equal(text.includes('Add a tournament'), false);
  assert.equal(text.includes('Record 3-1'), true);
  assert.equal(text.includes(WEIGHT_UNSET_LABEL), true);
  unmount(page);
  localStorage.clear();
});

function wear(report: ReturnType<typeof blankStudentReport>) {
  saveStudentReport(localStorage, report);
}

test('the main menu belt and the hub current-belt link follow My rank', () => {
  localStorage.clear();
  const fresh = mount(<StudentHub />, '/student?student=1');
  assert.equal(fresh.host.textContent?.includes('White · 0 stripes'), true);
  assert.equal(fresh.host.textContent?.includes('Pan Pacific'), false);
  assert.equal(fresh.host.textContent?.includes('(mock)'), false);
  assert.equal(fresh.host.querySelector('.s-belt-mark')?.getAttribute('data-belt'), 'white');
  assert.equal(fresh.host.querySelectorAll('.stripe.is-on').length, 0);

  act(() => {
    wear(setRankTapeCount(setRankBelt(blankStudentReport(2), 'brown', 3), 2, 4));
  });
  const brown = fresh.host.querySelector('.s-belt-mark');
  assert.equal(brown?.getAttribute('data-belt'), 'brown');
  assert.equal(brown?.getAttribute('data-system'), 'adult');
  assert.equal(brown?.getAttribute('data-stripes'), '2');
  assert.equal(brown?.querySelectorAll('.stripe').length, 4);
  assert.equal(brown?.querySelectorAll('.stripe.is-on').length, 2);
  assert.equal(brown?.querySelector('.rung--brown') instanceof view.HTMLElement, true);
  assert.equal(fresh.host.textContent?.includes('Brown · 2 stripes'), true);
  assert.match(
    fresh.host.querySelector('a[aria-label="Rank & Progress"]')?.getAttribute('href') ?? '',
    /\/student\/progress\?student=1$/,
  );
  assert.match(
    fresh.host.querySelector('a[aria-label="Current belt"]')?.getAttribute('href') ?? '',
    /\/student\/rank\?student=1#current$/,
  );
  unmount(fresh);

  wear(setRankTapeCount(setRankBelt(blankStudentReport(5), 'black', 6), 4, 7));
  const blackHub = mount(<StudentHub />, '/student?student=1');
  const black = blackHub.host.querySelector('.s-belt-mark');
  assert.equal(black?.getAttribute('data-belt'), 'black');
  assert.equal(black?.getAttribute('data-stripes'), '4');
  assert.equal(black?.querySelectorAll('.stripe').length, 6);
  assert.equal(black?.querySelectorAll('.stripe.is-on').length, 4);
  assert.equal(black?.querySelector('.belt--slim57') instanceof view.HTMLElement, true);
  assert.equal(blackHub.host.textContent?.includes('Black · 4 degrees'), true);
  assert.match(
    blackHub.host.querySelector('a[aria-label="Rank & Progress"]')?.getAttribute('href') ?? '',
    /\/student\/progress\?student=1$/,
  );
  unmount(blackHub);

  wear(setRankBelt(blankStudentReport(8), 'coral', 9));
  const coralHub = mount(<StudentHub />, '/student?student=1');
  assert.equal(coralHub.host.querySelector('.mini-belt--red-black') instanceof view.HTMLElement, true);
  assert.equal(coralHub.host.textContent?.includes('Coral · 7 degrees'), true);
  assert.match(
    coralHub.host.querySelector('a[aria-label="Current belt"]')?.getAttribute('href') ?? '',
    /\/student\/rank\?student=1#current$/,
  );
  unmount(coralHub);

  wear(setRankBelt(blankStudentReport(10), 'red', 11));
  const redHub = mount(<StudentHub />, '/student?student=1');
  assert.equal(redHub.host.querySelector('.mini-belt--red') instanceof view.HTMLElement, true);
  assert.equal(redHub.host.querySelector('.mini-belt--red-black'), null);
  assert.equal(redHub.host.textContent?.includes('Red · 9 degrees'), true);
  unmount(redHub);

  const menu = mount(<ProgressMenu />, '/student/progress?student=1');
  assert.equal(menu.host.querySelector('.s-rank-summary .mini-belt--red') instanceof view.HTMLElement, true);
  assert.equal(menu.host.textContent?.includes('Red belt · 9 degrees'), true);
  assert.equal(menu.host.querySelector('a[aria-label="My rank"]')?.getAttribute('href'), '/student/rank?student=1');
  assert.equal(menu.host.querySelector('a[aria-label="Current belt"]'), null);
  unmount(menu);

  localStorage.clear();
  const cleared = mount(<StudentHub />, '/student?student=1');
  assert.equal(cleared.host.querySelector('.s-belt-mark')?.getAttribute('data-belt'), 'white');
  assert.equal(cleared.host.querySelectorAll('.stripe.is-on').length, 0);
  assert.equal(cleared.host.textContent?.includes('White · 0 stripes'), true);
  unmount(cleared);
});

test('kids stripes and the adult switch repaint the same belt mark', () => {
  localStorage.clear();
  let report = setBeltMode(blankStudentReport(20), 'kids', 21);
  report = setKidsBelt(report, 'grey-white', 22);
  report = setKidsTapeCount(report, 2, 23);
  wear(report);
  const hub = mount(<StudentHub />, '/student?student=1');
  const kids = hub.host.querySelector('.s-belt-mark');
  assert.equal(kids?.getAttribute('data-system'), 'kids');
  assert.equal(kids?.getAttribute('data-belt'), 'grey-white');
  assert.equal(kids?.getAttribute('data-stripes'), '2');
  assert.equal(kids?.querySelector('.belt--kids') instanceof view.HTMLElement, true);
  const on = [...(kids?.querySelectorAll('.stripe.is-on') ?? [])];
  assert.equal(on.length, 2);
  assert.equal(on.every((slot) => (slot.getAttribute('style') ?? '').includes('#f4f1ea')), true);
  assert.equal(hub.host.textContent?.includes('Grey/White · 2 stripes'), true);

  act(() => {
    let next = setKidsTapeCount(report, 5, 24);
    wear(next);
    report = next;
  });
  const red = [...(hub.host.querySelectorAll('.s-belt-mark .stripe.is-on') ?? [])];
  assert.equal(red.length, 4);
  assert.equal((red[0]?.getAttribute('style') ?? '').includes('#d21f1f'), true);
  assert.equal((red[1]?.getAttribute('style') ?? '').includes('#f4f1ea'), true);

  act(() => {
    let next = setKidsBelt(report, 'yellow', 25);
    next = setKidsTapeCount(next, 1, 26);
    wear(next);
    report = next;
  });
  assert.equal(hub.host.querySelector('.s-belt-mark')?.getAttribute('data-belt'), 'yellow');
  assert.equal(hub.host.textContent?.includes('Yellow · 1 stripe'), true);
  const cloth = hub.host.querySelector('.s-belt-mark .rung');
  assert.equal((cloth?.getAttribute('style') ?? '').toLowerCase().includes('#e2b000'), true);

  act(() => {
    const adult = setRankTapeCount(setRankBelt(setBeltMode(report, 'adult', 27), 'brown', 28), 3, 29);
    wear(adult);
  });
  const back = hub.host.querySelector('.s-belt-mark');
  assert.equal(back?.getAttribute('data-system'), 'adult');
  assert.equal(back?.getAttribute('data-belt'), 'brown');
  assert.equal(back?.getAttribute('data-stripes'), '3');
  assert.equal(hub.host.textContent?.includes('Brown · 3 stripes'), true);
  assert.equal(hub.host.textContent?.includes('Yellow'), false);
  unmount(hub);
  localStorage.clear();
});

test('clearing student data asks for a backup, then the word CLEAR', () => {
  const page = mount(<ClearStudentMenu />, '/student/backup/clear?student=1');
  const click = (name: string) => {
    const button = [...page.host.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
    assert.ok(button, name);
    act(() => {
      button.click();
    });
  };
  click('Clear all Student Edition data');
  assert.equal(page.host.textContent?.includes('Back up first'), true);
  click('Continue without a backup');
  const erase = [...page.host.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Erase Student Edition data');
  assert.equal((erase as HTMLButtonElement | undefined)?.disabled, true);
  assert.ok(page.host.querySelector('input[aria-label="Type CLEAR to confirm"]'));
  assert.equal(page.host.textContent?.includes('Confirm clear'), false);
  assert.equal(page.host.textContent?.includes('Journal'), true);
  unmount(page);
});

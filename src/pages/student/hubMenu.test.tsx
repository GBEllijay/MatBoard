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
import { blankStudentReport, saveStudentReport, todayIso } from '../../lib/studentEdition.ts';
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
  assert.equal(hub.host.querySelector('.s-belt')?.getAttribute('data-stripes'), '0');
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
  }
  assert.equal(progress?.host.querySelector('.s-rank-summary .s-belt')?.getAttribute('data-stripes'), '0');
  assert.match(progress?.host.querySelector('a[aria-label="My profile"]')?.getAttribute('href') ?? '', /\/student\/profile\?student=1$/);
  const compete = pages[2];
  const competeText = compete?.host.textContent ?? '';
  assert.equal(competeText.includes(SCOUTING_LABEL), true);
  assert.equal(competeText.includes(NO_EVENT_LABEL), true);
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
  assert.equal(text.includes('Record 3-1'), true);
  assert.equal(text.includes(WEIGHT_UNSET_LABEL), true);
  unmount(page);
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

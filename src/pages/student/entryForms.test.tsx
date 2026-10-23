/**
 * Entry-form fixes: journal save confirmation, card edit and delete,
 * weight name and date, video picker buttons, and match toggles.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { competitorHubSummary } from '../../lib/studentHubMenu.ts';
import { addCompetitionResult, addTournament } from '../../lib/studentCompetition.ts';
import {
  addJournalEntry,
  blankStudentReport,
  loadStudentReport,
  saveStudentReport,
  todayIso,
} from '../../lib/studentEdition.ts';
import { StudentEditionPage } from '../StudentEdition.tsx';
import { ResultsPage } from './ResultsPage.tsx';
import { VideoLibraryPage } from './VideoLibraryPage.tsx';
import { WeightPage } from './WeightPage.tsx';

const dom = new Window({ url: 'http://localhost/student/journal?student=1' });
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
installGlobal('HTMLSelectElement', view.HTMLSelectElement);
installGlobal('HTMLFormElement', view.HTMLFormElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('DocumentFragment', view.DocumentFragment);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('InputEvent', view.InputEvent);
installGlobal('FocusEvent', view.FocusEvent);
installGlobal('FormData', view.FormData);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode, path: string): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function control(host: ParentNode, tag: string, name: string): HTMLElement {
  const found = [...host.querySelectorAll(tag)].find((node) => node.textContent?.trim() === name);
  assert.ok(found, name);
  return found as HTMLElement;
}

function labeled(host: ParentNode, name: string): HTMLElement {
  const found = host.querySelector(`[aria-label="${name}"]`);
  assert.ok(found, name);
  return found as HTMLElement;
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  );
  proto?.set?.call(input, value);
  act(() => {
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

function field(host: ParentNode, name: string): HTMLInputElement | HTMLTextAreaElement {
  const byAria = host.querySelector(`[aria-label="${name}"]`);
  if (byAria instanceof HTMLInputElement || byAria instanceof HTMLTextAreaElement) return byAria;
  const label = [...host.querySelectorAll('label')].find((node) => node.querySelector('.ink__label')?.textContent === name);
  const control = label?.querySelector('input, textarea');
  assert.ok(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement, name);
  return control;
}

function click(node: HTMLElement) {
  act(() => {
    node.click();
  });
}

test('journal save lands on the card with Saved, and edit and delete keep the other fields', () => {
  localStorage.clear();
  const mounted = mount(<StudentEditionPage />, '/student/journal?student=1');
  const { host } = mounted;
  assert.equal(host.querySelector('h1')?.textContent, 'Journal');
  assert.equal(host.querySelector('[role="status"]'), null);
  typeInto(field(host, 'Class'), 'Fundamentals');
  typeInto(field(host, 'Technique drilled #1'), 'Scissor sweep');
  typeInto(field(host, 'Training Partners'), 'Alex');
  typeInto(field(host, 'Drills'), 'hip escapes');
  typeInto(field(host, 'Rolls'), '5 rounds');
  typeInto(field(host, 'Notes'), 'grip the collar deeper');
  click(control(host, 'button', 'Save entry'));

  assert.equal(host.querySelector('h1')?.textContent, 'Journal card');
  assert.equal(host.querySelector('[role="status"]')?.textContent, 'Saved');
  assert.match(host.textContent ?? '', /Technique drilled #1: Scissor sweep/);
  assert.match(host.textContent ?? '', /Training partners: Alex/);
  assert.match(host.textContent ?? '', /Drills: hip escapes/);
  assert.match(host.textContent ?? '', /Rolls: 5 rounds/);
  assert.match(host.textContent ?? '', /Notes: grip the collar deeper/);
  assert.equal(host.querySelector('[aria-label="Amendment"]') instanceof HTMLTextAreaElement, true);
  assert.equal(labeled(host, 'Back. Hold for Home.').getAttribute('href'), '/student/cards?student=1');

  click(labeled(host, 'Back. Hold for Home.'));
  assert.equal(host.querySelector('h1')?.textContent, 'Journal cards');
  const link = [...host.querySelectorAll('a.student-card-link')].find((node) => node.textContent?.includes('Scissor sweep'));
  assert.ok(link);
  const lines = [...link.querySelectorAll('span')].map((node) => node.textContent);
  assert.ok(lines.includes('Training partners: Alex'));
  assert.ok(lines.includes('Drills: hip escapes'));
  assert.ok(lines.includes('Rolls: 5 rounds'));
  const date = todayIso();
  click(control(host, 'a', `Edit ${date} Fundamentals`));
  assert.equal(field(host, 'Edit training partners') instanceof HTMLTextAreaElement, true);
  assert.equal(field(host, 'Edit drills') instanceof HTMLTextAreaElement, true);
  assert.equal(field(host, 'Edit rolls') instanceof HTMLTextAreaElement, true);
  assert.equal(field(host, 'Edit notes') instanceof HTMLTextAreaElement, true);
  assert.match(host.textContent ?? '', /Later notes/);
  typeInto(field(host, 'Edit rolls'), '6 rounds');
  click(control(host, 'button', 'Save card'));
  assert.equal(host.querySelector('[role="status"]')?.textContent, 'Saved');
  assert.match(host.textContent ?? '', /Rolls: 6 rounds/);
  assert.match(host.textContent ?? '', /Training partners: Alex/);
  assert.equal(host.querySelector('[aria-label="Edit rolls"]'), null);

  click(control(host, 'button', 'Delete this card'));
  assert.match(host.textContent ?? '', /Delete this card\?/);
  click(control(host, 'button', 'Keep card'));
  assert.match(host.textContent ?? '', /Scissor sweep/);
  click(control(host, 'button', 'Delete this card'));
  click(control(host, 'button', 'Confirm delete'));
  assert.equal(host.querySelector('h1')?.textContent, 'Journal cards');
  assert.equal(host.textContent?.includes('Scissor sweep'), false);
  assert.equal(loadStudentReport(localStorage).journal.length, 0);
  unmount(mounted);
});

test('an older card still shows partners, drills, and rolls, and delete asks before removing it', () => {
  localStorage.clear();
  saveStudentReport(
    localStorage,
    addJournalEntry(
      blankStudentReport(10),
      {
        date: '2026-10-11',
        className: 'Gi',
        gameTag: '',
        techniques: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
        partners: 'Alex',
        drills: 'hip escapes',
        rolls: '5 rounds',
        notes: 'grip the collar deeper',
      },
      10,
    ),
  );
  const mounted = mount(<StudentEditionPage />, '/student/cards?student=1');
  const { host } = mounted;
  assert.match(host.textContent ?? '', /Training partners: Alex/);
  click(control(host, 'button', 'Delete 2026-10-11 Gi'));
  assert.match(host.textContent ?? '', /Delete this card\?/);
  assert.equal(loadStudentReport(localStorage).journal.length, 1);
  click(control(host, 'button', 'Confirm delete'));
  assert.equal(loadStudentReport(localStorage).journal.length, 0);
  unmount(mounted);
});

test('weight tournament name and date are separate lines', () => {
  localStorage.clear();
  const today = todayIso();
  const meet = '2099-06-01';
  saveStudentReport(
    localStorage,
    addTournament(
      blankStudentReport(10),
      {
        name: 'Spring Open',
        date: meet,
        location: 'Atlanta',
        division: 'Adult Blue',
        deadline: '',
        link: '',
        status: 'entered',
        targetWeight: '170',
        targetUnit: 'lb',
      },
      11,
    ),
  );
  const mounted = mount(<WeightPage />, '/student/weight?student=1');
  const { host } = mounted;
  const name = host.querySelector('.weight-count__detail .weight-target__name');
  const date = host.querySelector('.weight-count__detail .weight-target__date');
  assert.equal(name?.textContent, 'Spring Open');
  assert.equal(date?.textContent, meet);
  assert.notEqual(name, date);
  const targetName = host.querySelector('li .weight-target__name');
  const targetDate = host.querySelector('li .weight-target__date');
  const division = host.querySelector('li .weight-target__division');
  assert.equal(targetName?.textContent, 'Spring Open');
  assert.equal(targetDate?.textContent, meet);
  assert.equal(division?.textContent, 'Adult Blue');
  assert.equal(targetDate?.textContent?.includes('Spring Open'), false);
  assert.equal(host.querySelector('h1')?.textContent, 'Weight');
  assert.equal(today < meet, true);
  unmount(mounted);
});

test('video file pickers sit out of the button row', () => {
  localStorage.clear();
  const mounted = mount(<VideoLibraryPage />, '/student/videos?student=1');
  const { host } = mounted;
  const main = host.querySelector('main');
  assert.ok(main?.classList.contains('student--arena'));
  const record = host.querySelector('#student-film-record');
  const library = host.querySelector('#student-film-library');
  assert.ok(record?.classList.contains('student-film-file'));
  assert.ok(library?.classList.contains('student-film-file'));
  assert.equal(record?.parentElement?.classList.contains('student-film__inputs'), true);
  assert.equal(library?.parentElement?.classList.contains('student-film__inputs'), true);
  const film = control(host, 'label', 'Film a move');
  const gallery = control(host, 'label', 'Pick from gallery');
  assert.equal(film.getAttribute('for'), 'student-film-record');
  assert.equal(gallery.getAttribute('for'), 'student-film-library');
  assert.equal(film.parentElement?.classList.contains('student-film__actions'), true);
  assert.equal(host.querySelector('h1')?.textContent, 'Video Library');
  assert.ok(control(host, 'button', 'Add video'));
  unmount(mounted);

  const css = readFileSync('src/student-edition.css', 'utf8');
  const filmRule = css.slice(css.indexOf('input.sr-only.student-film-file'), css.indexOf('.student-film__actions'));
  assert.match(filmRule, /position:\s*fixed/);
  assert.match(filmRule, /z-index:\s*0/);
  const actions = css.slice(css.indexOf('.student-film__actions,'), css.indexOf('.rank-stripe-thumb'));
  assert.match(actions, /min-height:\s*44px/);
  assert.match(actions, /z-index:\s*2/);
  const ring = css.slice(css.indexOf('.cal-dot--tournament'), css.indexOf('.cal-dot--rank'));
  assert.match(ring, /width:\s*12px/);
  assert.match(ring, /background:\s*transparent/);
  assert.match(ring, /border-radius:\s*50%/);
  const meter = readFileSync('src/pages/student/fundamentals.css', 'utf8');
  assert.match(meter, /\.fund-meter span[\s\S]*transition:\s*none/);
});

test('match win and loss toggles reset, and the match date stays on the record', () => {
  localStorage.clear();
  const today = todayIso();
  saveStudentReport(
    localStorage,
    addCompetitionResult(blankStudentReport(10), { tournamentId: '', tournamentName: 'Spring Open', division: 'Adult Blue' }, 11),
  );
  const mounted = mount(<ResultsPage />, '/student/results?student=1');
  const { host } = mounted;
  const resultGroup = host.querySelector('[aria-label="Result for Spring Open"]');
  const methodGroup = host.querySelector('[aria-label="Method for Spring Open"]');
  assert.ok(resultGroup && methodGroup);
  assert.equal(control(resultGroup, 'button', 'Win').getAttribute('aria-pressed'), 'true');
  click(control(resultGroup, 'button', 'Loss'));
  click(control(methodGroup, 'button', 'Sub'));
  typeInto(field(host, 'Opponent for Spring Open') as HTMLInputElement, 'Jo');
  typeInto(field(host, 'Match date for Spring Open') as HTMLInputElement, '2026-10-20');
  typeInto(field(host, 'Match notes for Spring Open') as HTMLInputElement, 'closed the guard');
  click(control(host, 'button', 'Add match for Spring Open'));

  assert.match(host.querySelector('.match-line__date')?.textContent ?? '', /2026-10-20/);
  assert.match(host.querySelector('.match-line__result')?.textContent ?? '', /Loss · Jo · Sub — closed the guard/);
  assert.equal(control(host.querySelector('[aria-label="Result for Spring Open"]') as HTMLElement, 'button', 'Win').getAttribute('aria-pressed'), 'true');
  assert.equal(control(host.querySelector('[aria-label="Result for Spring Open"]') as HTMLElement, 'button', 'Loss').getAttribute('aria-pressed'), 'false');
  assert.equal(control(host.querySelector('[aria-label="Method for Spring Open"]') as HTMLElement, 'button', 'Points').getAttribute('aria-pressed'), 'true');
  assert.equal(control(host.querySelector('[aria-label="Method for Spring Open"]') as HTMLElement, 'button', 'Sub').getAttribute('aria-pressed'), 'false');
  assert.equal((field(host, 'Match date for Spring Open') as HTMLInputElement).value, today);
  assert.equal((field(host, 'Opponent for Spring Open') as HTMLInputElement).value, '');

  typeInto(field(host, 'Opponent for Spring Open') as HTMLInputElement, 'Sam');
  click(control(host, 'button', 'Add match for Spring Open'));
  const lines = [...host.querySelectorAll('.match-line__result')].map((node) => node.textContent);
  assert.match(lines[0] ?? '', /Loss · Jo · Sub/);
  assert.match(lines[1] ?? '', /Win · Sam · Points/);
  assert.equal(competitorHubSummary(loadStudentReport(localStorage), today).record, 'Record 1-1');
  const stored = loadStudentReport(localStorage).competition?.results[0]?.matches ?? [];
  assert.equal(stored[0]?.date, '2026-10-20');
  assert.equal(stored[1]?.date, today);
  assert.equal(stored[1]?.result, 'win');
  assert.equal(stored[1]?.method, 'points');
  unmount(mounted);
});

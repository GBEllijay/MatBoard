/**
 * Results page: quick result entry, four class pickers on full entries, and
 * in-place Edit for both, including fixing a missing belt to Brown.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { recentMedals } from '../../lib/cardMedals.ts';
import { emptyCompetition } from '../../lib/progress/competition.ts';
import type { CompetitionResult } from '../../lib/progress/types.ts';
import { addCompetitionResult } from '../../lib/studentCompetition.ts';
import { blankStudentReport, loadStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { ResultsPage } from './ResultsPage.tsx';
import { StudentEditionPage } from '../StudentEdition.tsx';

const dom = new Window({ url: 'http://localhost/student/results?student=1' });
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

function typeInto(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  proto?.set?.call(input, value);
  act(() => {
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

function chooseSelect(select: HTMLSelectElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  proto?.set?.call(select, value);
  act(() => {
    const key = Object.keys(select).find((name) => name.startsWith('__reactProps'));
    const props = key ? (select as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: select, currentTarget: select });
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function click(node: HTMLElement) {
  act(() => {
    node.click();
  });
}

function seed(report = blankStudentReport(10)) {
  localStorage.clear();
  saveStudentReport(localStorage, { ...report, profile: { ...report.profile, belt: 'black', displayName: 'Paige' } });
}

test('a quick result saves gold without matches and shows the four class fields', () => {
  seed();
  const mounted = mount(<ResultsPage />, '/student/results?student=1');
  const { host } = mounted;
  click(control(host, 'button', 'Quick result'));
  typeInto(labeled(host, 'Result tournament name') as HTMLInputElement, 'IBJJF Europeans');
  typeInto(labeled(host, 'Result date') as HTMLInputElement, '2026-01-24');
  chooseSelect(labeled(host, 'Result age division') as HTMLSelectElement, 'Master 3');
  chooseSelect(labeled(host, 'Result competition division') as HTMLSelectElement, 'Gi');
  chooseSelect(labeled(host, 'Result weight class') as HTMLSelectElement, 'Middle');
  chooseSelect(labeled(host, 'Result belt rank') as HTMLSelectElement, 'Brown');
  click(control(host, 'button', 'Gold'));
  click(control(host, 'button', 'Save quick result'));

  assert.match(host.textContent ?? '', /IBJJF Europeans/);
  assert.match(host.textContent ?? '', /Master 3 · Gi · Middle · Brown/);
  assert.match(host.textContent ?? '', /Quick result · Gold/);
  assert.equal(host.textContent?.includes('Add match for IBJJF Europeans'), false);

  const stored = loadStudentReport(localStorage).competition?.results[0];
  assert.equal(stored?.quick, true);
  assert.equal(stored?.place, 'gold');
  assert.equal(stored?.belt, 'Brown');
  assert.equal(stored?.matches.length, 0);
  assert.equal(recentMedals(loadStudentReport(localStorage).competition)[0]?.belt, 'Brown');
  unmount(mounted);
});

test('the full result form uses the four pickers, and match logging still works', () => {
  seed();
  const mounted = mount(<ResultsPage />, '/student/results?student=1');
  const { host } = mounted;
  typeInto(labeled(host, 'Result tournament name') as HTMLInputElement, 'Spring Cup');
  chooseSelect(labeled(host, 'Result age division') as HTMLSelectElement, 'Adult');
  chooseSelect(labeled(host, 'Result competition division') as HTMLSelectElement, 'Gi');
  chooseSelect(labeled(host, 'Result weight class') as HTMLSelectElement, 'Light');
  chooseSelect(labeled(host, 'Result belt rank') as HTMLSelectElement, 'Blue');
  click(control(host, 'button', 'Add result'));
  assert.match(host.textContent ?? '', /Adult · Gi · Light · Blue/);
  typeInto(labeled(host, 'Opponent for Spring Cup') as HTMLInputElement, 'Sam');
  click(control(host.querySelector('[aria-label="Result for Spring Cup"]') as HTMLElement, 'button', 'Win'));
  click(control(host, 'button', 'Add match for Spring Cup'));
  assert.match(host.textContent ?? '', /Win · Sam/);
  const stored = loadStudentReport(localStorage).competition?.results[0];
  assert.equal(stored?.quick, undefined);
  assert.equal(stored?.belt, 'Blue');
  assert.equal(stored?.matches[0]?.opponent, 'Sam');
  unmount(mounted);
});

test('Edit updates a quick result in place, and Cancel leaves it unchanged', () => {
  seed(
    addCompetitionResult(blankStudentReport(20), {
      tournamentId: '',
      tournamentName: 'IBJJF Europeans',
      date: '2026-01-24',
      place: 'silver',
      quick: true,
      ageDivision: 'Master 3',
      weightClass: 'Middle',
    }, 21),
  );
  const id = loadStudentReport(localStorage).competition?.results[0]?.id ?? '';
  const mounted = mount(<ResultsPage />, '/student/results?student=1');
  const { host } = mounted;
  click(control(host, 'button', 'Edit IBJJF Europeans'));
  assert.equal((labeled(host, 'Result tournament name') as HTMLInputElement).value, 'IBJJF Europeans');
  assert.equal((labeled(host, 'Result age division') as HTMLSelectElement).value, 'Master 3');
  assert.equal((labeled(host, 'Result weight class') as HTMLSelectElement).value, 'Middle');
  assert.equal((labeled(host, 'Quick result place').querySelector('[aria-pressed="true"]') as HTMLElement | null)?.textContent?.trim(), 'Silver');
  chooseSelect(labeled(host, 'Result belt rank') as HTMLSelectElement, 'Brown');
  click(control(host, 'button', 'Gold'));
  click(control(host, 'button', 'Cancel'));
  assert.equal(loadStudentReport(localStorage).competition?.results[0]?.id, id);
  assert.equal(loadStudentReport(localStorage).competition?.results[0]?.place, 'silver');
  assert.equal(loadStudentReport(localStorage).competition?.results[0]?.belt, undefined);

  click(control(host, 'button', 'Edit IBJJF Europeans'));
  chooseSelect(labeled(host, 'Result belt rank') as HTMLSelectElement, 'Brown');
  click(control(host, 'button', 'Gold'));
  click(control(host, 'button', 'Save'));
  const stored = loadStudentReport(localStorage).competition?.results[0];
  assert.equal(stored?.id, id);
  assert.equal(stored?.place, 'gold');
  assert.equal(stored?.belt, 'Brown');
  assert.equal(loadStudentReport(localStorage).competition?.results.length, 1);
  assert.match(host.textContent ?? '', /Quick result · Gold/);
  assert.match(host.textContent ?? '', /Master 3 · Middle · Brown/);
  unmount(mounted);
});

test('Edit on a full entry prefills matches and can fix Paige’s belt from blank to Brown', () => {
  const legacy: CompetitionResult = {
    id: 'result.europeans',
    tournamentId: '',
    tournamentName: 'IBJJF Europeans',
    division: 'Saturday squad',
    matches: [{ id: 'match.1', opponent: 'Alex', result: 'win', method: 'points', note: 'close', date: '2026-01-24' }],
    bracket: [],
    bracketPhoto: false,
  };
  const report = blankStudentReport(30);
  report.profile.belt = 'black';
  report.competition = { ...emptyCompetition(), results: [legacy] };
  seed(report);

  const loaded = loadStudentReport(localStorage).competition?.results[0];
  assert.equal(loaded?.id, 'result.europeans');
  assert.equal(loaded?.division, 'Saturday squad');
  assert.equal(loaded?.belt, undefined);
  assert.equal(recentMedals(loadStudentReport(localStorage).competition)[0]?.belt, '');

  const mounted = mount(<ResultsPage />, '/student/results?student=1');
  const { host } = mounted;
  click(control(host, 'button', 'Edit IBJJF Europeans'));
  assert.equal((labeled(host, 'Result tournament name') as HTMLInputElement).value, 'IBJJF Europeans');
  assert.equal((labeled(host, 'Edit opponent 1') as HTMLInputElement).value, 'Alex');
  assert.equal((labeled(host, 'Result belt rank') as HTMLSelectElement).value, '');
  chooseSelect(labeled(host, 'Result age division') as HTMLSelectElement, 'Master 3');
  chooseSelect(labeled(host, 'Result weight class') as HTMLSelectElement, 'Middle');
  chooseSelect(labeled(host, 'Result belt rank') as HTMLSelectElement, 'Brown');
  typeInto(labeled(host, 'Edit opponent 1') as HTMLInputElement, 'Alex Reed');
  click(control(host, 'button', 'Save'));

  const stored = loadStudentReport(localStorage).competition?.results[0];
  assert.equal(stored?.id, 'result.europeans');
  assert.equal(stored?.belt, 'Brown');
  assert.equal(stored?.ageDivision, 'Master 3');
  assert.equal(stored?.weightClass, 'Middle');
  assert.equal(stored?.matches[0]?.id, 'match.1');
  assert.equal(stored?.matches[0]?.opponent, 'Alex Reed');
  assert.equal(recentMedals(loadStudentReport(localStorage).competition)[0]?.belt, 'Brown');
  assert.match(host.textContent ?? '', /Master 3 · Middle · Brown/);
  unmount(mounted);
});

test('a medal on the student card shows the result belt, not the current black belt', () => {
  seed(
    addCompetitionResult(blankStudentReport(40), {
      tournamentId: '',
      tournamentName: 'IBJJF Europeans',
      date: '2026-01-24',
      place: 'gold',
      quick: true,
      ageDivision: 'Master 3',
      weightClass: 'Middle',
      belt: 'Brown',
    }, 41),
  );
  const page = mount(<StudentEditionPage />, '/student/profile?student=1');
  const medal = page.host.querySelector('[data-testid="card-medal"]') as HTMLElement;
  assert.ok(medal);
  assert.equal(medal.getAttribute('data-belt'), 'Brown');
  assert.match(medal.getAttribute('aria-label') ?? '', /Brown/);
  assert.match(medal.textContent ?? '', /Brown/);
  assert.equal((medal.textContent ?? '').includes('Black'), false);
  unmount(page);
});


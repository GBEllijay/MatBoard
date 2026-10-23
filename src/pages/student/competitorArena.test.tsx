/**
 * Competitor tab controls that the arena restyle has to keep.
 * Rank, journal entry, and self-assessment are added. Nothing else is removed.
 *
 * Touched controls:
 * Back. Hold for Home. Home.
 * Belt rank, Open My rank.
 * Jiu-Jitsu Journal, Today's page, Journal cards.
 * Self-assessment date, Guard/Passing/Takedowns/Escapes/Submissions/Conditioning/Mindset 1–5,
 * Self-assessment note, Save self-assessment, Update self-assessment,
 * Remove check-in, Confirm remove check-in, Keep check-in,
 * Open {checkpoint} checkpoint when the rubric has that area.
 * Search competition.
 * Tournament name, date, location, division, deadline, link.
 * Considering, Entered, Pounds, Kilograms.
 * Target division weight, Add tournament, Save tournament, Cancel tournament edit.
 * Earlier tournaments, goal, goal note, add goal, mark met, remove goal,
 * Edit, Remove, Confirm remove, Keep tournament.
 * A/B/C game techniques, game plan, Save game A/B/C.
 * Weight: unit, chart, target, weigh-in date/weight/note, Add weigh-in, Remove weigh-in.
 * Results: tracked tournament, name, division, Add result, match, method, bracket, photo, remove.
 * Scouting: template, import, export, search, class, opponent fields, add/edit/remove.
 * Scouting-Opponent Research (same /student/scouting route and hub button):
 * page title, Scouting-Opponent Tracker, {name} area 1–5, strengths, weaknesses,
 * Save notes, Me versus overlay, Do your self-assessment when no check-in exists.
 * Competitor does not host the tracker. Unlock codes are untouched.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { radarPoints, selfAssessmentShapeLabel } from '../../lib/radarChart.ts';
import { emptyAssessments, saveAssessment, writeAssessments, type AssessmentScores } from '../../lib/studentAssessment.ts';
import { addTournament, addWeighIn } from '../../lib/studentCompetition.ts';
import { blankStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { SCOUTING_STORAGE_KEY, addScoutingCard, loadScouting, saveScouting } from '../../lib/studentScouting.ts';
import { withStarterRubric } from '../../lib/studentTools.ts';
import { CompetitorPage } from './CompetitorPage.tsx';
import { ResultsPage } from './ResultsPage.tsx';
import { ScoutingPage } from './ScoutingPage.tsx';
import { WeightPage } from './WeightPage.tsx';

const dom = new Window({ url: 'http://localhost/student/competitor' });
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
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('DocumentFragment', view.DocumentFragment);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('InputEvent', view.InputEvent);
installGlobal('FocusEvent', view.FocusEvent);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode, initialEntry = '/student/competitor'): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[initialEntry]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function labeled(host: ParentNode, name: string): HTMLElement {
  const found = host.querySelector(`[aria-label="${name}"]`);
  assert.ok(found, name);
  return found as HTMLElement;
}

function control(host: ParentNode, tag: string, name: string): HTMLElement {
  const found = [...host.querySelectorAll(tag)].find((node) => node.textContent?.trim() === name);
  assert.ok(found, name);
  return found as HTMLElement;
}

function precedes(earlier: Element, later: Element) {
  const position = earlier.compareDocumentPosition(later);
  assert.ok(position & Node.DOCUMENT_POSITION_FOLLOWING);
}

test('competitor keeps every control, with rank then journal then self-assessment then the work', () => {
  localStorage.clear();
  const mounted = mount(<CompetitorPage />);
  const { host } = mounted;
  const main = host.querySelector('main');
  assert.ok(main?.classList.contains('student--arena'));
  assert.equal(labeled(host, 'Back. Hold for Home.').getAttribute('href'), '/student/compete');
  assert.equal(labeled(host, 'Home').getAttribute('href'), '/products');
  assert.equal(host.querySelector('h1')?.textContent, 'Competitor');
  assert.equal(host.textContent?.includes('Scouting-Opponent Tracker'), false);
  assert.equal(host.textContent?.includes('Scouting-Opponent Research'), false);

  const rank = labeled(host, 'Belt rank');
  const journal = labeled(host, 'Jiu-Jitsu Journal');
  const assess = labeled(host, 'Self-assessment');
  const tournaments = labeled(host, 'Tournaments');
  const games = labeled(host, 'Competition game');
  precedes(rank, journal);
  precedes(journal, assess);
  precedes(assess, tournaments);
  precedes(tournaments, games);
  assert.ok(journal.classList.contains('arena-journal'));
  assert.match(rank.textContent ?? '', /White/);
  assert.equal(control(host, 'a', 'Open My rank').getAttribute('href'), '/student/rank');
  assert.equal(control(host, 'a', "Today's page").getAttribute('href'), '/student/journal');
  assert.equal(control(host, 'a', 'Journal cards').getAttribute('href'), '/student/cards');

  for (const name of [
    'Search competition',
    'Tournament name',
    'Tournament date',
    'Tournament location',
    'Division and weight class',
    'Registration deadline',
    'Tournament link',
    'Target division weight',
    'Self-assessment date',
    'Self-assessment note',
    'A game techniques',
    'A game plan',
    'B game techniques',
    'B game plan',
    'C game techniques',
    'C game plan',
  ]) {
    labeled(host, name);
  }
  for (const name of ['Considering', 'Entered', 'Pounds', 'Kilograms', 'Add tournament', 'Save game A', 'Save game B', 'Save game C', 'Save self-assessment']) {
    control(host, 'button', name);
  }
  for (const area of ['Guard', 'Passing', 'Takedowns', 'Escapes', 'Submissions', 'Conditioning', 'Mindset']) {
    for (const score of [1, 2, 3, 4, 5]) labeled(host, `${area} ${score}`);
  }
  const shape = host.querySelector('svg.assess-chart');
  assert.equal(shape?.getAttribute('aria-label'), selfAssessmentShapeLabel(null));
  assert.equal(host.querySelectorAll('polygon.assess-chart__shape').length, 0);
  assert.equal(host.querySelector('.assess-key'), null);
  assert.ok(host.querySelector('[aria-label^="Self-assessment trend"]'));
  unmount(mounted);
});

test('a self-assessment saves on this phone and a rubric checkpoint links from the matching rating', () => {
  localStorage.clear();
  saveStudentReport(localStorage, withStarterRubric(blankStudentReport()));
  const mounted = mount(<CompetitorPage />);
  const { host } = mounted;
  assert.equal(control(host, 'a', 'Open Guard checkpoint').getAttribute('href'), '/student/rubric#checkpoint.white.guard');
  assert.equal(control(host, 'a', 'Open Passes checkpoint').getAttribute('href'), '/student/rubric#checkpoint.white.passes');
  assert.equal(host.textContent?.includes('Open Conditioning checkpoint'), false);

  for (const area of ['Guard', 'Passing', 'Takedowns', 'Escapes', 'Submissions', 'Conditioning', 'Mindset']) {
    act(() => {
      labeled(host, `${area} 4`).click();
    });
  }
  const note = labeled(host, 'Self-assessment note') as HTMLTextAreaElement;
  const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  proto?.set?.call(note, 'calm rounds');
  act(() => {
    note.dispatchEvent(new Event('input', { bubbles: true }));
    const key = Object.keys(note).find((name) => name.startsWith('__reactProps'));
    const props = key ? (note as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: note, currentTarget: note });
  });
  const filled: AssessmentScores = {
    guard: 4,
    passing: 4,
    takedowns: 4,
    escapes: 4,
    submissions: 4,
    conditioning: 4,
    mindset: 4,
  };
  const shape = host.querySelector('svg.assess-chart');
  assert.equal(shape?.getAttribute('aria-label'), selfAssessmentShapeLabel(filled));
  assert.equal(shape?.querySelectorAll('polygon.assess-chart__shape').length, 1);
  assert.equal(shape?.querySelector('polygon.assess-chart__shape--opponent'), null);
  assert.equal(shape?.querySelector('polygon.assess-chart__shape')?.getAttribute('points'), radarPoints([4, 4, 4, 4, 4, 4, 4]));
  act(() => {
    control(host, 'button', 'Save self-assessment').click();
  });
  assert.match(host.textContent ?? '', /calm rounds/);
  assert.equal(localStorage.getItem('matboard.studentEdition.assessment.v1')?.includes('calm rounds'), true);
  unmount(mounted);

  const again = mount(<CompetitorPage />);
  assert.equal((labeled(again.host, 'Self-assessment note') as HTMLTextAreaElement).value, 'calm rounds');
  assert.equal(control(again.host, 'button', 'Update self-assessment').textContent, 'Update self-assessment');
  unmount(again);
});

test('weight, results, and scouting keep their controls on the same skin', () => {
  localStorage.clear();
  let report = blankStudentReport();
  report = addTournament(report, {
    name: 'Spring Open',
    date: '2026-12-01',
    location: 'Atlanta',
    division: 'Middle',
    deadline: '',
    link: '',
    status: 'entered',
    targetWeight: '170',
    targetUnit: 'lb',
  });
  report = addWeighIn(report, { date: '2026-10-01', weight: '174', unit: 'lb', note: 'morning' });
  saveStudentReport(localStorage, report);

  const weight = mount(<WeightPage />, '/student/weight');
  assert.ok(weight.host.querySelector('main')?.classList.contains('student--arena'));
  assert.equal(weight.host.querySelector('h1')?.textContent, 'Weight');
  labeled(weight.host, 'Weigh-in date');
  labeled(weight.host, 'Weigh-in weight');
  labeled(weight.host, 'Weigh-in note');
  labeled(weight.host, 'Weight unit');
  labeled(weight.host, 'Competition weigh-in date');
  control(weight.host, 'button', 'Add weigh-in');
  control(weight.host, 'button', 'Save weigh-in date');
  control(weight.host, 'button', 'Save goal weight');
  assert.ok(weight.host.querySelector('svg.weight-chart'));
  assert.ok(weight.host.querySelector('.weight-chart__target'));
  assert.match(weight.host.textContent ?? '', /2026-10-01/);
  assert.match(weight.host.textContent ?? '', /Pounds to Target/);
  unmount(weight);

  const results = mount(<ResultsPage />, '/student/results');
  assert.ok(results.host.querySelector('main')?.classList.contains('student--arena'));
  assert.equal(results.host.querySelector('h1')?.textContent, 'Results');
  labeled(results.host, 'Tracked tournament');
  labeled(results.host, 'Result tournament name');
  labeled(results.host, 'Result division');
  control(results.host, 'button', 'Add result');
  unmount(results);

  const scouting = mount(<ScoutingPage />, '/student/scouting');
  assert.ok(scouting.host.querySelector('main')?.classList.contains('student--arena'));
  assert.equal(scouting.host.querySelector('h1')?.textContent, 'Opponent scouting');
  assert.equal(
    [...scouting.host.querySelectorAll('h2')].some((node) => node.textContent?.trim() === 'Opponent scouting'),
    true,
  );
  for (const name of [
    'Search opponents',
    'Opponent class',
    'Opponent name',
    'Opponent gym',
    'Opponent belt',
    'Opponent weight class',
    'Opponent style',
    'Opponent notes',
    'Import opponent CSV',
  ]) {
    labeled(scouting.host, name);
  }
  for (const name of ['Download template', 'Import CSV', 'Export CSV', 'Add opponent', 'Weight class', 'Open class']) {
    assert.ok(
      [...scouting.host.querySelectorAll('button')].some((button) => button.textContent?.trim() === name),
      name,
    );
  }
  unmount(scouting);
});

function setControl(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(node.constructor.prototype, 'value');
  proto?.set?.call(node, value);
  act(() => {
    node.dispatchEvent(new Event('input', { bubbles: true }));
    const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
    const props = key ? (node as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: node, currentTarget: node });
  });
}

function allScores(value: AssessmentScores['guard']): AssessmentScores {
  return {
    guard: value,
    passing: value,
    takedowns: value,
    escapes: value,
    submissions: value,
    conditioning: value,
    mindset: value,
  };
}

test('opponent ratings persist, an old card still opens, and me versus them uses the latest self-assessment', () => {
  localStorage.clear();
  const mine: AssessmentScores = {
    guard: 5,
    passing: 1,
    takedowns: 3,
    escapes: 4,
    submissions: 2,
    conditioning: 5,
    mindset: 3,
  };
  let assessments = saveAssessment(emptyAssessments(), { date: '2026-10-01', note: 'old', scores: allScores(1) }, 1);
  assessments = saveAssessment(assessments, { date: '2026-10-20', note: 'new', scores: mine }, 2);
  writeAssessments(localStorage, assessments);
  const theirs = {
    guard: 2,
    passing: 4,
    takedowns: 3,
    escapes: 1,
    submissions: 5,
    conditioning: 5,
    mindset: 4,
  } as const;
  saveScouting(
    localStorage,
    addScoutingCard(
      [],
      {
        name: 'Sam',
        gym: 'Atos',
        belt: 'Blue',
        weightClass: 'Middle',
        group: 'weight',
        style: 'pressure',
        notes: 'long arms',
        ratings: theirs,
        strengths: '',
        weaknesses: '',
      },
      30,
    ),
  );

  const mounted = mount(<ScoutingPage />, '/student/scouting?student=1');
  const { host } = mounted;
  const lines = () => [...host.querySelectorAll('.scout-matchup li')].map((item) => item.textContent?.trim());
  assert.deepEqual(lines(), [
    'Favored: Guard, Escapes',
    'Even: Takedowns, Conditioning',
    'At a disadvantage: Passing, Submissions, Mindset',
  ]);
  const overlay = labeled(host, 'Me versus Sam');
  assert.equal(overlay.querySelectorAll('polygon.assess-chart__shape').length, 2);
  assert.equal(overlay.querySelectorAll('polygon.assess-chart__shape--opponent').length, 1);
  assert.match(overlay.textContent ?? '', /Me/);
  assert.match(overlay.textContent ?? '', /Sam/);
  assert.equal(
    [...host.querySelectorAll('a')].some((link) => link.textContent?.includes('Do your self-assessment')),
    false,
  );
  for (const area of ['Guard', 'Passing', 'Takedowns', 'Escapes', 'Submissions', 'Conditioning', 'Mindset']) {
    for (const score of [1, 2, 3, 4, 5]) labeled(host, `Sam ${area} ${score}`);
  }
  labeled(host, 'Strengths for Sam');
  labeled(host, 'Weaknesses for Sam');
  control(host, 'button', 'Save notes for Sam');

  act(() => {
    labeled(host, 'Sam Guard 5').click();
  });
  assert.equal(loadScouting(localStorage)[0].ratings.guard, 5);
  assert.deepEqual(lines(), [
    'Favored: Escapes',
    'Even: Guard, Takedowns, Conditioning',
    'At a disadvantage: Passing, Submissions, Mindset',
  ]);

  setControl(labeled(host, 'Strengths for Sam') as HTMLTextAreaElement, 'frames');
  setControl(labeled(host, 'Weaknesses for Sam') as HTMLTextAreaElement, 'open guard');
  act(() => {
    control(host, 'button', 'Save notes for Sam').click();
  });
  assert.equal(loadScouting(localStorage)[0].strengths, 'frames');
  assert.equal(loadScouting(localStorage)[0].weaknesses, 'open guard');
  assert.equal(loadScouting(localStorage)[0].ratings.guard, 5);

  act(() => {
    control(host, 'button', 'Edit Sam').click();
  });
  setControl(labeled(host, 'Opponent weight class') as HTMLInputElement, 'Heavy');
  act(() => {
    control(host, 'button', 'Save opponent').click();
  });
  const kept = loadScouting(localStorage)[0];
  assert.equal(kept.weightClass, 'Heavy');
  assert.equal(kept.ratings.guard, 5);
  assert.equal(kept.ratings.passing, 4);
  assert.equal(kept.strengths, 'frames');
  unmount(mounted);

  localStorage.clear();
  localStorage.setItem(
    SCOUTING_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      cards: [{ id: 'scout.old', name: 'Riley', gym: 'Checkmat', belt: 'Purple', weightClass: 'Light', group: 'open', style: 'guard', notes: 'lefty' }],
    }),
  );
  const legacy = mount(<ScoutingPage />, '/student/scouting?student=1');
  assert.equal(labeled(legacy.host, 'Riley Guard 1').getAttribute('aria-pressed'), 'false');
  assert.equal(
    control(legacy.host, 'a', 'Do your self-assessment').getAttribute('href'),
    '/student/competitor?student=1#self-assessment',
  );
  assert.match(legacy.host.textContent ?? '', /Rate this opponent to see their shape/);
  assert.equal(legacy.host.querySelectorAll('polygon.assess-chart__shape').length, 0);
  unmount(legacy);
});

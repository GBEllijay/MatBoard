/**
 * Self-assessment page. The form left Competitor. Every control still works.
 *
 * Self-assessment controls:
 * Back. Hold for Home. Home.
 * Heading Self-assessment. Lead sentence.
 * Sentence: today's ratings start from the last check-in, all eight areas
 *   including Sweeps. Anything that check-in lacks starts from Fundamentals.
 *   Mindset is rated here. A saved day stays as saved.
 * Latest average when a check-in exists.
 * Radar chart. Trend chart.
 * Mindset hint when Fundamentals filled the other areas and Mindset is empty.
 * Self-assessment date. Changing the date loads that day's note and ratings.
 *   Today with no saved check-in reloads the last check-in, then Fundamentals.
 *   Another empty date stays blank.
 * Evaluation mode: Generic, Technique-based.
 * Generic rates Guard/Control, Passing, Sweeps, Takedowns, Escapes/Defense,
 * Submissions, Conditioning, and Mindset. One rating each. No sub-item taps.
 * Conditioning names stamina, power, and flexibility as context.
 * Technique-based rates each move and the Mindset goals.
 * Each generic area: rating 1–5, pressed state, and Open: {benchmark} benchmark
 * only when the belt the student wears has that checkpoint.
 * A white belt links Guard, Passes, and Escapes on white. It does not link
 * Takedowns or Submissions on blue. Conditioning and Mindset have no checkpoint.
 * A blue belt links Half guard, Takedowns, and Submissions on blue.
 * Self-assessment note.
 * Save self-assessment. Update self-assessment. Alert when a rating is missing.
 * History. No check-ins yet. Self-assessment history.
 * Remove check-in {date}. Confirm remove check-in {date}. Keep check-in.
 * Division and Weight class stay on the Competitor tournament form.
 *
 * Competitor controls that stay on Competitor, covered in competitorArena.test:
 * Back, Home, Belt rank, Open: My rank, Jiu-Jitsu Journal, Today's page,
 * Journal cards, Open: self-assessment, Search competition, Tournament name,
 * date, location, Division, Weight class, suggestions, deadline, link,
 * Considering, Entered, Pounds, Kilograms, Target division weight,
 * Add tournament, Save tournament, Cancel tournament edit, Earlier tournaments,
 * goals, Edit, Remove, Confirm remove, Keep tournament, A/B/C games.
 *
 * Old /student/competitor#self-assessment and #assess-{area} redirect here.
 * Back uses from: progress, compete, competitor, scouting, fundamentals.
 * With no from, Back returns to Rank & Progress.
 * /student/print/assessment still prints. It is not this page.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { radarPoints, selfAssessmentShapeLabel } from '../../lib/radarChart.ts';
import { d8Catalog } from '../../indexCards/catalog.ts';
import { resetIndexCardStoreForTests } from '../../indexCards/store.ts';
import { INDEX_CARDS_STORAGE_KEY, emptyIndexCards, withRating } from '../../lib/indexCards.ts';
import { ASSESSMENT_STORAGE_KEY, MINDSET_GOALS, type AssessmentScores } from '../../lib/studentAssessment.ts';
import { selfAssessmentLines } from '../../lib/studentReport.ts';
import { clearStudentDemoOverlay, installStudentMockGuard, resetStudentMockGuardForTests } from '../../lib/studentDemo.ts';
import { STUDENT_BACKUP_STAMP_KEY } from '../../lib/studentBackupStamp.ts';
import { blankStudentReport, saveStudentReport, setFundamentalLevel, todayIso } from '../../lib/studentEdition.ts';
import { withStarterRubric } from '../../lib/studentTools.ts';
import { CompetitorPage } from './CompetitorPage.tsx';
import { PrintReportPage } from './PrintReportPage.tsx';
import { CardRadar } from './StudentCardLayout.tsx';
import { SelfAssessmentPage } from './SelfAssessmentPage.tsx';
import { withLegacySavedRubric } from '../../lib/testFixtures/legacySavedRubric.ts';

const dom = new Window({ url: 'http://localhost/student/self-assessment' });
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

function mount(node: ReactNode, initialEntry = '/student/self-assessment'): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[initialEntry]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

/** Reads the spider behind the Radar fallback, then puts the D8 back. */
function radarShapePoints(host: HTMLElement): string | null | undefined {
  const shape = host.querySelector('[data-testid="assess-shape"]') as HTMLElement;
  act(() => control(shape, 'button', 'Radar').click());
  const points = shape.querySelector('polygon.assess-chart__shape')?.getAttribute('points');
  act(() => control(shape, 'button', 'Diamond').click());
  assert.equal(shape.getAttribute('data-shape'), 'diamond');
  return points;
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

function rateAll(host: ParentNode, score: number) {
  for (const area of ['Guard/Control', 'Passing', 'Sweeps', 'Takedowns', 'Escapes/Defense', 'Submissions', 'Conditioning', 'Mindset']) {
    act(() => {
      labeled(host, `${area} ${score}`).click();
    });
  }
}

/** Writes check-ins exactly as an older phone stored them, without going through today's save rules. */
function storeRaw(entries: readonly Record<string, unknown>[]) {
  localStorage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify({ entries }));
}

function areaLegends(): string[] {
  return FORM.map(([, label]) => label);
}

const FORM = [
  ['guard', 'Guard/Control'],
  ['passing', 'Passing'],
  ['sweeps', 'Sweeps'],
  ['takedowns', 'Takedowns'],
  ['escapes', 'Escapes/Defense'],
  ['submissions', 'Submissions'],
  ['conditioning', 'Conditioning'],
  ['mindset', 'Mindset'],
] as const;

test('the self-assessment page keeps every control and Back returns to Rank & Progress', () => {
  localStorage.clear();
  const mounted = mount(<SelfAssessmentPage />, '/student/self-assessment?student=1');
  const { host } = mounted;
  const main = host.querySelector('main');
  assert.ok(main?.classList.contains('student--arena'));
  assert.ok(main?.classList.contains('student--assess'));
  assert.equal(main?.classList.contains('student--rank'), false);
  assert.equal(main?.classList.contains('student--belt'), false);
  assert.equal(labeled(host, 'Back. Hold for Home.').getAttribute('href'), '/student/progress?student=1');
  assert.equal(labeled(host, 'Home').getAttribute('href'), '/products?student=1');
  assert.equal(host.querySelector('h1')?.textContent, 'Self-assessment');
  assert.match(host.textContent ?? '', /Rate the work in front of you/);
  assert.match(host.textContent ?? '', /No check-ins yet/);
  labeled(host, 'Self-assessment date');
  labeled(host, 'Self-assessment note');
  labeled(host, 'Self-assessment history');
  assert.equal(control(host, 'button', 'Save self-assessment').classList.contains('ink-btn--save'), true);
  assert.equal(control(host, 'button', 'Generic').getAttribute('aria-pressed'), 'true');
  assert.equal(control(host, 'button', 'Technique-based').getAttribute('aria-pressed'), 'false');
  assert.match(host.textContent ?? '', /One overall rating for each area/);
  assert.match(host.textContent ?? '', /Stamina, power, and flexibility/);
  assert.equal(host.querySelector('[aria-label="Mindset goals"]'), null);
  assert.equal(host.querySelector('[aria-label="Techniques"]'), null);
  assert.deepEqual(
    [...host.querySelectorAll('.assess-area legend')].map((node) => node.textContent),
    areaLegends(),
  );
  for (const [id, area] of FORM) {
    labeled(host, `${area} rating`);
    for (const score of [1, 2, 3, 4, 5]) {
      const tap = labeled(host, `${area} ${score}`);
      assert.equal(tap.getAttribute('aria-pressed'), 'false');
    }
    assert.equal(host.querySelector(`#assess-${id}`)?.id, `assess-${id}`);
  }
  const shape = host.querySelector('[data-testid="assess-shape"]');
  assert.equal(shape?.getAttribute('data-shape'), 'diamond', 'Shape opens on the D8, like the Profile card');
  assert.equal(shape?.getAttribute('aria-label'), selfAssessmentShapeLabel(null));
  assert.ok(shape?.querySelector('[data-testid="sheet-diamond"]'), 'the Profile D8');
  assert.equal(host.querySelectorAll('polygon.assess-chart__shape').length, 0);
  assert.ok(host.querySelector('[aria-label^="Self-assessment trend"]'));
  // A new file has no practical benchmarks, so no area links one.
  assert.equal(host.querySelectorAll('a[href*="/student/rubric"]').length, 0);
  assert.equal(host.textContent?.includes('Open: Conditioning benchmark'), false);
  assert.equal(host.querySelector('[aria-label="Division"]'), null);
  assert.equal(host.querySelector('[aria-label="Weight class"]'), null);
  assert.equal(host.textContent?.includes('Patrick Hand'), false);
  unmount(mounted);
});

test('Back returns to the page that opened self-assessment', () => {
  localStorage.clear();
  const cases: [string, string][] = [
    ['/student/self-assessment?from=progress&student=1', '/student/progress?student=1'],
    ['/student/self-assessment?from=compete&student=1', '/student/compete?student=1'],
    ['/student/self-assessment?from=competitor', '/student/competitor'],
    ['/student/self-assessment?from=scouting&student=1', '/student/scouting?student=1'],
    ['/student/self-assessment?from=fundamentals&student=1', '/student/fundamentals?student=1'],
    ['/student/self-assessment?from=not-a-page&student=1', '/student/progress?student=1'],
  ];
  for (const [entry, back] of cases) {
    const mounted = mount(<SelfAssessmentPage />, entry);
    assert.equal(labeled(mounted.host, 'Back. Hold for Home.').getAttribute('href'), back, entry);
    unmount(mounted);
  }
});

test('a check-in saves, updates, and a white belt links only that belt', () => {
  localStorage.clear();
  saveStudentReport(localStorage, withStarterRubric(withLegacySavedRubric(blankStudentReport())));
  const mounted = mount(<SelfAssessmentPage />);
  const { host } = mounted;
  assert.equal(
    host.querySelector('a[href="/student/rubric#checkpoint.white.s1-guard-attack"]')?.textContent,
    'Open: Saved white benchmark s1-guard-attack benchmark',
  );
  assert.equal(
    host.querySelector('a[href="/student/rubric#checkpoint.white.s1-pass"]')?.textContent,
    'Open: Saved white benchmark s1-pass benchmark',
  );
  assert.equal(
    host.querySelector('a[href="/student/rubric#checkpoint.white.s1-escapes"]')?.textContent,
    'Open: Saved white benchmark s1-escapes benchmark',
  );
  assert.ok(host.querySelector('a[href="/student/rubric#checkpoint.white.s4-back-choke"]'));
  assert.equal(host.textContent?.includes('Open: Conditioning benchmark'), false);
  assert.equal(
    [...host.querySelectorAll('a')].some((link) => link.getAttribute('href')?.includes('checkpoint.blue')),
    false,
  );

  act(() => {
    control(host, 'button', 'Save self-assessment').click();
  });
  assert.match(labeled(host, 'Self-assessment').textContent ?? '', /Rate Guard\/Control from 1 to 5/);
  assert.equal(localStorage.getItem('matboard.studentEdition.assessment.v1'), null);

  rateAll(host, 4);
  assert.equal(labeled(host, 'Guard/Control 4').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(host, 'Guard/Control 3').getAttribute('aria-pressed'), 'false');
  assert.equal(labeled(host, 'Sweeps 4').getAttribute('aria-pressed'), 'true');
  setControl(labeled(host, 'Self-assessment note') as HTMLTextAreaElement, 'calm rounds');
  const filled: AssessmentScores = {
    guard: 4,
    passing: 4,
    sweeps: 4,
    takedowns: 4,
    escapes: 4,
    submissions: 4,
    conditioning: 4,
    mindset: 4,
  };
  assert.equal(host.querySelector('[data-testid="assess-shape"]')?.getAttribute('aria-label'), selfAssessmentShapeLabel(filled));
  assert.equal(radarShapePoints(host), radarPoints([4, 4, 4, 4, 4, 4, 4, 4]));
  act(() => {
    control(host, 'button', 'Save self-assessment').click();
  });
  const day = (labeled(host, 'Self-assessment date') as HTMLInputElement).value;
  assert.equal(day, todayIso());
  assert.equal(control(host, 'button', 'Update self-assessment').textContent, 'Update self-assessment');
  assert.match(host.textContent ?? '', /calm rounds/);
  assert.match(host.textContent ?? '', new RegExp(day));
  assert.equal(localStorage.getItem('matboard.studentEdition.assessment.v1')?.includes('calm rounds'), true);
  unmount(mounted);

  const again = mount(<SelfAssessmentPage />);
  assert.equal((labeled(again.host, 'Self-assessment note') as HTMLTextAreaElement).value, 'calm rounds');
  assert.equal(labeled(again.host, 'Guard/Control 4').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(again.host, 'Sweeps 1').getAttribute('aria-pressed'), 'false');
  setControl(labeled(again.host, 'Self-assessment date') as HTMLInputElement, '2020-01-02');
  assert.equal((labeled(again.host, 'Self-assessment note') as HTMLTextAreaElement).value, '');
  assert.equal(labeled(again.host, 'Guard/Control 4').getAttribute('aria-pressed'), 'false');
  setControl(labeled(again.host, 'Self-assessment date') as HTMLInputElement, day);
  assert.equal((labeled(again.host, 'Self-assessment note') as HTMLTextAreaElement).value, 'calm rounds');

  act(() => {
    control(again.host, 'button', `Remove check-in ${day}`).click();
  });
  assert.match(labeled(again.host, `Remove check-in ${day}`).textContent ?? '', /Confirm remove check-in/);
  act(() => {
    control(again.host, 'button', 'Keep check-in').click();
  });
  assert.equal(localStorage.getItem('matboard.studentEdition.assessment.v1')?.includes('calm rounds'), true);
  act(() => {
    control(again.host, 'button', `Remove check-in ${day}`).click();
  });
  act(() => {
    control(again.host, 'button', `Confirm remove check-in ${day}`).click();
  });
  assert.equal(localStorage.getItem('matboard.studentEdition.assessment.v1')?.includes('calm rounds'), false);
  assert.equal(control(again.host, 'button', 'Save self-assessment').textContent, 'Save self-assessment');
  assert.match(again.host.textContent ?? '', /No check-ins yet/);
  unmount(again);
});

test('a blue belt links the benchmarks on blue', () => {
  localStorage.clear();
  const report = withStarterRubric(withLegacySavedRubric(blankStudentReport()));
  report.profile.belt = 'blue';
  saveStudentReport(localStorage, report);
  const mounted = mount(<SelfAssessmentPage />);
  const { host } = mounted;
  assert.equal(
    host.querySelector('a[href="/student/rubric#checkpoint.blue.s2-your-guard"]')?.textContent,
    'Open: Saved blue benchmark s2-your-guard benchmark',
  );
  assert.equal(
    host.querySelector('a[href="/student/rubric#checkpoint.blue.s4-takedowns"]')?.textContent,
    'Open: Saved blue benchmark s4-takedowns benchmark',
  );
  assert.equal(
    host.querySelector('a[href="/student/rubric#checkpoint.blue.s1-escapes"]')?.textContent,
    'Open: Saved blue benchmark s1-escapes benchmark',
  );
  assert.equal(
    [...host.querySelectorAll('a')].some((link) => link.getAttribute('href')?.includes('checkpoint.white')),
    false,
  );
  unmount(mounted);
});

test('old competitor self-assessment addresses open this page and remember where they came from', () => {
  localStorage.clear();
  const routes = (
    <Routes>
      <Route path="/student/competitor" element={<CompetitorPage />} />
      <Route path="/student/self-assessment" element={<SelfAssessmentPage />} />
    </Routes>
  );
  const fromProgress = mount(routes, '/student/competitor?from=progress&student=1#self-assessment');
  assert.equal(fromProgress.host.querySelector('h1')?.textContent, 'Self-assessment');
  assert.equal(labeled(fromProgress.host, 'Back. Hold for Home.').getAttribute('href'), '/student/progress?student=1');
  assert.equal(fromProgress.host.querySelector('#self-assessment'), fromProgress.host.querySelector('section.assess'));
  unmount(fromProgress);

  const area = mount(routes, '/student/competitor#assess-guard');
  assert.equal(area.host.querySelector('h1')?.textContent, 'Self-assessment');
  assert.equal(labeled(area.host, 'Back. Hold for Home.').getAttribute('href'), '/student/competitor');
  assert.ok(area.host.querySelector('#assess-guard'));
  unmount(area);

  const stay = mount(routes, '/student/competitor?student=1');
  assert.equal(stay.host.querySelector('h1')?.textContent, 'Competitor');
  assert.equal(control(stay.host, 'a', 'Open: self-assessment').getAttribute('href'), '/student/self-assessment?from=competitor&student=1');
  labeled(stay.host, 'Division');
  labeled(stay.host, 'Weight class');
  unmount(stay);
});

test('a planted sim self-assessment does not show on the page, including a 10-26 entry', () => {
  resetStudentMockGuardForTests();
  localStorage.clear();
  const planted = JSON.stringify({
    entries: [
      {
        id: 'sim-1024',
        date: '2026-10-24',
        note: 'Mock self-assessment before Pan Pacific.',
        scores: { guard: 5, passing: 4, takedowns: 4, escapes: 5, submissions: 4, conditioning: 4, mindset: 5 },
      },
      {
        id: 'sim-1025',
        date: '2026-10-25',
        note: 'Drill the pass. Stop reaching.',
        scores: { guard: 3, passing: 3, takedowns: 3, escapes: 4, submissions: 3, conditioning: 3, mindset: 4 },
      },
      {
        id: 'sim-1026',
        date: '2026-10-26',
        note: 'Drill the pass. Stop reaching.',
        scores: { guard: 3, passing: 3, takedowns: 3, escapes: 4, submissions: 3, conditioning: 3, mindset: 4 },
      },
    ],
  });
  localStorage.setItem(ASSESSMENT_STORAGE_KEY, planted);
  localStorage.setItem(STUDENT_BACKUP_STAMP_KEY, '2026-10-25T12:00:00.000Z');
  installStudentMockGuard(localStorage, () => '?student=1');
  try {
    const mounted = mount(<SelfAssessmentPage />, '/student/self-assessment?student=1');
    assert.match(mounted.host.textContent ?? '', /No check-ins yet/);
    assert.equal(mounted.host.textContent?.includes('Mock self-assessment'), false);
    assert.equal(mounted.host.textContent?.includes('2026-10-24'), false);
    assert.equal(control(mounted.host, 'button', 'Save self-assessment').textContent, 'Save self-assessment');
    localStorage.setItem(ASSESSMENT_STORAGE_KEY, planted);
    act(() => {
      /* a dropped write does not add a row */
    });
    assert.match(mounted.host.textContent ?? '', /No check-ins yet/);
    assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), null);
    assert.equal(localStorage.getItem(STUDENT_BACKUP_STAMP_KEY), null);
    unmount(mounted);
  } finally {
    resetStudentMockGuardForTests();
    localStorage.clear();
  }
});

test('the print route still shows the self-assessment report', () => {
  localStorage.clear();
  const mounted = mount(<PrintReportPage kind="assessment" />, '/student/print/assessment?student=1');
  const { host } = mounted;
  assert.equal(host.querySelector('h1')?.textContent, 'Self-assessment');
  assert.match(host.textContent ?? '', /No self-assessment saved on this phone/);
  control(host, 'button', 'Print');
  control(host, 'button', 'Download PDF');
  assert.equal(labeled(host, 'Back. Hold for Home.').getAttribute('href'), '/student/backup?student=1');
  unmount(mounted);
});

test('with no earlier check-in, fundamentals levels show on the chart without retyping, and a saved day is kept', () => {
  localStorage.clear();
  let report = withStarterRubric(withLegacySavedRubric(blankStudentReport()));
  const mark = (catalogItemId: string, categoryId: string, name: string, level: 0 | 1 | 2 | 3 | 4 | 5, now: number) => {
    report = setFundamentalLevel(report, { catalogItemId, categoryId, name }, level, now);
  };
  mark('pos.closed-guard', 'positions', 'Closed guard', 4, 10);
  mark('sweep.scissor', 'sweeps', 'Scissor sweep', 4, 11);
  mark('sweep.hip-bump', 'sweeps', 'Hip bump sweep', 0, 12);
  mark('pass.knee-slice', 'passes', 'Knee slice pass', 2, 13);
  mark('td.double-leg', 'takedowns', 'Double leg', 5, 14);
  mark('escape.mount', 'escapes', 'Mount escape', 3, 15);
  mark('sub.armbar-guard', 'submissions', 'Armbar from guard', 1, 16);
  mark('move.shrimp', 'movement', 'Shrimp', 4, 17);
  saveStudentReport(localStorage, report);

  const mounted = mount(<SelfAssessmentPage />);
  const { host } = mounted;
  assert.match(host.textContent ?? '', /Today's ratings start from your last check-in, all eight areas including Sweeps/);
  assert.match(host.textContent ?? '', /Anything that check-in lacks starts\s+from Fundamentals/);
  assert.equal(labeled(host, 'Guard/Control 4').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(host, 'Passing 2').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(host, 'Sweeps 4').getAttribute('aria-pressed'), 'true', 'the Sweeps list fills the Sweeps face');
  assert.equal(labeled(host, 'Takedowns 5').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(host, 'Escapes/Defense 3').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(host, 'Submissions 1').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(host, 'Conditioning 4').getAttribute('aria-pressed'), 'true');
  for (const score of [1, 2, 3, 4, 5]) {
    assert.equal(labeled(host, `Mindset ${score}`).getAttribute('aria-pressed'), 'false');
  }
  assert.equal(
    host.querySelector('[data-testid="assess-shape"]')?.getAttribute('aria-label'),
    selfAssessmentShapeLabel({ guard: 4, passing: 2, sweeps: 4, takedowns: 5, escapes: 3, submissions: 1, conditioning: 4 }),
  );
  assert.equal(radarShapePoints(host), radarPoints([4, 2, 4, 5, 3, 1, 4, 0]));
  assert.match(host.textContent ?? '', /Mindset is not on the Fundamentals list/);
  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), null, 'opening the page writes nothing');

  act(() => {
    control(host, 'button', 'Save self-assessment').click();
  });
  assert.match(labeled(host, 'Self-assessment').textContent ?? '', /Rate Mindset from 1 to 5/);
  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), null);

  act(() => {
    labeled(host, 'Mindset 2').click();
  });
  setControl(labeled(host, 'Self-assessment note') as HTMLTextAreaElement, 'from fundamentals');
  act(() => {
    control(host, 'button', 'Save self-assessment').click();
  });
  const savedText = localStorage.getItem(ASSESSMENT_STORAGE_KEY) ?? '';
  assert.match(savedText, /from fundamentals/);
  assert.match(savedText, /"sweeps":4/);
  assert.equal(labeled(host, 'Guard/Control 4').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(host, 'Mindset 2').getAttribute('aria-pressed'), 'true');
  unmount(mounted);

  report = setFundamentalLevel(report, { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', name: 'Scissor sweep' }, 1, 30);
  saveStudentReport(localStorage, report);
  const again = mount(<SelfAssessmentPage />);
  assert.equal(labeled(again.host, 'Sweeps 4').getAttribute('aria-pressed'), 'true', 'a saved day beats the tracker');
  assert.match(again.host.textContent ?? '', /from fundamentals/);
  setControl(labeled(again.host, 'Self-assessment date') as HTMLInputElement, '2020-01-02');
  assert.equal(labeled(again.host, 'Guard/Control 4').getAttribute('aria-pressed'), 'false');
  assert.equal(labeled(again.host, 'Sweeps 4').getAttribute('aria-pressed'), 'false');
  assert.equal((labeled(again.host, 'Self-assessment note') as HTMLTextAreaElement).value, '');
  setControl(labeled(again.host, 'Self-assessment date') as HTMLInputElement, todayIso());
  assert.equal(labeled(again.host, 'Sweeps 4').getAttribute('aria-pressed'), 'true');
  assert.equal((labeled(again.host, 'Self-assessment note') as HTMLTextAreaElement).value, 'from fundamentals');

  const day = todayIso();
  act(() => {
    control(again.host, 'button', `Remove check-in ${day}`).click();
  });
  act(() => {
    control(again.host, 'button', `Confirm remove check-in ${day}`).click();
  });
  assert.equal(labeled(again.host, 'Sweeps 1').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(again.host, 'Guard/Control 4').getAttribute('aria-pressed'), 'true');
  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY)?.includes('from fundamentals'), false);
  unmount(again);
});

test('a new day carries all eight faces, Sweeps included, from the last check-in', () => {
  localStorage.clear();
  let report = withStarterRubric(withLegacySavedRubric(blankStudentReport()));
  report = setFundamentalLevel(report, { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', name: 'Scissor sweep' }, 5, 10);
  report = setFundamentalLevel(report, { catalogItemId: 'td.double-leg', categoryId: 'takedowns', name: 'Double leg' }, 5, 11);
  saveStudentReport(localStorage, report);
  storeRaw([
    {
      id: 'assess.last',
      date: '2020-03-02',
      note: 'last time',
      scores: { guard: 3, passing: 4, sweeps: 2, takedowns: 1, escapes: 3, submissions: 4, conditioning: 2, mindset: 5 },
    },
    {
      id: 'assess.before',
      date: '2020-03-01',
      note: 'before that',
      scores: { guard: 1, passing: 1, sweeps: 1, takedowns: 1, escapes: 1, submissions: 1, conditioning: 1, mindset: 1 },
    },
  ]);
  const before = localStorage.getItem(ASSESSMENT_STORAGE_KEY);
  const mounted = mount(<SelfAssessmentPage />);
  const { host } = mounted;
  const pressed = FORM.map(([, label]) =>
    [1, 2, 3, 4, 5].find((score) => labeled(host, `${label} ${score}`).getAttribute('aria-pressed') === 'true') ?? null,
  );
  assert.deepEqual(pressed, [3, 4, 2, 1, 3, 4, 2, 5], 'every face, Sweeps included, comes from the last check-in, not the tracker');
  assert.equal((labeled(host, 'Self-assessment note') as HTMLTextAreaElement).value, '', 'the note is not carried');
  assert.equal(control(host, 'button', 'Save self-assessment').textContent, 'Save self-assessment');
  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), before, 'opening the page writes nothing');

  act(() => {
    control(host, 'button', 'Save self-assessment').click();
  });
  const saved = JSON.parse(localStorage.getItem(ASSESSMENT_STORAGE_KEY) ?? '{}') as { entries: { date: string; scores: AssessmentScores }[] };
  const todayEntry = saved.entries.find((entry) => entry.date === todayIso());
  assert.equal(todayEntry?.scores.sweeps, 2, 'Sweeps saves with the rest, no retyping');
  assert.equal(todayEntry?.scores.passing, 4);
  assert.equal(saved.entries.find((entry) => entry.date === '2020-03-02')?.scores.sweeps, 2, 'the earlier day is unchanged');
  unmount(mounted);
});

test('a new day after an old seven-value check-in leaves Sweeps blank and asks for it', () => {
  localStorage.clear();
  saveStudentReport(localStorage, withStarterRubric(withLegacySavedRubric(blankStudentReport())));
  storeRaw([
    {
      id: 'assess.seven',
      date: '2020-03-02',
      note: 'seven',
      scores: { guard: 3, passing: 4, takedowns: 1, escapes: 3, submissions: 4, conditioning: 2, mindset: 5 },
    },
  ]);
  const mounted = mount(<SelfAssessmentPage />);
  const { host } = mounted;
  assert.equal(labeled(host, 'Passing 4').getAttribute('aria-pressed'), 'true');
  for (const score of [1, 2, 3, 4, 5]) {
    assert.equal(labeled(host, `Sweeps ${score}`).getAttribute('aria-pressed'), 'false', 'Sweeps is not copied from Passing');
  }
  assert.match(host.textContent ?? '', /Sweeps not rated/, 'the older day lists Sweeps as not rated');
  act(() => {
    control(host, 'button', 'Save self-assessment').click();
  });
  assert.match(labeled(host, 'Self-assessment').textContent ?? '', /Rate Sweeps from 1 to 5/);
  assert.equal((localStorage.getItem(ASSESSMENT_STORAGE_KEY) ?? '').includes(todayIso()), false);
  act(() => {
    labeled(host, 'Sweeps 3').click();
  });
  act(() => {
    control(host, 'button', 'Save self-assessment').click();
  });
  const saved = JSON.parse(localStorage.getItem(ASSESSMENT_STORAGE_KEY) ?? '{}') as { entries: { date: string; scores: AssessmentScores }[] };
  assert.equal(saved.entries.find((entry) => entry.date === todayIso())?.scores.sweeps, 3);
  assert.equal(Object.hasOwn(saved.entries.find((entry) => entry.date === '2020-03-02')?.scores ?? {}, 'sweeps'), false);
  unmount(mounted);
});

test('an old seven-value check-in keeps Sweeps empty until that rating is saved', () => {
  localStorage.clear();
  const today = todayIso();
  const seven = {
    guard: 5,
    passing: 3,
    takedowns: 4,
    escapes: 2,
    submissions: 4,
    conditioning: 2,
    mindset: 3,
  };
  storeRaw([{ id: 'assess.seven', date: today, note: 'seven', scores: seven }]);
  assert.equal((localStorage.getItem(ASSESSMENT_STORAGE_KEY) ?? '').includes('sweeps'), false);

  const mounted = mount(<SelfAssessmentPage />);
  assert.deepEqual(
    [...mounted.host.querySelectorAll('.assess-area legend')].map((node) => node.textContent),
    areaLegends(),
  );
  assert.equal(labeled(mounted.host, 'Passing 3').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(mounted.host, 'Guard/Control 5').getAttribute('aria-pressed'), 'true');
  for (const score of [1, 2, 3, 4, 5]) {
    assert.equal(labeled(mounted.host, `Sweeps ${score}`).getAttribute('aria-pressed'), 'false');
  }
  act(() => {
    control(mounted.host, 'button', 'Update self-assessment').click();
  });
  const untouched = localStorage.getItem(ASSESSMENT_STORAGE_KEY) ?? '';
  assert.equal(untouched.includes('sweeps'), false);
  assert.equal(untouched.includes('mindsetGoals'), false);
  assert.equal(untouched.includes('conditioningItems'), false);
  assert.match(untouched, /"passing":3/);
  assert.match(untouched, /"guard":5/);

  act(() => {
    labeled(mounted.host, 'Sweeps 1').click();
  });
  assert.equal(labeled(mounted.host, 'Passing 3').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(mounted.host, 'Sweeps 1').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(mounted.host, 'Sweeps 3').getAttribute('aria-pressed'), 'false');
  act(() => {
    control(mounted.host, 'button', 'Update self-assessment').click();
  });
  const saved = JSON.parse(localStorage.getItem(ASSESSMENT_STORAGE_KEY) ?? '{}') as {
    entries: { note: string; scores: { passing: number; sweeps?: number; guard: number; escapes: number } }[];
  };
  assert.equal(saved.entries[0].note, 'seven');
  assert.equal(saved.entries[0].scores.sweeps, 1);
  assert.equal(saved.entries[0].scores.passing, 3);
  assert.equal(saved.entries[0].scores.guard, 5);
  assert.equal(saved.entries[0].scores.escapes, 2);
  unmount(mounted);

  const again = mount(<SelfAssessmentPage />);
  assert.equal(labeled(again.host, 'Sweeps 1').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(again.host, 'Passing 3').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(again.host, 'Escapes/Defense 2').getAttribute('aria-pressed'), 'true');
  unmount(again);

  const card = mount(<CardRadar to={(path) => path} />);
  act(() => {
    control(card.host, 'button', 'Radar').click();
  });
  assert.deepEqual(
    [...card.host.querySelectorAll('.assess-legend li')].map((node) => [...node.querySelectorAll('span')].map((span) => span.textContent).join(' ')),
    ['Guard/Control 5', 'Passing 3', 'Sweeps 1', 'Takedowns 4', 'Escapes/Defense 2', 'Submissions 4', 'Conditioning 2', 'Mindset 3'],
  );
  assert.equal(card.host.querySelector('polygon.oct-cage')?.getAttribute('points')?.trim().split(/\s+/).length, 8);
  assert.equal(card.host.querySelectorAll('polygon.oct-shape--filled').length, 1);
  assert.match(card.host.querySelector('svg')?.getAttribute('aria-label') ?? '', /Passing 3, Sweeps 1/);
  assert.doesNotMatch(card.host.querySelector('svg')?.getAttribute('aria-label') ?? '', /Sweeps 3|Sweeps not rated|Sweeps 0/);
  unmount(card);
});

function freshPhone() {
  localStorage.clear();
  clearStudentDemoOverlay();
  saveStudentReport(localStorage, blankStudentReport());
}

test('technique ratings and mindset goals stay off the generic check-in', () => {
  freshPhone();
  resetIndexCardStoreForTests();
  const seed = withRating(d8Catalog(), emptyIndexCards(), 'sweep.hip-bump', 4);
  localStorage.setItem(INDEX_CARDS_STORAGE_KEY, JSON.stringify(seed));
  const today = todayIso();
  const mounted = mount(<SelfAssessmentPage />);
  const { host } = mounted;
  assert.equal(host.querySelector('[aria-label="Mindset goals"]'), null);
  assert.equal(host.querySelector('[aria-label="Closed Guard rating"]'), null);
  assert.match(host.textContent ?? '', /Stamina, power, and flexibility/);
  rateAll(host, 3);
  act(() => {
    control(host, 'button', 'Save self-assessment').click();
  });
  const afterGeneric = localStorage.getItem(INDEX_CARDS_STORAGE_KEY) ?? '';
  assert.match(afterGeneric, /"sweep.hip-bump"/);
  assert.match(afterGeneric, /"rating":4/);
  assert.equal(afterGeneric.includes('pos.closed-guard'), false);
  const generic = JSON.parse(localStorage.getItem(ASSESSMENT_STORAGE_KEY) ?? '{}') as {
    entries: { date: string; scores: AssessmentScores; mindsetGoals?: Record<string, number> }[];
  };
  assert.equal(generic.entries.find((entry) => entry.date === today)?.scores.mindset, 3);
  assert.equal(generic.entries.find((entry) => entry.date === today)?.scores.guard, 3);
  assert.equal(generic.entries.find((entry) => entry.date === today)?.mindsetGoals, undefined);

  act(() => {
    control(host, 'button', 'Technique-based').click();
  });
  assert.equal(control(host, 'button', 'Technique-based').getAttribute('aria-pressed'), 'true');
  assert.equal(control(host, 'button', 'Update self-assessment').classList.contains('ink-btn--save'), true);
  assert.match(host.textContent ?? '', /Rate each technique/);
  assert.equal(host.querySelector('[aria-label="Guard/Control rating"]'), null);
  labeled(host, 'Mindset goals');
  labeled(host, 'Closed Guard rating');
  for (const goal of MINDSET_GOALS) labeled(host, `${goal.label} rating`);
  assert.equal(labeled(host, 'Hip bump sweep 4').getAttribute('aria-pressed'), 'true');
  act(() => {
    labeled(host, `${MINDSET_GOALS[0].label} 5`).click();
    labeled(host, `${MINDSET_GOALS[1].label} 2`).click();
    labeled(host, 'Closed Guard 2').click();
  });
  assert.equal(labeled(host, `${MINDSET_GOALS[0].label} 5`).getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(host, 'Closed Guard 2').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(host, 'Hip bump sweep 4').getAttribute('aria-pressed'), 'true');
  const cardsAfterTap = localStorage.getItem(INDEX_CARDS_STORAGE_KEY) ?? '';
  assert.match(cardsAfterTap, /"id":"pos.closed-guard"/);
  assert.match(cardsAfterTap, /"rating":2/);
  assert.match(cardsAfterTap, /"rating":4/);
  act(() => {
    control(host, 'button', 'Update self-assessment').click();
  });
  const saved = JSON.parse(localStorage.getItem(ASSESSMENT_STORAGE_KEY) ?? '{}') as {
    entries: { date: string; scores: AssessmentScores; mindsetGoals?: Record<string, number> }[];
  };
  const todayEntry = saved.entries.find((entry) => entry.date === today);
  assert.equal(todayEntry?.scores.mindset, 3);
  assert.equal(todayEntry?.scores.guard, 3);
  assert.equal(todayEntry?.scores.conditioning, 3);
  assert.equal(todayEntry?.mindsetGoals?.['calm-focused'], 5);
  assert.equal(todayEntry?.mindsetGoals?.['intentional-roll'], 2);
  assert.equal(todayEntry?.mindsetGoals?.['game-plan'], undefined);
  assert.match(host.textContent ?? '', /I've formed a routine and habit that keeps me calm and focused: 5/);
  act(() => {
    control(host, 'button', 'Generic').click();
  });
  assert.equal(host.querySelector('[aria-label="Mindset goals"]'), null);
  assert.equal(host.querySelector('[aria-label="Closed Guard rating"]'), null);
  assert.equal(labeled(host, 'Mindset 3').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(host, 'Guard/Control 3').getAttribute('aria-pressed'), 'true');
  assert.match(host.textContent ?? '', /Stamina, power, and flexibility/);
  const cardsAfterGenericReturn = localStorage.getItem(INDEX_CARDS_STORAGE_KEY) ?? '';
  assert.match(cardsAfterGenericReturn, /"id":"pos.closed-guard"/);
  assert.match(cardsAfterGenericReturn, /"rating":4/);
  unmount(mounted);
});

function d8FaceScore(host: HTMLElement, label: string): string {
  const shape = host.querySelector('[data-testid="assess-shape"]') as HTMLElement;
  act(() => (shape.querySelector('.sheet-diamond__expand') as HTMLButtonElement).click());
  const dialog = labeled(document.body, 'Assessment diamond');
  const row = [...dialog.querySelectorAll('.d8sf-face-scores li')].find((li) => li.querySelector('span')?.textContent === label);
  assert.ok(row, label);
  const score = row.querySelectorAll('span')[1]?.textContent ?? '';
  act(() => control(dialog, 'button', 'Close').click());
  return score;
}

test('the Shape D8 follows Generic face scores and Technique-based ratings live, and stores nothing new', () => {
  freshPhone();
  resetIndexCardStoreForTests();
  const mounted = mount(<SelfAssessmentPage />);
  const { host } = mounted;
  const shape = host.querySelector('[data-testid="assess-shape"]') as HTMLElement;
  assert.match(shape.textContent ?? '', /Your D8\. A line you have not rated stays at 3\./);
  assert.equal(d8FaceScore(host, 'Guard/Control'), '3.0 / 5');

  rateAll(host, 4);
  assert.match(shape.textContent ?? '', /takes your check-in score for that face, or 3/);
  assert.equal(d8FaceScore(host, 'Guard/Control'), '4.0 / 5', 'Generic face score shapes the face before saving');
  assert.equal(d8FaceScore(host, 'Sweeps'), '4.0 / 5');

  act(() => control(host, 'button', 'Technique-based').click());
  act(() => labeled(host, 'Closed Guard 1').click());
  // Six Guard/Control lines: the rated one is 1, the other five take the face score 4.
  assert.equal(d8FaceScore(host, 'Guard/Control'), '3.5 / 5', 'a technique rating moves the same D8');
  assert.equal(d8FaceScore(host, 'Sweeps'), '4.0 / 5');

  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), null, 'the D8 saves no check-in');
  const cards = JSON.parse(localStorage.getItem(INDEX_CARDS_STORAGE_KEY) ?? '{}') as { cards: { id: string; rating?: number }[] };
  assert.deepEqual(
    cards.cards.map((card) => [card.id, card.rating]),
    [['pos.closed-guard', 1]],
    'only the tapped technique is written; the baseline is display only',
  );
  unmount(mounted);
});

test('older sub-line scores show as one face and still export', () => {
  freshPhone();
  resetIndexCardStoreForTests();
  const indexBefore = JSON.stringify(withRating(d8Catalog(), emptyIndexCards(), 'sweep.scissor', 5));
  localStorage.setItem(INDEX_CARDS_STORAGE_KEY, indexBefore);
  const older = {
    guard: 2,
    passing: 2,
    takedowns: 2,
    escapes: 2,
    submissions: 2,
    conditioning: 1,
    mindset: 5,
  };
  storeRaw([
    {
      id: 'assess.older',
      date: '2024-05-01',
      note: 'kept from an older phone',
      scores: older,
      conditioningItems: { stamina: 5, power: 1, flexibility: 3 },
      mindsetGoals: { 'calm-focused': 5, 'intentional-roll': 2 },
    },
  ]);
  const mounted = mount(<SelfAssessmentPage />);
  const { host } = mounted;
  assert.match(host.textContent ?? '', /Stamina, power, and flexibility/);
  assert.equal(host.querySelector('[aria-label="Stamina during live rolls rating"]'), null);
  assert.equal(host.querySelector('[aria-label="Power rating"]'), null);
  assert.match(host.textContent ?? '', /kept from an older phone/);
  assert.match(host.textContent ?? '', /Stamina during live rolls: 5/);
  assert.match(host.textContent ?? '', /Power: 1/);
  assert.match(host.textContent ?? '', /Flexibility: 3/);
  assert.match(host.textContent ?? '', /I've formed a routine and habit that keeps me calm and focused: 5/);
  setControl(labeled(host, 'Self-assessment date') as HTMLInputElement, '2024-05-01');
  assert.equal(labeled(host, 'Conditioning 3').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(host, 'Conditioning 1').getAttribute('aria-pressed'), 'false');
  assert.equal(labeled(host, 'Mindset 4').getAttribute('aria-pressed'), 'true');
  assert.match(host.textContent ?? '', /Earlier conditioning detail averages to 3/);
  assert.match(host.textContent ?? '', /Earlier mindset detail averages to 4/);
  act(() => {
    control(host, 'button', 'Update self-assessment').click();
  });
  const kept = JSON.parse(localStorage.getItem(ASSESSMENT_STORAGE_KEY) ?? '{}') as {
    entries: {
      scores: AssessmentScores;
      conditioningItems?: Record<string, number>;
      mindsetGoals?: Record<string, number>;
      directFaces?: { conditioning?: boolean; mindset?: boolean };
    }[];
  };
  assert.equal(kept.entries[0].scores.conditioning, 1);
  assert.equal(kept.entries[0].scores.mindset, 5);
  assert.equal(kept.entries[0].conditioningItems?.stamina, 5);
  assert.equal(kept.entries[0].conditioningItems?.power, 1);
  assert.equal(kept.entries[0].conditioningItems?.flexibility, 3);
  assert.equal(kept.entries[0].mindsetGoals?.['calm-focused'], 5);
  assert.equal(kept.entries[0].mindsetGoals?.['intentional-roll'], 2);
  assert.equal(kept.entries[0].directFaces, undefined);
  assert.equal(localStorage.getItem(INDEX_CARDS_STORAGE_KEY), indexBefore);
  const lines = selfAssessmentLines(blankStudentReport(), { entries: kept.entries as never });
  assert.equal(lines.some((line) => line.includes('Conditioning: 1')), true);
  assert.equal(lines.some((line) => line.includes('Mindset: 5')), true);
  assert.equal(lines.some((line) => line.includes('Stamina during live rolls: 5')), true);
  assert.equal(lines.some((line) => line.includes('Power: 1')), true);
  assert.equal(lines.some((line) => line.includes('Flexibility: 3')), true);
  assert.equal(lines.some((line) => line.includes("I've formed a routine and habit that keeps me calm and focused: 5")), true);

  act(() => {
    labeled(host, 'Conditioning 5').click();
  });
  assert.equal(labeled(host, 'Conditioning 5').getAttribute('aria-pressed'), 'true');
  act(() => {
    control(host, 'button', 'Update self-assessment').click();
  });
  const rated = JSON.parse(localStorage.getItem(ASSESSMENT_STORAGE_KEY) ?? '{}') as {
    entries: {
      scores: AssessmentScores;
      conditioningItems?: Record<string, number>;
      directFaces?: { conditioning?: boolean };
    }[];
  };
  assert.equal(rated.entries[0].scores.conditioning, 5);
  assert.equal(rated.entries[0].scores.mindset, 5);
  assert.equal(rated.entries[0].directFaces?.conditioning, true);
  assert.equal(rated.entries[0].conditioningItems?.stamina, 5);
  assert.equal(rated.entries[0].conditioningItems?.flexibility, 3);
  assert.equal(localStorage.getItem(INDEX_CARDS_STORAGE_KEY), indexBefore);
  unmount(mounted);

  resetIndexCardStoreForTests();
  const again = mount(<SelfAssessmentPage />);
  setControl(labeled(again.host, 'Self-assessment date') as HTMLInputElement, '2024-05-01');
  assert.equal(labeled(again.host, 'Conditioning 5').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(again.host, 'Mindset 4').getAttribute('aria-pressed'), 'true');
  assert.equal(again.host.textContent?.includes('Earlier conditioning detail averages to 3'), false);
  assert.match(again.host.textContent ?? '', /Stamina during live rolls: 5/);
  unmount(again);
});

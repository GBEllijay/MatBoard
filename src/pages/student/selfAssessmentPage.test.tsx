/**
 * Self-assessment page. The form left Competitor. Every control still works.
 *
 * Self-assessment controls:
 * Back. Hold for Home. Home.
 * Heading Self-assessment. Lead sentence.
 * Latest average when a check-in exists.
 * Radar chart. Trend chart.
 * Self-assessment date. Changing the date loads that day's note and ratings.
 * Guard, Passing, Takedowns, Escapes, Submissions, Conditioning, Mindset.
 * Each area: rating 1–5, pressed state, and Open: {benchmark} benchmark
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
import { ASSESSMENT_STORAGE_KEY, type AssessmentScores } from '../../lib/studentAssessment.ts';
import { installStudentMockGuard, resetStudentMockGuardForTests } from '../../lib/studentDemo.ts';
import { STUDENT_BACKUP_STAMP_KEY } from '../../lib/studentBackupStamp.ts';
import { blankStudentReport, saveStudentReport, todayIso } from '../../lib/studentEdition.ts';
import { withStarterRubric } from '../../lib/studentTools.ts';
import { CompetitorPage } from './CompetitorPage.tsx';
import { PrintReportPage } from './PrintReportPage.tsx';
import { SelfAssessmentPage } from './SelfAssessmentPage.tsx';

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
  for (const area of ['Guard', 'Passing', 'Takedowns', 'Escapes', 'Submissions', 'Conditioning', 'Mindset']) {
    act(() => {
      labeled(host, `${area} ${score}`).click();
    });
  }
}

const AREAS = ['Guard', 'Passing', 'Takedowns', 'Escapes', 'Submissions', 'Conditioning', 'Mindset'] as const;

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
  for (const area of AREAS) {
    labeled(host, `${area} rating`);
    for (const score of [1, 2, 3, 4, 5]) {
      const tap = labeled(host, `${area} ${score}`);
      assert.equal(tap.getAttribute('aria-pressed'), 'false');
    }
    assert.equal(host.querySelector(`#assess-${area.toLowerCase()}`)?.id, `assess-${area.toLowerCase()}`);
  }
  const shape = host.querySelector('svg.assess-chart');
  assert.equal(shape?.getAttribute('aria-label'), selfAssessmentShapeLabel(null));
  assert.equal(host.querySelectorAll('polygon.assess-chart__shape').length, 0);
  assert.ok(host.querySelector('[aria-label^="Self-assessment trend"]'));
  assert.equal(
    host.querySelector('a[href="/student/rubric?student=1#checkpoint.white.s1-positions"]')?.textContent,
    'Open: Name the four basic control positions and hold each against a cooperative partner: closed guard, side control, mount, back control. benchmark',
  );
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
  saveStudentReport(localStorage, withStarterRubric(blankStudentReport()));
  const mounted = mount(<SelfAssessmentPage />);
  const { host } = mounted;
  assert.equal(
    host.querySelector('a[href="/student/rubric#checkpoint.white.s1-positions"]')?.textContent,
    'Open: Name the four basic control positions and hold each against a cooperative partner: closed guard, side control, mount, back control. benchmark',
  );
  assert.equal(
    host.querySelector('a[href="/student/rubric#checkpoint.white.s1-pass"]')?.textContent,
    'Open: Open closed guard from the top and pass it one way in drilling. benchmark',
  );
  assert.equal(
    host.querySelector('a[href="/student/rubric#checkpoint.white.s2-escape-resist"]')?.textContent,
    'Open: Escape mount and side control with two different options each against a partner who starts to resist. benchmark',
  );
  assert.ok(host.querySelector('a[href="/student/rubric#checkpoint.white.promo-standing"]'));
  assert.equal(host.textContent?.includes('Open: Conditioning benchmark'), false);
  assert.equal(
    [...host.querySelectorAll('a')].some((link) => link.getAttribute('href')?.includes('checkpoint.blue')),
    false,
  );

  act(() => {
    control(host, 'button', 'Save self-assessment').click();
  });
  assert.match(labeled(host, 'Self-assessment').textContent ?? '', /Rate Guard from 1 to 5/);
  assert.equal(localStorage.getItem('matboard.studentEdition.assessment.v1'), null);

  rateAll(host, 4);
  assert.equal(labeled(host, 'Guard 4').getAttribute('aria-pressed'), 'true');
  assert.equal(labeled(host, 'Guard 3').getAttribute('aria-pressed'), 'false');
  setControl(labeled(host, 'Self-assessment note') as HTMLTextAreaElement, 'calm rounds');
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
  assert.equal(shape?.querySelector('polygon.assess-chart__shape')?.getAttribute('points'), radarPoints([4, 4, 4, 4, 4, 4, 4]));
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
  assert.equal(labeled(again.host, 'Guard 4').getAttribute('aria-pressed'), 'true');
  setControl(labeled(again.host, 'Self-assessment date') as HTMLInputElement, '2020-01-02');
  assert.equal((labeled(again.host, 'Self-assessment note') as HTMLTextAreaElement).value, '');
  assert.equal(labeled(again.host, 'Guard 4').getAttribute('aria-pressed'), 'false');
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
  const report = withStarterRubric(blankStudentReport());
  report.profile.belt = 'blue';
  saveStudentReport(localStorage, report);
  const mounted = mount(<SelfAssessmentPage />);
  const { host } = mounted;
  assert.equal(
    host.querySelector('a[href="/student/rubric#checkpoint.blue.s1-half-bottom"]')?.textContent,
    'Open: Keep your guard from being passed. Half guard from the bottom: a way to recover, a sweep and a back take. benchmark',
  );
  assert.equal(
    host.querySelector('a[href="/student/rubric#checkpoint.blue.s4-takedowns"]')?.textContent,
    'Open: Takedowns: connect a single leg, a double leg, and an arm drag or hip throw to a finish. benchmark',
  );
  assert.equal(
    host.querySelector('a[href="/student/rubric#checkpoint.blue.s1-defend"]')?.textContent,
    'Open: Defend submissions early (arm locks, triangle, chokes) before they are tight, stay calm, and escape them. benchmark',
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

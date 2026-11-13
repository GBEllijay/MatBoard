/**
 * Both D8 on send, accept, and inbox screens. Sources only; display does not write.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AssessmentCompareD8, COMPARE_LABEL, NO_INSTRUCTOR_ASSESSMENT_YET } from './AssessmentCompareD8.tsx';
import { SharePage } from '../pages/student/SharePage.tsx';
import { SendToInstructor } from '../pages/student/SelfAssessment.tsx';
import { CoachUpdateInbox } from './CoachUpdateInbox.tsx';
import { PendingStudentUpdates } from './CoachStudentInbox.tsx';
import { AssessmentsWaiting } from './AssessmentsWaiting.tsx';
import { ASSESSMENT_STORAGE_KEY, type AssessmentEntry } from '../lib/studentAssessment.ts';
import { buildCoachAssessmentUpdate, readCoachOverlay, writeCoachOverlay } from '../lib/coachSync.ts';
import { queueCoachUpdate, readCoachQueue } from '../lib/coachRankUpdate.ts';
import { ASSESSMENTS_WAITING_KEY, buildAssessmentSubmission } from '../lib/instructorAssessmentClient.ts';
import { assessmentItemId } from '../lib/instructorAssessments.ts';
import { COACH_STUDENT_UPDATES_KEY, STUDENT_COACH_UPDATE_KIND } from '../lib/coachProgressFile.ts';
import { blankStudentReport, saveStudentReport } from '../lib/studentEdition.ts';
import { assignStudentId } from '../lib/studentIdentity.ts';
import { updateRosterCard, readRosterCard } from '../lib/rosterCardStore.ts';
import { SEND_TO_INSTRUCTOR_LABEL } from '../lib/instructorAssessmentClient.ts';

const dom = new Window({ url: 'http://localhost/student' });
const view = dom as unknown as Window & typeof globalThis;
function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
for (const key of [
  'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLDetailsElement',
  'Element', 'Node', 'DocumentFragment', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent',
] as const) installGlobal(key, (view as unknown as Record<string, unknown>)[key]);
installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('sessionStorage', view.sessionStorage);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const COACH_SCORES = { guard: 3, passing: 3, sweeps: 1, takedowns: 2, escapes: 3, submissions: 1, conditioning: 2, mindset: 4 };
const SELF_SCORES = { guard: 4, passing: 2, sweeps: 3, takedowns: 2, escapes: 4, submissions: 3, conditioning: 3, mindset: 5 };
const OLD_SELF_SCORES = { guard: 2, passing: 2, sweeps: 2, takedowns: 2, escapes: 2, submissions: 2, conditioning: 2, mindset: 2 };

const selfLatest: AssessmentEntry = { id: 'self-new', date: '2026-11-12', note: 'latest self', scores: SELF_SCORES as never };
const selfOlder: AssessmentEntry = { id: 'self-old', date: '2026-11-01', note: 'older self', scores: OLD_SELF_SCORES as never };

function snapshot() {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) out[key] = localStorage.getItem(key) ?? '';
  }
  return JSON.stringify(out);
}

function mount(node: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<MemoryRouter initialEntries={['/student']}>{node}</MemoryRouter>));
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function reactProps(node: Element): Record<string, ((event: unknown) => void) | undefined> | null {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  return key ? (node as unknown as Record<string, Record<string, (event: unknown) => void>>)[key] : null;
}

function click(node: HTMLElement) {
  act(() => {
    reactProps(node)?.onClick?.({ preventDefault() {} });
  });
}

function radio(host: ParentNode, name: string) {
  const found = [...host.querySelectorAll('[role="radio"]')].find((node) => node.textContent?.trim() === name);
  assert.ok(found, `radio ${name}`);
  return found as HTMLElement;
}

function openCompare(host: ParentNode) {
  const toggle = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === COMPARE_LABEL);
  assert.ok(toggle, 'Compare disclosure');
  click(toggle as HTMLElement);
  assert.ok(host.querySelector('[data-testid="assess-compare"]'), 'Compare opened');
  return toggle;
}

function seedSelf() {
  localStorage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify({ entries: [selfLatest, selfOlder] }));
}

function seedOverlay() {
  writeCoachOverlay(localStorage, {
    version: 1,
    assessments: [
      {
        updateId: 'overlay-old',
        gymName: 'Sample Gym',
        date: '2026-10-01',
        note: 'old coach',
        scores: { guard: 1, passing: 1, sweeps: 1, takedowns: 1, escapes: 1, submissions: 1, conditioning: 1, mindset: 1 },
        strengths: '',
        weaknesses: '',
      },
      {
        updateId: 'overlay-new',
        gymName: 'Sample Gym',
        date: '2026-11-10',
        note: 'latest coach',
        scores: COACH_SCORES,
        strengths: 'Mindset',
        weaknesses: 'Sweeps',
      },
    ],
    beltProgress: {},
    notes: [],
  });
}

test('AssessmentCompareD8: Both is the default and draws coach over self from the latest entries', () => {
  const coach = [
    { id: 'c-old', date: '2026-10-01', note: '', scores: { ...COACH_SCORES, mindset: 1 } as never },
    { id: 'c-new', date: '2026-11-10', note: '', scores: COACH_SCORES as never },
  ];
  const { host, unmount } = mount(
    <AssessmentCompareD8 coachEntries={coach} selfEntries={[selfOlder, selfLatest]} />,
  );
  const panel = host.querySelector('[data-testid="assess-compare"]');
  assert.equal(panel?.getAttribute('data-compare-view'), 'both');
  assert.equal(panel?.getAttribute('data-compare-sources'), 'coach self');
  const d8 = host.querySelector('[data-testid="card-d8"]');
  assert.equal(d8?.getAttribute('data-layers'), 'coach self');
  assert.match(d8?.getAttribute('aria-label') ?? '', /Coach:/);
  assert.match(d8?.getAttribute('aria-label') ?? '', /Student self:/);
  assert.match(host.textContent ?? '', /Coach · Nov 10, 2026/);
  assert.match(host.textContent ?? '', /Self · Nov 12, 2026/);
  click(radio(host, 'Student self'));
  assert.equal(host.querySelector('[data-testid="card-d8"]')?.getAttribute('data-layers'), 'self');
  click(radio(host, 'Coach'));
  assert.equal(host.querySelector('[data-testid="card-d8"]')?.getAttribute('data-layers'), 'coach');
  click(radio(host, 'Both'));
  assert.equal(host.querySelector('[data-testid="card-d8"]')?.getAttribute('data-layers'), 'coach self');
  unmount();
});

test('AssessmentCompareD8: with no instructor assessment, the student D8 stays and the note appears', () => {
  const { host, unmount } = mount(<AssessmentCompareD8 coachEntries={[]} selfEntries={[selfLatest]} />);
  const d8 = host.querySelector('[data-testid="card-d8"]');
  assert.equal(d8?.getAttribute('data-layers'), 'self');
  assert.match(host.textContent ?? '', new RegExp(NO_INSTRUCTOR_ASSESSMENT_YET));
  unmount();
});

test('Share page and Send to my instructor: latest self over accepted overlay, Both by default; render does not write', () => {
  localStorage.clear();
  saveStudentReport(localStorage, blankStudentReport(1));
  seedSelf();
  seedOverlay();
  const before = snapshot();
  const share = mount(<SharePage />);
  const panel = share.host.querySelector('[data-testid="assess-compare"]');
  assert.equal(panel?.getAttribute('data-compare-view'), 'both');
  assert.equal(panel?.getAttribute('data-compare-sources'), 'coach self');
  assert.equal(share.host.querySelector('[data-testid="card-d8"]')?.getAttribute('data-layers'), 'coach self');
  click(radio(share.host, 'Student self'));
  assert.equal(share.host.querySelector('[data-testid="card-d8"]')?.getAttribute('data-layers'), 'self');
  share.unmount();

  const send = mount(<SendToInstructor entry={selfLatest} studentName="Alex Rivera" />);
  assert.ok([...send.host.querySelectorAll('button')].some((b) => b.textContent === SEND_TO_INSTRUCTOR_LABEL));
  assert.equal(send.host.querySelector('[data-testid="assess-compare"]')?.getAttribute('data-compare-view'), 'both');
  assert.equal(send.host.querySelector('[data-testid="card-d8"]')?.getAttribute('data-layers'), 'coach self');
  send.unmount();
  assert.equal(snapshot(), before, 'looking at the send screens does not write');
});

test('From your coach: pending assessment is the coach layer over latest self, and nothing is written until Accept', () => {
  localStorage.clear();
  let report = assignStudentId(blankStudentReport(10), 'stu-alex');
  saveStudentReport(localStorage, report);
  seedSelf();
  const built = buildCoachAssessmentUpdate({
    studentId: 'stu-alex',
    date: '2026-11-13',
    scores: COACH_SCORES,
    note: 'Work the closed guard',
    now: 50,
    updateId: 'assess-pending-1',
  });
  if (!built.ok) throw new Error(built.error);
  queueCoachUpdate(localStorage, built.packet);
  const before = snapshot();
  const { host, unmount } = mount(<CoachUpdateInbox />);
  assert.match(host.textContent ?? '', /From your coach/);
  const panel = host.querySelector('[data-testid="assess-compare"]');
  assert.equal(panel?.getAttribute('data-compare-view'), 'both');
  assert.equal(panel?.getAttribute('data-compare-sources'), 'coach self');
  assert.equal(host.querySelector('[data-testid="card-d8"]')?.getAttribute('data-layers'), 'coach self');
  assert.match(host.textContent ?? '', /Coach · /);
  click(radio(host, 'Coach'));
  assert.equal(host.querySelector('[data-testid="card-d8"]')?.getAttribute('data-layers'), 'coach');
  assert.equal(snapshot(), before, 'toggle does not write before Accept');
  assert.equal(readCoachOverlay(localStorage).assessments.length, 0);
  assert.equal(readCoachQueue(localStorage).length, 1);
  const accept = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Accept');
  assert.ok(accept);
  click(accept as HTMLElement);
  assert.equal(readCoachQueue(localStorage).length, 0, 'Accept clears the queue');
  assert.equal(readCoachOverlay(localStorage).assessments.at(-1)?.updateId, 'assess-pending-1');
  unmount();
});

test('Student updates waiting: Compare uses the file self-assessment over the roster coach assessment, and does not write until Add', () => {
  localStorage.clear();
  const card = {
    id: 'card-alex',
    name: 'Alex Rivera',
    belt: 'Blue',
    division: '',
    gym: '',
    photo: '',
    lastPromotion: '',
    lastPromotionDetail: '',
    note: '',
    checkedIn: false,
    rosterList: 'student' as const,
    linkedStudentId: 'stu-alex',
  };
  updateRosterCard(card.id, (row) => ({
    ...row,
    coachAssessments: [{ id: 'saved-coach', date: '2026-11-08', note: '', scores: COACH_SCORES as never }],
  }));
  const update = {
    schemaVersion: 1 as const,
    kind: STUDENT_COACH_UPDATE_KIND,
    updateId: 'upd-1',
    studentId: 'stu-alex',
    sentAt: 9,
    since: 0,
    assessments: [{ id: 'self-file', date: '2026-11-12', note: '', scores: SELF_SCORES }],
  };
  localStorage.setItem(COACH_STUDENT_UPDATES_KEY, JSON.stringify({ pending: [update], decided: [], kept: [] }));
  const before = snapshot();
  const { host, unmount } = mount(
    <PendingStudentUpdates roster={[card as never]} onStatus={() => {}} />,
  );
  assert.match(host.textContent ?? '', /Student updates waiting/);
  assert.equal(host.querySelector('[data-testid="assess-compare"]'), null, 'D8 stays behind Compare');
  openCompare(host);
  const panel = host.querySelector('[data-testid="assess-compare"]');
  assert.equal(panel?.getAttribute('data-compare-view'), 'both');
  assert.equal(panel?.getAttribute('data-compare-sources'), 'coach self');
  assert.equal(host.querySelector('[data-testid="card-d8"]')?.getAttribute('data-layers'), 'coach self');
  assert.equal(snapshot(), before, 'opening Compare does not write');
  assert.equal(readRosterCard(card.id).coachAssessments.length, 1);
  assert.match(localStorage.getItem(COACH_STUDENT_UPDATES_KEY) ?? '', /upd-1/);
  unmount();
});

test('Assessments waiting: Compare uses the submitted self scores over the roster coach assessment, and does not write', () => {
  localStorage.clear();
  const entry = { id: 'assess-1', date: '2026-11-12', note: 'Felt good', scores: SELF_SCORES };
  const submission = buildAssessmentSubmission({
    entry: entry as never,
    studentId: 'stu-alex',
    profileId: 'default',
    studentName: 'Alex Rivera',
    now: 1,
  })!;
  const item = {
    kind: 'instructor-assessment-item',
    v: 1,
    id: assessmentItemId('stu-alex', submission.submissionId),
    license: 'gym-license-01',
    instructorId: 'seat-1',
    route: 'connect-code',
    status: 'pending',
    submission,
    receivedAt: 5,
  };
  localStorage.setItem(ASSESSMENTS_WAITING_KEY, JSON.stringify({ items: [item], owner: false, instructorId: 'seat-1', checkedAt: 1 }));
  const card = {
    id: 'card-alex',
    name: 'Alex Rivera',
    belt: 'Blue',
    division: '',
    gym: '',
    photo: '',
    lastPromotion: '',
    lastPromotionDetail: '',
    note: '',
    checkedIn: false,
    rosterList: 'student' as const,
    linkedStudentId: 'stu-alex',
  };
  updateRosterCard(card.id, (row) => ({
    ...row,
    coachAssessments: [{ id: 'saved-coach', date: '2026-11-08', note: '', scores: COACH_SCORES as never }],
  }));
  const before = snapshot();
  const { host, unmount } = mount(<AssessmentsWaiting roster={[card as never]} />);
  openCompare(host);
  const panel = host.querySelector('[data-testid="assess-compare"]');
  assert.equal(panel?.getAttribute('data-compare-view'), 'both');
  assert.equal(panel?.getAttribute('data-compare-sources'), 'coach self');
  assert.equal(host.querySelector('[data-testid="card-d8"]')?.getAttribute('data-layers'), 'coach self');
  assert.equal(snapshot(), before, 'opening Compare does not mark or reply');
  unmount();
});


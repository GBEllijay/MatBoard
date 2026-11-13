/**
 * Student → instructor assessment, on screen:
 * Self-assessment shows Send to my instructor and sends the saved day with the scanned code.
 * The coach roster shows Assessments waiting with a count badge, the student's eight scores,
 * Mark seen, and Reply (only once the student's card is on this roster).
 * The Clipboard Self view reads kept and Cloud-received self scores.
 * Claiming a Student license on a phone with an Instructor seat keeps the seat pass.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new Window({ url: 'https://advantagebjjtimer.com/roster' });
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
installGlobal('Event', view.Event);
installGlobal('CustomEvent', view.CustomEvent);

const { AssessmentsWaiting, ASSESSMENTS_WAITING_TITLE } = await import('./AssessmentsWaiting.tsx');
const { SendToInstructor } = await import('../pages/student/SelfAssessment.tsx');
const { ASSESSMENTS_WAITING_KEY, COACH_VIA_KEY, SEND_TO_INSTRUCTOR_LABEL } = await import('../lib/instructorAssessmentClient.ts');
const { buildAssessmentSubmission } = await import('../lib/instructorAssessmentClient.ts');
const { assessmentItemId } = await import('../lib/instructorAssessments.ts');
const { INBOX_PASS_KEY, ACADEMY_LICENSE_KEY } = await import('../lib/studentInboxClient.ts');
const { ENTITLEMENT_TOKEN_KEY } = await import('../lib/entitlement.ts');
const { STUDENT_SIDE_TOKEN_KEY } = await import('../lib/passDowngrade.ts');
const { applyClaimedStudentLicense } = await import('../lib/studentLicenseClient.ts');
const { readFileSync } = await import('node:fs');

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const fakeToken = (payload: unknown) => `${b64({ alg: 'ES256' })}.${b64(payload)}.c2ln`;
const LICENSE = 'gym-license-01';
const entry = {
  id: 'assess-1', date: '2026-11-12', note: 'Felt good',
  scores: { guard: 4, passing: 3, sweeps: 3, takedowns: 2, escapes: 4, submissions: 3, conditioning: 3, mindset: 5 },
};

async function render(node: React.ReactNode) {
  const host = view.document.createElement('div');
  view.document.body.appendChild(host);
  const root = createRoot(host as unknown as Element);
  await act(async () => root.render(node));
  return { host, root };
}

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

test('Self-assessment: Send to my instructor waits for a saved day, then sends it with the scanned code', async () => {
  localStorage.clear();
  const calls: Record<string, unknown>[] = [];
  installGlobal('fetch', async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ ok: true, id: 'stu-paige__x', instructorId: 'seat-paige', status: 'pending' }), { status: 200 });
  });
  const unsaved = await render(<SendToInstructor entry={undefined} studentName="Paige" />);
  const button = () => [...unsaved.host.querySelectorAll('button')].find((b) => b.textContent === SEND_TO_INSTRUCTOR_LABEL);
  assert.ok(button());
  assert.equal(button()!.hasAttribute('disabled'), true);
  assert.match(unsaved.host.textContent ?? '', /Save this day first/);
  await act(async () => unsaved.root.unmount());

  localStorage.setItem(INBOX_PASS_KEY, fakeToken({ typ: 'student-inbox', v: 1, gym: LICENSE, studentId: 'stu-paige', exp: 9_999_999_999 }));
  localStorage.setItem(ACADEMY_LICENSE_KEY, LICENSE);
  const code = fakeToken({ typ: 'coach-connect', v: 1, gym: LICENSE, name: 'Gym', key: 'k'.repeat(24), via: 'seat-paige' });
  localStorage.setItem(COACH_VIA_KEY, JSON.stringify({ gym: LICENSE, gymName: 'Gym', viaInstructorId: 'seat-paige', proof: code, savedAt: 1 }));
  const saved = await render(<SendToInstructor entry={entry as never} studentName="Paige" />);
  const send = [...saved.host.querySelectorAll('button')].find((b) => b.textContent === SEND_TO_INSTRUCTOR_LABEL)!;
  assert.equal(send.hasAttribute('disabled'), false);
  await act(async () => {
    send.click();
  });
  await flush();
  assert.equal(calls.length, 1);
  assert.equal((calls[0].submission as { via: string }).via, code);
  assert.match(saved.host.textContent ?? '', /Sent to your instructor for 2026-11-12/);
  await act(async () => saved.root.unmount());
});

test('Self-assessment page wires the button under the form', () => {
  const page = readFileSync('src/pages/student/SelfAssessment.tsx', 'utf8');
  assert.match(page, /<SendToInstructor entry=\{savedOnDate\} studentName=\{report\.profile\.displayName\} \/>/);
});

test('Assessments waiting: badge count, eight scores, Mark seen; Reply only with the student card on this roster', async () => {
  localStorage.clear();
  installGlobal('fetch', async () => new Response(JSON.stringify({ ok: false }), { status: 404 }));
  const submission = buildAssessmentSubmission({ entry: entry as never, studentId: 'stu-paige', profileId: 'default', studentName: 'Paige', now: 1 })!;
  const item = {
    kind: 'instructor-assessment-item', v: 1, id: assessmentItemId('stu-paige', submission.submissionId), license: LICENSE,
    instructorId: 'seat-paige', route: 'connect-code', status: 'pending', submission, receivedAt: 5,
  };
  localStorage.setItem(ASSESSMENTS_WAITING_KEY, JSON.stringify({ items: [item], owner: false, instructorId: 'seat-paige', checkedAt: 1 }));
  const none = await render(<AssessmentsWaiting roster={[]} />);
  assert.match(none.host.textContent ?? '', new RegExp(ASSESSMENTS_WAITING_TITLE));
  assert.equal(none.host.querySelector('[data-assessments-waiting]')?.getAttribute('data-assessments-waiting'), '1');
  assert.match(none.host.textContent ?? '', /Guard\/Control 4/);
  assert.match(none.host.textContent ?? '', /Mindset 5/);
  assert.match(none.host.textContent ?? '', /Accept this student's card first/);
  const reply = [...none.host.querySelectorAll('button')].find((b) => b.textContent === 'Reply')!;
  assert.equal(reply.hasAttribute('disabled'), true);
  assert.ok([...none.host.querySelectorAll('button')].some((b) => b.textContent === 'Mark seen'));
  await act(async () => none.root.unmount());

  const card = { id: 'card-1', name: 'Paige R', belt: 'Blue', division: '', gym: '', photo: '', lastPromotion: '', lastPromotionDetail: '', note: '', checkedIn: false, rosterList: 'student', linkedStudentId: 'stu-paige' };
  const linked = await render(<AssessmentsWaiting roster={[card as never]} />);
  const open = [...linked.host.querySelectorAll('button')].find((b) => b.textContent === 'Reply')!;
  assert.equal(open.hasAttribute('disabled'), false);
  await act(async () => {
    open.click();
  });
  const guard = linked.host.querySelector('select[aria-label="Coach Guard/Control"]') as unknown as HTMLSelectElement;
  assert.equal(guard.value, '4', 'the reply starts from the student scores');
  assert.ok([...linked.host.querySelectorAll('button')].some((b) => b.textContent === "Send to student's card"));
  await act(async () => linked.root.unmount());
});

test('Roster shows Assessments waiting next to new student cards; the Clipboard Self view is no longer hard-coded empty', () => {
  const roster = readFileSync('src/pages/Roster.tsx', 'utf8');
  assert.match(roster, /<PendingCardShares roster=\{roster\.students\} title="New student cards" \/>\s*<AssessmentsWaiting roster=\{roster\.students\} \/>/);
  const sheet = readFileSync('src/components/rosterCard/RosterCardSheet.tsx', 'utf8');
  assert.doesNotMatch(sheet, /assessmentSummary\(record\.coachAssessments, \[\], view\)/);
  assert.match(sheet, /assessmentSummary\(record\.coachAssessments, selfAssessments, view\)/);
  assert.match(sheet, /selfAssessmentsForStudent\(storage\(\), student\.linkedStudentId\)/);
});

test('claiming a Student license on a phone with an Instructor seat keeps the seat pass and keeps the Student pass beside it', async () => {
  localStorage.clear();
  const seatPass = fakeToken({ src: 'seat', tier: 'seat', grants: ['white', 'student', 'coach', 'pro'], sid: 'seat-paige', gym: LICENSE });
  const studentPass = fakeToken({ src: 'student-license', tier: 'student', grants: ['student'], sub: LICENSE });
  localStorage.setItem(ENTITLEMENT_TOKEN_KEY, seatPass);
  const inbox = fakeToken({ typ: 'student-inbox', v: 1, gym: LICENSE, studentId: 'stu-paige', exp: 9_999_999_999 });
  const ok = await applyClaimedStudentLicense(
    { ok: true, token: studentPass, grants: ['student'], gymId: LICENSE, deviceId: 'd', cloud: true, studentPass: inbox },
    'Gym',
    localStorage as unknown as Storage,
  );
  assert.deepEqual(ok, { applied: false, keptHigher: true });
  assert.equal(localStorage.getItem(ENTITLEMENT_TOKEN_KEY), seatPass, 'the seat pass is never overwritten');
  assert.equal(localStorage.getItem(STUDENT_SIDE_TOKEN_KEY), studentPass);
  assert.equal(localStorage.getItem(INBOX_PASS_KEY), inbox, 'her one student identity still gets its inbox pass');
  assert.equal(localStorage.getItem(ACADEMY_LICENSE_KEY), LICENSE);
});

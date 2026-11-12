/**
 * Student → instructor assessments, client side: identity rule, strict submission,
 * status steps, the "never downgrade a higher pass" rule, the student phone send,
 * the coach waiting list and badge, the Self view source, and roster fill-blank.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { COACH_STUDENT_UPDATES_KEY, STUDENT_COACH_UPDATE_KIND } from './coachProgressFile.ts';
import {
  ASSESSMENT_SENDS_KEY,
  assessmentsWaitingCount,
  buildAssessmentSubmission,
  readAssessmentSends,
  readCoachVia,
  refreshAssessmentsWaiting,
  markAssessment,
  replyPrefill,
  saveCoachVia,
  selfAssessmentsForStudent,
  sendAssessmentToInstructor,
} from './instructorAssessmentClient.ts';
import {
  ASSESSMENT_SUBMISSION_KIND,
  assessmentIndexRow,
  assessmentItemId,
  nextAssessmentStatus,
  readAssessmentSubmission,
  type InstructorAssessmentItem,
} from './instructorAssessments.ts';
import {
  OWNER_INSTRUCTOR_ID,
  achievementKey,
  canReassignInstructor,
  fillAssignedInstructor,
  instructorIdFor,
  instructorIdFromClaims,
} from './instructorIdentity.ts';
import { STUDENT_SIDE_TOKEN_KEY, keepStudentSideToken, readStudentSideToken, wouldDowngradePass } from './passDowngrade.ts';
import { lightNormalizeRoster, mergeRosterBackup, buildRosterBackup, type BackupStudent } from './rosterBackup.ts';
import { INBOX_PASS_KEY, ACADEMY_LICENSE_KEY } from './studentInboxClient.ts';
import { testMemory } from './testPackets.ts';

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const fakeToken = (payload: unknown) => `${b64({ alg: 'ES256' })}.${b64(payload)}.c2ln`;
const LICENSE = 'gym-license-01';
const PASS = fakeToken({ typ: 'student-inbox', v: 1, gym: LICENSE, studentId: 'stu-paige', exp: 9_999_999_999 });
const CODE = fakeToken({ typ: 'coach-connect', v: 1, gym: LICENSE, name: 'Gym', key: 'k'.repeat(24), via: 'seat-paige' });

const entry = {
  id: 'assess-1',
  date: '2026-11-12',
  note: 'Felt good',
  scores: { guard: 4, passing: 3, sweeps: 3, takedowns: 2, escapes: 4, submissions: 3, conditioning: 3, mindset: 5 },
} as never;

test('one instructor id: the seat id for a seat, owner for the owner; same as per-instructor lesson plans', () => {
  assert.equal(instructorIdFor({ kind: 'owner' }), OWNER_INSTRUCTOR_ID);
  assert.equal(instructorIdFor({ kind: 'seat', seatId: '8b1f-uuid_1' }), '8b1f-uuid_1');
  assert.equal(instructorIdFor({ kind: 'seat', seatId: 'owner' }), null, 'a seat can never pose as the owner');
  assert.equal(instructorIdFor({ kind: 'seat', seatId: '../x' }), null);
  assert.equal(instructorIdFromClaims({ src: 'seat', tier: 'seat', sid: 'abc' }), 'abc');
  assert.equal(instructorIdFromClaims({ src: 'code', tier: 'pro' }), 'owner');
  assert.equal(canReassignInstructor({ kind: 'owner' }), true);
  assert.equal(canReassignInstructor({ kind: 'seat' }), false);
  assert.equal(fillAssignedInstructor('seat-a', 'seat-b'), 'seat-a');
  assert.equal(fillAssignedInstructor(undefined, 'seat-b'), 'seat-b');
  assert.notEqual(achievementKey('student', 'stu-paige'), achievementKey('instructor', 'stu-paige'));
});

test('submission reader is strict and the status only moves forward', () => {
  const base = buildAssessmentSubmission({ entry, studentId: 'stu-paige', profileId: 'default', now: 1 });
  assert.ok(base);
  assert.equal(base.kind, ASSESSMENT_SUBMISSION_KIND);
  assert.equal(Object.keys(base.scores).length, 8);
  assert.equal(readAssessmentSubmission({ ...base, journal: 'x' }), null);
  assert.equal(readAssessmentSubmission({ ...base, scores: { guard: 0 } }), null);
  assert.equal(readAssessmentSubmission({ ...base, via: 'not a code' }), null);
  assert.equal(readAssessmentSubmission({ ...base, assignedInstructorId: 'a/b' }), null);
  assert.deepEqual(nextAssessmentStatus('pending', 'seen'), { ok: true, status: 'seen', changed: true });
  assert.deepEqual(nextAssessmentStatus('seen', 'pending'), { ok: true, status: 'seen', changed: false });
  assert.equal(nextAssessmentStatus('responded', 'responded').ok, false);
  const item: InstructorAssessmentItem = {
    kind: 'instructor-assessment-item', v: 1, id: assessmentItemId('stu-paige', base.submissionId), license: LICENSE,
    instructorId: 'seat-paige', route: 'connect-code', status: 'pending', submission: base, receivedAt: 5,
  };
  const row = assessmentIndexRow(item);
  assert.equal('scores' in row, false);
  assert.deepEqual(replyPrefill(item).scores, base.scores, 'the reply starts from the student scores');
});

test('a Student pass never replaces a seat or a higher license; the Student pass is kept beside it', () => {
  const seat = fakeToken({ src: 'seat', tier: 'seat', grants: ['white', 'student', 'coach', 'pro'], sid: 's1' });
  const pro = fakeToken({ src: 'stripe', tier: 'pro', grants: ['pro'] });
  const coach = fakeToken({ src: 'code', tier: 'coach', grants: ['coach'] });
  const white = fakeToken({ src: 'code', tier: 'white', grants: ['white'] });
  const student = fakeToken({ src: 'student-license', tier: 'student', grants: ['student'] });
  const locked = fakeToken({ src: 'seat', tier: 'seat', grants: [], subs: { state: 'locked' } });
  assert.equal(wouldDowngradePass(seat, student), true);
  assert.equal(wouldDowngradePass(pro, student), true);
  assert.equal(wouldDowngradePass(coach, student), true);
  assert.equal(wouldDowngradePass(white, student), false, 'White → Student is an upgrade');
  assert.equal(wouldDowngradePass('', student), false);
  assert.equal(wouldDowngradePass(locked, student), false, 'a locked pass is not protected');
  assert.equal(wouldDowngradePass(student, pro), false);
  const memory = testMemory();
  keepStudentSideToken(memory, student);
  assert.equal(readStudentSideToken(memory), student);
  assert.equal(memory.bag.has(STUDENT_SIDE_TOKEN_KEY), true);
});

test('student phone: the scanned code is kept and rides with Send to my instructor; no pass sends nothing', async () => {
  const memory = testMemory();
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get('authorization') });
    return new Response(JSON.stringify({ ok: true, id: 'stu-paige__x', instructorId: 'seat-paige', status: 'pending' }), { status: 200 });
  }) as typeof fetch;
  const none = await sendAssessmentToInstructor(memory, { entry, profileId: 'default' }, fetchImpl);
  assert.equal(none.ok, false);
  assert.equal(calls.length, 0);
  memory.setItem(INBOX_PASS_KEY, PASS);
  memory.setItem(ACADEMY_LICENSE_KEY, LICENSE);
  assert.ok(saveCoachVia(memory, { gym: LICENSE, gymName: 'Gym', viaInstructorId: 'seat-paige', proof: CODE }));
  assert.equal(readCoachVia(memory, 'another-gym-1'), null);
  const sent = await sendAssessmentToInstructor(memory, { entry, profileId: 'default', studentName: 'Paige' }, fetchImpl, 1000);
  assert.equal(sent.ok, true);
  assert.equal(calls[0].url, '/api/gym/assessments');
  assert.equal(calls[0].auth, `Bearer ${PASS}`);
  const submission = calls[0].body.submission as Record<string, unknown>;
  assert.equal(calls[0].body.action, 'submit');
  assert.equal(submission.via, CODE);
  assert.equal(submission.assignedInstructorId, 'seat-paige');
  assert.equal(submission.studentId, 'stu-paige');
  assert.equal(readAssessmentSends(memory)['assess-1'].instructorId, 'seat-paige');
  assert.equal(memory.bag.has(ASSESSMENT_SENDS_KEY), true);
});

test('coach phone: the waiting list fills the badge, a mark updates it, and Cloud self scores feed the Self view', async () => {
  const memory = testMemory();
  const submission = buildAssessmentSubmission({ entry, studentId: 'stu-paige', profileId: 'default', now: 1 })!;
  const item: InstructorAssessmentItem = {
    kind: 'instructor-assessment-item', v: 1, id: assessmentItemId('stu-paige', submission.submissionId), license: LICENSE,
    instructorId: 'seat-paige', route: 'connect-code', status: 'pending', submission, receivedAt: 5,
  };
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { action: string };
    if (body.action === 'list') return new Response(JSON.stringify({ ok: true, owner: false, instructorId: 'seat-paige', items: [item] }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, status: 'responded' }), { status: 200 });
  }) as typeof fetch;
  assert.equal(assessmentsWaitingCount(memory), 0);
  const pulled = await refreshAssessmentsWaiting({ storage: memory, fetchImpl, token: 'coach-token' });
  assert.deepEqual(pulled, { ok: true, waiting: 1 });
  assert.equal(assessmentsWaitingCount(memory), 1);
  // A kept student file adds an older self-assessment.
  memory.setItem(
    COACH_STUDENT_UPDATES_KEY,
    JSON.stringify({
      pending: [],
      decided: [],
      kept: [{ schemaVersion: 1, kind: STUDENT_COACH_UPDATE_KIND, updateId: 'u1', studentId: 'stu-paige', sentAt: 1, since: 0, assessments: [{ id: 'old', date: '2026-10-01', note: '', scores: { guard: 2 } }] }],
    }),
  );
  const self = selfAssessmentsForStudent(memory, 'stu-paige');
  assert.deepEqual(self.map((row) => row.date), ['2026-10-01', '2026-11-12']);
  assert.equal(self[1].scores.mindset, 5);
  assert.deepEqual(selfAssessmentsForStudent(memory, undefined), []);
  const marked = await markAssessment(item.id, 'responded', { responseId: 'upd-1', storage: memory, fetchImpl, token: 'coach-token' });
  assert.equal(marked.ok, true);
  assert.equal(assessmentsWaitingCount(memory), 0);
});

test('roster: assignedInstructorId survives a normalize and a merge fills it only when blank', () => {
  const row = (extra: Partial<BackupStudent>): BackupStudent => ({ id: 'c1', name: 'Paige', belt: 'Blue', checkedIn: false, linkedStudentId: 'stu-paige', ...extra });
  assert.equal(lightNormalizeRoster({ students: [row({ assignedInstructorId: 'seat-a' })] }).students[0].assignedInstructorId, 'seat-a');
  assert.equal(lightNormalizeRoster({ students: [row({ assignedInstructorId: 'bad/id' })] }).students[0].assignedInstructorId, undefined);
  const sources = (students: BackupStudent[]) => ({
    roster: { version: 1 as const, students, ready: {}, gamePlans: {}, competitionPlans: {} },
    cardFile: { cards: {} },
    privateNotes: {},
    inbox: [],
  });
  const incoming = (id: string) => buildRosterBackup(sources([row({ assignedInstructorId: id })]), { scope: 'shared' });
  const filled = mergeRosterBackup(sources([row({})]), incoming('seat-b'));
  assert.equal(filled.next.roster.students[0].assignedInstructorId, 'seat-b');
  const kept = mergeRosterBackup(sources([row({ assignedInstructorId: 'seat-a' })]), incoming('seat-b'));
  assert.equal(kept.next.roster.students[0].assignedInstructorId, 'seat-a');
});

test('scanning a coach connect code keeps who showed it on this phone', async () => {
  const { acceptCoachConnect } = await import('./coachConnect.ts');
  const memory = testMemory();
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ ok: true, gym: LICENSE, gymName: 'Gym', viaInstructorId: 'seat-paige' }), { status: 200 })) as unknown as typeof fetch;
  const result = await acceptCoachConnect(CODE, { fetchImpl, storage: memory });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.viaInstructorId, 'seat-paige');
  const via = readCoachVia(memory, LICENSE);
  assert.equal(via?.viaInstructorId, 'seat-paige');
  assert.equal(via?.proof, CODE);
});

test('one instructor id helper: lesson plan copies and the assessment inbox use the same id', async () => {
  const { instructorIdFor } = await import('./instructorIdentity.ts');
  const { lessonInstructorId, LESSON_OWNER_INSTRUCTOR_ID } = await import('./lessonPlanCopies.ts');
  assert.equal(LESSON_OWNER_INSTRUCTOR_ID, 'owner');
  for (const actor of [
    { kind: 'owner' as const },
    { kind: 'seat' as const, seatId: '6f1c2a9e-1111-4bbb-8ccc-123456789abc' },
    { kind: 'seat' as const, seatId: 'owner' },
    { kind: 'seat' as const, seatId: '../x' },
    { kind: 'seat' as const },
  ]) {
    assert.equal(lessonInstructorId(actor), instructorIdFor(actor));
  }
  assert.equal(lessonInstructorId({ kind: 'owner' }), 'owner');
  assert.equal(lessonInstructorId({ kind: 'seat', seatId: 'owner' }), null);
});

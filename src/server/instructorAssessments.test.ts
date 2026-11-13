/**
 * Student → instructor self-assessment on Advantage Cloud.
 * The connect code says who showed it (signed `via`), the card share and the
 * assessment route by it, the master roster assignment wins, scores never touch
 * master.json, and only the assigned instructor or the owner reads and answers.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { signJson, type PrivateJwk } from '../lib/entitlementToken.ts';
import {
  ASSESSMENT_MIN_GAP_MS,
  ASSESSMENT_STUDENT_OPEN_MAX,
  ASSESSMENT_SUBMISSION_KIND,
  assessmentIndexKey,
  instructorAssessmentKey,
} from '../lib/instructorAssessments.ts';
import { buildRosterBackup, type BackupStudent } from '../lib/rosterBackup.ts';
import { handleCoachConnect, readCoachConnectVia, viaForClaims } from './coachConnect.ts';
import { streamFrom, type GymCloudEnv } from './gymCloud.ts';
import { handleGymRoster } from './gymRoster.ts';
import { handleInstructorAssessments } from './instructorAssessments.ts';
import { handleStudentInbox, cardShareKey } from './studentInbox.ts';
import { issueToken, signingMaterial, type IssueInput } from './tokenIssue.ts';

const LICENSE = 'owner-test';
const PAIGE_SEAT = 'seat-paige-0001';
const OTHER_SEAT = 'seat-marco-0002';
const ASSIST_SEAT = 'seat-assist-003';
const STUDENT = 'stu-paige';
let clock = new Date('2026-11-12T20:00:00.000Z');
const now = () => clock;

class Bucket {
  objects = new Map<string, Uint8Array>();
  async head(key: string) {
    const row = this.objects.get(key);
    return row ? { size: row.byteLength } : null;
  }
  async get(key: string) {
    const row = this.objects.get(key);
    if (!row) return null;
    return { body: streamFrom(row), size: row.byteLength, text: async () => new TextDecoder().decode(row) };
  }
  async put(key: string, value: string | ArrayBuffer | Uint8Array) {
    this.objects.set(key, typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value as ArrayBuffer));
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  async list(options: { prefix?: string; cursor?: string; limit?: number } = {}) {
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(options.prefix ?? '')).sort();
    return { objects: keys.map((key) => ({ key, size: this.objects.get(key)!.byteLength })), truncated: false };
  }
  json(key: string): unknown {
    const row = this.objects.get(key);
    return row ? JSON.parse(new TextDecoder().decode(row)) : null;
  }
}

async function secretKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
}

async function token(secret: string, input: Partial<IssueInput> & Pick<IssueInput, 'tier' | 'src' | 'kind'>): Promise<string> {
  const issued = await issueToken(secret, {
    licenseId: LICENSE,
    grants: ['white', 'student', 'coach', 'pro'],
    deviceId: 'device-1',
    now: clock,
    subs: { state: 'active', cloud: true },
    ...input,
  } as IssueInput);
  assert.ok(issued);
  return issued;
}

const owner = (secret: string) => token(secret, { tier: 'pro', src: 'code', kind: 'code' });
const seat = (secret: string, sid: string, preset: string) =>
  token(secret, { tier: 'seat', src: 'seat', kind: 'seat', gym: LICENSE, sid, preset, grants: ['pro'] });

async function studentPass(secret: string, studentId = STUDENT, gym = LICENSE): Promise<string> {
  const material = signingMaterial(secret, 'k1')!;
  return signJson(material.kid, { typ: 'student-inbox', v: 1, gym, studentId, exp: Math.floor(clock.getTime() / 1000) + 86_400 }, material.privateJwk);
}

function env(bucket: Bucket, secret: string): GymCloudEnv {
  return { GYM_MEDIA: bucket as unknown as GymCloudEnv['GYM_MEDIA'], ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
}

async function call(e: GymCloudEnv, bearer: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await handleInstructorAssessments(
    new Request('https://advantagebjjtimer.com/api/gym/assessments', {
      method: 'POST',
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      body: JSON.stringify(body),
    }),
    e,
    now,
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function connect(e: GymCloudEnv, bearer: string, action: string): Promise<Record<string, unknown>> {
  const response = await handleCoachConnect(
    new Request('https://advantagebjjtimer.com/api/gym/coach-connect', {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ action, gymName: 'Advantage BJJ' }),
    }),
    e as never,
    now,
  );
  return (await response.json()) as Record<string, unknown>;
}

function submission(extra: Record<string, unknown> = {}) {
  return {
    kind: ASSESSMENT_SUBMISSION_KIND,
    v: 1,
    submissionId: `sub-${Math.random().toString(36).slice(2, 8)}`,
    studentId: STUDENT,
    profileId: 'default',
    date: '2026-11-12',
    note: 'Guard felt better today.',
    scores: { guard: 4, passing: 3, sweeps: 3, takedowns: 2, escapes: 4, submissions: 3, conditioning: 3, mindset: 5 },
    sentAt: clock.getTime(),
    ...extra,
  };
}

async function setup() {
  const secret = await secretKey();
  const bucket = new Bucket();
  const e = env(bucket, secret);
  await connect(e, await owner(secret), 'issue');
  return { secret, bucket, e };
}

test('the connect code says who showed it: a Coach or Instructors seat signs its seat id, the owner signs owner, an assistant signs nothing', async () => {
  const { secret, e } = await setup();
  const keys = [{ kid: 'k1', jwk: signingMaterial(secret, 'k1')!.publicJwk }];
  const ownerCode = await connect(e, await owner(secret), 'issue');
  assert.equal(ownerCode.via, 'owner');
  assert.equal(await readCoachConnectVia(ownerCode.invite as string, keys, LICENSE), 'owner');
  const paigeCode = await connect(e, await seat(secret, PAIGE_SEAT, 'instructors'), 'current');
  assert.equal(paigeCode.via, PAIGE_SEAT);
  assert.equal(await readCoachConnectVia(paigeCode.invite as string, keys, LICENSE), PAIGE_SEAT);
  const coachCode = await connect(e, await seat(secret, OTHER_SEAT, 'coach'), 'current');
  assert.equal(coachCode.via, OTHER_SEAT);
  const assistant = await connect(e, await seat(secret, ASSIST_SEAT, 'assistant-coach'), 'current');
  assert.equal(assistant.via, null);
  assert.equal(await readCoachConnectVia(assistant.invite as string, keys, LICENSE), null);
  assert.equal(viaForClaims({ src: 'seat', tier: 'seat', sid: 'x', preset: 'program-director' } as never), undefined);
  // Accept hands the id back to the scanning phone.
  const accepted = await handleCoachConnect(
    new Request('https://advantagebjjtimer.com/api/gym/coach-connect', { method: 'POST', body: JSON.stringify({ action: 'accept', invite: paigeCode.invite }) }),
    e as never,
    now,
  );
  assert.equal(((await accepted.json()) as { viaInstructorId: string }).viaInstructorId, PAIGE_SEAT);
});

test('a code cannot be replayed into another license, and a tampered code is refused', async () => {
  const { secret, e } = await setup();
  const keys = [{ kid: 'k1', jwk: signingMaterial(secret, 'k1')!.publicJwk }];
  const code = (await connect(e, await seat(secret, PAIGE_SEAT, 'coach'), 'current')).invite as string;
  assert.equal(await readCoachConnectVia(code, keys, 'another-gym-01'), null);
  const [head, , sig] = code.split('.');
  const forged = Buffer.from(JSON.stringify({ typ: 'coach-connect', v: 1, gym: LICENSE, name: '', key: 'k'.repeat(24), via: 'seat-evil' })).toString('base64url');
  assert.equal(await readCoachConnectVia(`${head}.${forged}.${sig}`, keys, LICENSE), null);
});

test('card share: the server keeps only a checked viaInstructorId and never stores the code; a phone-written id is dropped', async () => {
  const { secret, bucket, e } = await setup();
  const code = (await connect(e, await seat(secret, PAIGE_SEAT, 'instructors'), 'current')).invite as string;
  const share = (shareId: string, extra: Record<string, unknown>) => ({
    kind: 'student-card-share', v: 1, shareId, studentId: STUDENT,
    card: { name: 'Paige', belt: 'Blue', stripes: 1, division: '', gym: '' }, photo: null, parent: { required: false }, sentAt: 1, ...extra,
  });
  const post = (body: unknown) =>
    handleStudentInbox(new Request('https://advantagebjjtimer.com/api/gym/inbox', { method: 'POST', body: JSON.stringify(body) }), e as never, now);
  const ok = await post({ action: 'card-share-submit', license: LICENSE, studentId: STUDENT, share: share('share-a', { via: code }) });
  assert.equal(ok.status, 200);
  const stored = bucket.json(cardShareKey(LICENSE, 'share-a')) as Record<string, unknown>;
  assert.equal(stored.viaInstructorId, PAIGE_SEAT);
  assert.equal('via' in stored, false);
  await post({ action: 'card-share-submit', license: LICENSE, studentId: STUDENT, share: share('share-b', { viaInstructorId: 'seat-made-up' }) });
  assert.equal('viaInstructorId' in (bucket.json(cardShareKey(LICENSE, 'share-b')) as object), false);
});

test('submit needs this student\'s own inbox pass; the item lands in the instructor folder and the owner index carries no scores', async () => {
  const { secret, bucket, e } = await setup();
  const code = (await connect(e, await seat(secret, PAIGE_SEAT, 'instructors'), 'current')).invite as string;
  const pass = await studentPass(secret);
  const denied = await call(e, '', { action: 'submit', license: LICENSE, studentId: STUDENT, submission: submission() });
  assert.equal(denied.status, 403);
  const otherStudent = await call(e, await studentPass(secret, 'stu-other'), { action: 'submit', license: LICENSE, studentId: STUDENT, submission: submission() });
  assert.equal(otherStudent.status, 403);
  const sent = submission({ via: code, assignedInstructorId: 'owner' });
  const ok = await call(e, pass, { action: 'submit', license: LICENSE, studentId: STUDENT, submission: sent });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.instructorId, PAIGE_SEAT, 'the signed code wins over what the phone wrote');
  assert.equal(ok.body.route, 'connect-code');
  const id = ok.body.id as string;
  const item = bucket.json(instructorAssessmentKey(LICENSE, PAIGE_SEAT, id)) as { status: string; submission: Record<string, unknown> };
  assert.equal(item.status, 'pending');
  assert.equal(item.submission.via, undefined, 'the code is not stored');
  assert.deepEqual(item.submission.scores, sent.scores);
  const index = bucket.json(assessmentIndexKey(LICENSE, id)) as Record<string, unknown>;
  assert.equal(index.instructorId, PAIGE_SEAT);
  assert.equal('scores' in index, false);
  assert.equal('note' in index, false);
  assert.equal(bucket.objects.has(`groups/${LICENSE}/roster/master.json`), false, 'nothing is written to the master roster');
});

test('strict shape and size: unknown keys, bad scores, long notes and foreign profile ids are refused', async () => {
  const { secret, e } = await setup();
  const pass = await studentPass(secret);
  for (const bad of [
    submission({ journal: 'secret' }),
    submission({ scores: { guard: 6 } }),
    submission({ scores: { guard: 3, rubric: 2 } }),
    submission({ scores: {} }),
    submission({ note: 'x'.repeat(1001) }),
    submission({ profileId: '../etc' }),
    submission({ date: '2026-02-30' }),
    submission({ studentId: 'stu-other' }),
  ]) {
    const result = await call(e, pass, { action: 'submit', license: LICENSE, studentId: STUDENT, submission: bad });
    assert.equal(result.status, 400, JSON.stringify(bad).slice(0, 80));
  }
  const huge = await call(e, pass, { action: 'submit', license: LICENSE, studentId: STUDENT, submission: submission({ studentName: 'x'.repeat(13_000) }) });
  assert.equal(huge.status, 413);
});

test('rate limits: a retry is idempotent, a second send waits a minute, and open items cap per student', async () => {
  const { secret, e } = await setup();
  const pass = await studentPass(secret);
  const first = submission();
  const a = await call(e, pass, { action: 'submit', license: LICENSE, studentId: STUDENT, submission: first });
  assert.equal(a.status, 200);
  assert.equal(a.body.route, 'owner-default');
  const again = await call(e, pass, { action: 'submit', license: LICENSE, studentId: STUDENT, submission: first });
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  const soon = await call(e, pass, { action: 'submit', license: LICENSE, studentId: STUDENT, submission: submission() });
  assert.equal(soon.status, 429);
  for (let n = 1; n < ASSESSMENT_STUDENT_OPEN_MAX; n += 1) {
    clock = new Date(clock.getTime() + ASSESSMENT_MIN_GAP_MS + 1);
    assert.equal((await call(e, pass, { action: 'submit', license: LICENSE, studentId: STUDENT, submission: submission() })).status, 200);
  }
  clock = new Date(clock.getTime() + ASSESSMENT_MIN_GAP_MS + 1);
  assert.equal((await call(e, pass, { action: 'submit', license: LICENSE, studentId: STUDENT, submission: submission() })).status, 429);
});

test('the master roster assignment wins over the code; only the owner reassigns; merges only fill a blank', async () => {
  const { secret, bucket, e } = await setup();
  clock = new Date(clock.getTime() + 10 * ASSESSMENT_MIN_GAP_MS);
  const ownerToken = await owner(secret);
  const student = (extra: Partial<BackupStudent>): BackupStudent => ({
    id: 'card-paige', name: 'Paige', belt: 'Blue', division: '', gym: '', photo: '', lastPromotion: '', note: '', checkedIn: false,
    rosterList: 'student', linkedStudentId: STUDENT, ...extra,
  });
  const backup = (row: BackupStudent) =>
    buildRosterBackup({ roster: { version: 1, students: [row], ready: {}, gamePlans: {}, competitionPlans: {} }, cardFile: { cards: {} }, privateNotes: {}, inbox: [] }, { scope: 'shared', now: clock });
  const roster = async (bearer: string, op: string, body: unknown) => {
    const response = await handleGymRoster(
      new Request(`https://advantagebjjtimer.com/api/gym/roster?op=${op}`, { method: 'POST', headers: { authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) }),
      e,
      now,
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  assert.equal((await roster(ownerToken, 'submit', { backup: backup(student({ assignedInstructorId: OTHER_SEAT })) })).status, 200);
  // A later file naming someone else does not move the student.
  await roster(ownerToken, 'submit', { backup: backup(student({ assignedInstructorId: PAIGE_SEAT })) });
  const master = () => bucket.json(`groups/${LICENSE}/roster/master.json`) as { roster: { students: BackupStudent[] } };
  assert.equal(master().roster.students[0].assignedInstructorId, OTHER_SEAT);
  const code = (await connect(e, await seat(secret, PAIGE_SEAT, 'instructors'), 'current')).invite as string;
  const pass = await studentPass(secret);
  const routed = await call(e, pass, { action: 'submit', license: LICENSE, studentId: STUDENT, submission: submission({ via: code }) });
  assert.equal(routed.body.instructorId, OTHER_SEAT);
  assert.equal(routed.body.route, 'roster');
  // A seat cannot reassign. The owner can.
  assert.equal((await roster(await seat(secret, PAIGE_SEAT, 'instructors'), 'assign', { linkedStudentId: STUDENT, instructorId: PAIGE_SEAT })).status, 403);
  const moved = await roster(ownerToken, 'assign', { linkedStudentId: STUDENT, instructorId: PAIGE_SEAT });
  assert.equal(moved.status, 200);
  assert.equal(master().roster.students[0].assignedInstructorId, PAIGE_SEAT);
  assert.equal((await roster(ownerToken, 'assign', { linkedStudentId: 'stu-nobody', instructorId: PAIGE_SEAT })).status, 404);
  // Scores never reach master.json.
  assert.equal(JSON.stringify(master()).includes('"mindset"'), false);
});

test('list and mark: the assigned instructor and the owner only; status moves forward; a reply needs its Coach Sync id', async () => {
  const { secret, e } = await setup();
  clock = new Date(clock.getTime() + 100 * ASSESSMENT_MIN_GAP_MS);
  const code = (await connect(e, await seat(secret, PAIGE_SEAT, 'instructors'), 'current')).invite as string;
  const pass = await studentPass(secret);
  const sent = await call(e, pass, { action: 'submit', license: LICENSE, studentId: STUDENT, submission: submission({ via: code }) });
  const id = sent.body.id as string;
  const paige = await seat(secret, PAIGE_SEAT, 'instructors');
  const marco = await seat(secret, OTHER_SEAT, 'coach');
  const ownerToken = await owner(secret);
  const mine = await call(e, paige, { action: 'list' });
  assert.equal(mine.status, 200);
  assert.equal((mine.body.items as unknown[]).length, 1);
  assert.equal(((await call(e, marco, { action: 'list' })).body.items as unknown[]).length, 0);
  assert.equal((await call(e, await seat(secret, ASSIST_SEAT, 'assistant-coach'), { action: 'list' })).status, 403);
  const all = await call(e, ownerToken, { action: 'list' });
  assert.equal(all.body.owner, true);
  assert.equal((all.body.items as unknown[]).length, 1);
  assert.equal((await call(e, marco, { action: 'mark', id, status: 'seen' })).status, 403);
  assert.equal((await call(e, paige, { action: 'mark', id, status: 'seen' })).body.status, 'seen');
  assert.equal((await call(e, paige, { action: 'mark', id, status: 'responded' })).status, 400);
  const answered = await call(e, paige, { action: 'mark', id, status: 'responded', responseId: 'upd-123' });
  assert.equal(answered.body.status, 'responded');
  assert.equal(answered.body.responseId, 'upd-123');
  assert.equal((await call(e, paige, { action: 'mark', id, status: 'seen' })).body.status, 'responded', 'never moves back');
  assert.equal((await call(e, ownerToken, { action: 'mark', id, status: 'responded', responseId: 'upd-9' })).status, 409);
  assert.equal(((await call(e, paige, { action: 'list' })).body.items as unknown[]).length, 0, 'answered items leave the waiting list');
  const status = await call(e, pass, { action: 'student-status', license: LICENSE, studentId: STUDENT });
  assert.equal((status.body.items as { status: string }[])[0].status, 'responded');
});

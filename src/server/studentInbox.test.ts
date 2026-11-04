import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCoachCompetitionUpdate } from '../lib/coachCompetitionUpdate.ts';
import { buildCoachRankUpdate } from '../lib/coachRankUpdate.ts';
import type { PrivateJwk, PublicJwk } from '../lib/entitlementToken.ts';
import { exportProgressPacket } from '../lib/progress/format.ts';
import { handleStudentInbox, inboxObjectKey, type InboxBucket } from './studentInbox.ts';
import { issueToken, type IssueInput } from './tokenIssue.ts';

const LICENSE = 'license01';
const STUDENT = 'stu-alex';

function memoryBucket(): InboxBucket & { objects: Map<string, string> } {
  const objects = new Map<string, string>();
  return {
    objects,
    async get(key) {
      const text = objects.get(key);
      if (text == null) return null;
      return { text: async () => text };
    },
    async put(key, value) {
      objects.set(key, value);
    },
    async delete(key) {
      objects.delete(key);
    },
    async list({ prefix }) {
      return { objects: [...objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}

async function pair(): Promise<{ secret: string; publicJwk: PublicJwk }> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return {
    secret: JSON.stringify(privateJwk),
    publicJwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y },
  };
}

function packet() {
  const built = buildCoachRankUpdate({
    studentId: STUDENT,
    belt: 'Blue',
    stripeCount: 2,
    promotionDate: '2026-11-03',
    note: '',
    now: 50,
    updateId: 'rank-nov3',
  });
  if (!built.ok) throw new Error(built.error);
  return built.packet;
}

async function token(secret: string, extra: Partial<IssueInput> & Pick<IssueInput, 'tier' | 'src' | 'kind'>): Promise<string> {
  const issued = await issueToken(secret, {
    licenseId: LICENSE,
    grants: ['white', 'student', 'coach', 'pro'],
    deviceId: 'device-1',
    now: new Date('2026-11-03T12:00:00.000Z'),
    subs: { state: 'active' },
    ...extra,
  });
  if (!issued) throw new Error('token was not issued');
  return issued;
}

function call(
  bucket: InboxBucket | undefined,
  secret: string,
  method: string,
  url: string,
  body?: unknown,
  bearer?: string,
) {
  const headers = new Headers({ accept: 'application/json' });
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return handleStudentInbox(
    new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' },
    () => new Date('2026-11-03T15:00:00.000Z'),
  );
}

test('inbox access follows owner, upload seats, and the student pass', async () => {
  const keys = await pair();
  const bucket = memoryBucket();
  const update = packet();
  const owner = await token(keys.secret, { tier: 'pro', src: 'stripe', kind: 'pro' });
  const coach = await token(keys.secret, { tier: 'seat', src: 'seat', kind: 'seat', preset: 'coach', gym: LICENSE, sid: 'seat-coach' });
  const instructor = await token(keys.secret, {
    tier: 'seat',
    src: 'seat',
    kind: 'seat',
    preset: 'instructors',
    gym: LICENSE,
    sid: 'seat-instructor',
  });
  const assistant = await token(keys.secret, {
    tier: 'seat',
    src: 'seat',
    kind: 'seat',
    preset: 'assistant-coach',
    gym: LICENSE,
    sid: 'seat-assistant',
  });
  const director = await token(keys.secret, {
    tier: 'seat',
    src: 'seat',
    kind: 'seat',
    preset: 'program-director',
    gym: LICENSE,
    sid: 'seat-director',
  });
  const otherGym = await token(keys.secret, {
    tier: 'seat',
    src: 'seat',
    kind: 'seat',
    preset: 'coach',
    gym: 'othergym1',
    sid: 'seat-other',
    licenseId: 'othergym1',
  });
  const locked = await token(keys.secret, { tier: 'pro', src: 'stripe', kind: 'pro', subs: { state: 'locked' } });

  const unbound = await call(undefined, keys.secret, 'GET', 'https://advantage.test/api/gym/inbox?probe=1');
  assert.equal(unbound.status, 503);

  const probe = await call(bucket, keys.secret, 'GET', 'https://advantage.test/api/gym/inbox?probe=1');
  assert.equal(probe.status, 200);

  const writeBody = { action: 'write', license: LICENSE, studentId: STUDENT, packet: update };
  assert.equal((await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', writeBody)).status, 403);
  assert.equal((await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', writeBody, assistant)).status, 403);
  assert.equal((await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', writeBody, director)).status, 403);
  assert.equal((await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', writeBody, otherGym)).status, 403);
  assert.equal((await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', writeBody, locked)).status, 403);

  const coachWrite = await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', writeBody, coach);
  assert.equal(coachWrite.status, 200);
  const instructorWrite = await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', writeBody, instructor);
  assert.equal(instructorWrite.status, 200);
  const written = await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', writeBody, owner);
  assert.equal(written.status, 200);
  const writtenBody = (await written.json()) as { studentPass?: string; updateId?: string };
  assert.equal(writtenBody.updateId, 'rank-nov3');
  assert.equal(bucket.objects.size, 1);
  assert.equal(bucket.objects.has(inboxObjectKey(LICENSE, STUDENT, 'rank-nov3')), true);

  const pass = writtenBody.studentPass ?? '';
  const read = await call(
    bucket,
    keys.secret,
    'GET',
    `https://advantage.test/api/gym/inbox?license=${LICENSE}&studentId=${STUDENT}`,
    undefined,
    pass,
  );
  assert.equal(read.status, 200);
  const listed = (await read.json()) as { packets: { updateId?: string }[] };
  assert.equal(listed.packets.length, 1);
  assert.equal(listed.packets[0]?.updateId, 'rank-nov3');

  const otherStudent = await call(
    bucket,
    keys.secret,
    'GET',
    `https://advantage.test/api/gym/inbox?license=${LICENSE}&studentId=stu-other`,
    undefined,
    pass,
  );
  assert.equal(otherStudent.status, 403);
  const ownerRead = await call(
    bucket,
    keys.secret,
    'GET',
    `https://advantage.test/api/gym/inbox?license=${LICENSE}&studentId=${STUDENT}`,
    undefined,
    owner,
  );
  assert.equal(ownerRead.status, 403);
  const studentWrite = await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', writeBody, pass);
  assert.equal(studentWrite.status, 403);

  const marked = JSON.parse(exportProgressPacket(update)) as { checklist?: unknown };
  marked.checklist = [{ id: 'skill-1', met: true }];
  const rejected = await call(
    bucket,
    keys.secret,
    'POST',
    'https://advantage.test/api/gym/inbox',
    { ...writeBody, packet: marked },
    owner,
  );
  assert.equal(rejected.status, 400);
  assert.equal(bucket.objects.size, 1);

  const cleared = await call(
    bucket,
    keys.secret,
    'DELETE',
    `https://advantage.test/api/gym/inbox?license=${LICENSE}&studentId=${STUDENT}&updateId=rank-nov3`,
    undefined,
    pass,
  );
  assert.equal(cleared.status, 200);
  assert.equal(bucket.objects.size, 0);
  const clearedAgain = await call(
    bucket,
    keys.secret,
    'DELETE',
    `https://advantage.test/api/gym/inbox?license=${LICENSE}&studentId=${STUDENT}&updateId=rank-nov3`,
    undefined,
    pass,
  );
  assert.equal(clearedAgain.status, 200);

  const competition = buildCoachCompetitionUpdate({
    studentId: STUDENT,
    tournamentName: 'Mock tournament',
    date: '2026-11-03',
    division: 'Adult Blue',
    weightClass: 'Middle',
    matches: [{ opponent: 'Sam', result: 'win', method: 'sub', note: '' }],
    now: 60,
    updateId: 'comp-nov3',
  });
  if (!competition.ok) throw new Error(competition.error);
  const compWrite = await call(
    bucket,
    keys.secret,
    'POST',
    'https://advantage.test/api/gym/inbox',
    { action: 'write', license: LICENSE, studentId: STUDENT, packet: competition.packet },
    owner,
  );
  assert.equal(compWrite.status, 200);
  assert.equal(bucket.objects.has(inboxObjectKey(LICENSE, STUDENT, 'comp-nov3')), true);
  const guestWrite = await call(
    bucket,
    keys.secret,
    'POST',
    'https://advantage.test/api/gym/inbox',
    { action: 'write', license: LICENSE, studentId: STUDENT, packet: { ...competition.packet, checklist: [] } },
    owner,
  );
  assert.equal(guestWrite.status, 400);
});

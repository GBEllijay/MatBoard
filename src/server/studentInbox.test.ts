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
  // Never delete R2: the object stays; a cleared marker hides it from the list.
  assert.equal(bucket.objects.has(inboxObjectKey(LICENSE, STUDENT, 'rank-nov3')), true);
  const afterClear = await call(
    bucket,
    keys.secret,
    'GET',
    `https://advantage.test/api/gym/inbox?license=${LICENSE}&studentId=${STUDENT}`,
    undefined,
    pass,
  );
  assert.deepEqual(((await afterClear.json()) as { packets: unknown[] }).packets, []);
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

test('every typed sync packet is stored; assistant and director seats are refused', async () => {
  const { everyTestPacket } = await import('../lib/testPackets.ts');
  const keys = await pair();
  const bucket = memoryBucket();
  const owner = await token(keys.secret, { tier: 'pro', src: 'stripe', kind: 'pro' });
  const assistant = await token(keys.secret, {
    tier: 'seat', src: 'seat', kind: 'seat', preset: 'assistant-coach', gym: LICENSE, sid: 'seat-assistant',
  });
  const director = await token(keys.secret, {
    tier: 'seat', src: 'seat', kind: 'seat', preset: 'program-director', gym: LICENSE, sid: 'seat-director',
  });
  for (const update of everyTestPacket(STUDENT)) {
    const body = { action: 'write', license: LICENSE, studentId: STUDENT, packet: update };
    assert.equal((await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', body, assistant)).status, 403);
    assert.equal((await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', body, director)).status, 403);
    const written = await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', body, owner);
    assert.equal(written.status, 200, update.kind);
    const marked = JSON.parse(exportProgressPacket(update)) as Record<string, unknown>;
    marked.checklist = [{ id: 'skill-1', met: true }];
    const refused = await call(bucket, keys.secret, 'POST', 'https://advantage.test/api/gym/inbox', { ...body, packet: marked }, owner);
    assert.equal(refused.status, 400, update.kind);
  }
  assert.equal(bucket.objects.size, 6);
});

test('photo chain: student pass submits, parent stamp required, head coach only, never auto-published, nothing deleted', async () => {
  const { TEST_LOGO } = await import('../lib/testPackets.ts');
  const keys = await pair();
  const bucket = memoryBucket();
  let deletes = 0;
  const watched: InboxBucket = { ...bucket, async delete(key) { deletes += 1; await bucket.delete(key); } };
  const owner = await token(keys.secret, { tier: 'pro', src: 'stripe', kind: 'pro' });
  const coach = await token(keys.secret, { tier: 'seat', src: 'seat', kind: 'seat', preset: 'coach', gym: LICENSE, sid: 'seat-coach' });
  const instructor = await token(keys.secret, {
    tier: 'seat', src: 'seat', kind: 'seat', preset: 'instructors', gym: LICENSE, sid: 'seat-instructor',
  });
  const assistant = await token(keys.secret, {
    tier: 'seat', src: 'seat', kind: 'seat', preset: 'assistant-coach', gym: LICENSE, sid: 'seat-assistant',
  });
  const url = 'https://advantage.test/api/gym/inbox';
  const passed = await call(watched, keys.secret, 'POST', url, { action: 'pass', license: LICENSE, studentId: STUDENT }, owner);
  const pass = ((await passed.json()) as { studentPass: string }).studentPass;
  const base = { schemaVersion: 1, kind: 'student-photo-submission', studentId: STUDENT, submittedAt: 5, image: TEST_LOGO };
  const unstamped = { ...base, photoId: 'photo-1', parent: { required: true } };
  const stamped = { ...base, photoId: 'photo-2', parent: { required: true, approvedAt: 6 } };
  const submit = (submission: unknown, bearer: string) =>
    call(watched, keys.secret, 'POST', url, { action: 'photo-submit', license: LICENSE, studentId: STUDENT, submission }, bearer);
  assert.equal((await submit(stamped, owner)).status, 403);
  assert.equal((await submit(unstamped, pass)).status, 400);
  assert.equal((await submit(stamped, pass)).status, 200);

  const review = (action: string, bearer: string, extra: Record<string, unknown> = {}) =>
    call(watched, keys.secret, 'POST', url, { action, license: LICENSE, studentId: STUDENT, ...extra }, bearer);
  for (const bearer of [coach, assistant, pass]) {
    assert.equal((await review('photo-list', bearer)).status, 403);
    assert.equal((await review('photo-decide', bearer, { photoId: 'photo-2', decision: 'approve' })).status, 403);
    assert.equal((await review('photo-publish', bearer, { photoId: 'photo-2' })).status, 403);
  }
  const listed = (await (await review('photo-list', instructor)).json()) as { photos: unknown[] };
  assert.equal(listed.photos.length, 1);
  assert.equal((await review('photo-publish', owner, { photoId: 'photo-2' })).status, 409);
  assert.equal((await review('photo-decide', instructor, { photoId: 'photo-2', decision: 'approve' })).status, 200);
  // Approving did not publish.
  assert.equal([...bucket.objects.keys()].some((key) => key.includes('/photos/approved/')), false);
  assert.equal((await review('photo-decide', owner, { photoId: 'photo-2', decision: 'decline' })).status, 409);
  assert.equal((await review('photo-publish', owner, { photoId: 'photo-2' })).status, 200);
  assert.equal([...bucket.objects.keys()].some((key) => key.endsWith('/photos/approved/photo-2.json')), true);
  assert.equal((((await (await review('photo-list', owner)).json()) as { photos: unknown[] }).photos).length, 0);
  assert.equal(deletes, 0);
});

test('clearing an inbox item never deletes from R2', async () => {
  const keys = await pair();
  const bucket = memoryBucket();
  let deletes = 0;
  const watched: InboxBucket = { ...bucket, async delete(key) { deletes += 1; await bucket.delete(key); } };
  const owner = await token(keys.secret, { tier: 'pro', src: 'stripe', kind: 'pro' });
  const url = 'https://advantage.test/api/gym/inbox';
  const written = await call(watched, keys.secret, 'POST', url, { action: 'write', license: LICENSE, studentId: STUDENT, packet: packet() }, owner);
  const pass = ((await written.json()) as { studentPass: string }).studentPass;
  const cleared = await call(
    watched, keys.secret, 'DELETE',
    `${url}?license=${LICENSE}&studentId=${STUDENT}&updateId=rank-nov3`, undefined, pass,
  );
  assert.equal(cleared.status, 200);
  assert.equal(deletes, 0);
  assert.equal(bucket.objects.has(inboxObjectKey(LICENSE, STUDENT, 'rank-nov3')), true);
});

test('student → coach: tournament registration and card share are narrow and never delete', async () => {
  const keys = await pair();
  const { TEST_LOGO } = await import('../lib/testPackets.ts');
  const bucket = memoryBucket();
  bucket.delete = async () => {
    throw new Error('nothing may be deleted');
  };
  const url = 'https://advantage.test/api/gym/inbox';
  const owner = await token(keys.secret, { tier: 'pro', src: 'stripe', kind: 'pro' });
  const coach = await token(keys.secret, { tier: 'seat', src: 'seat', kind: 'seat', preset: 'coach', gym: LICENSE, sid: 'seat-coach' });
  const assistant = await token(keys.secret, {
    tier: 'seat', src: 'seat', kind: 'seat', preset: 'assistant-coach', gym: LICENSE, sid: 'seat-assistant',
  });
  const passFor = async (studentId: string) =>
    ((await (await call(bucket, keys.secret, 'POST', url, { action: 'pass', license: LICENSE, studentId }, owner)).json()) as {
      studentPass: string;
    }).studentPass;
  const pass = await passFor(STUDENT);
  const otherPass = await passFor('stu-bo');
  const event = {
    kind: 'student-tournament-registration', v: 1, eventId: 'treg-pan', studentId: STUDENT,
    eventName: 'Pan Kids', date: '2026-12-05', division: 'Juvenile', status: 'entered', sentAt: 10,
  };
  const submit = (body: unknown, bearer?: string) =>
    call(bucket, keys.secret, 'POST', url, { action: 'event-submit', license: LICENSE, studentId: STUDENT, event: body }, bearer);
  assert.equal((await submit(event)).status, 403);
  assert.equal((await submit(event, otherPass)).status, 403);
  assert.equal((await submit(event, coach)).status, 403);
  assert.equal((await submit({ ...event, journal: 'private' }, pass)).status, 400);
  assert.equal((await submit({ ...event, status: 'considering' }, pass)).status, 400);
  assert.equal((await submit(event, pass)).status, 200);

  const list = (bearer: string) =>
    call(bucket, keys.secret, 'POST', url, { action: 'event-list', license: LICENSE, studentId: STUDENT }, bearer);
  assert.equal((await list(assistant)).status, 403);
  assert.equal((await list(pass)).status, 403);
  const listed = (await (await list(coach)).json()) as { events: unknown[] };
  assert.deepEqual(listed.events, [event]);

  const share = {
    kind: 'student-card-share', v: 1, shareId: 'share-1', studentId: STUDENT,
    card: { name: 'Alex Kim', belt: 'Blue', stripes: 2, division: '', gym: 'Advantage' },
    photo: { image: TEST_LOGO, status: 'pending-head-coach' }, parent: { required: false }, sentAt: 20,
  };
  const shareSubmit = (body: unknown) =>
    call(bucket, keys.secret, 'POST', url, { action: 'card-share-submit', license: LICENSE, studentId: STUDENT, share: body });
  assert.equal((await shareSubmit({ ...share, notes: 'x' })).status, 400);
  assert.equal((await shareSubmit({ ...share, card: { ...share.card, journal: 'x' } })).status, 400);
  assert.equal((await shareSubmit({ ...share, photo: { image: TEST_LOGO, status: 'approved' } })).status, 400);
  assert.equal((await shareSubmit({ ...share, parent: { required: true } })).status, 400);
  assert.equal((await shareSubmit(share)).status, 200);

  const shareAction = (action: string, bearer: string, extra: Record<string, unknown> = {}) =>
    call(bucket, keys.secret, 'POST', url, { action, license: LICENSE, studentId: 'coach', ...extra }, bearer);
  assert.equal((await shareAction('card-share-list', assistant)).status, 403);
  assert.equal((await shareAction('card-share-list', pass)).status, 403);
  assert.equal((await shareAction('card-share-decide', assistant, { shareId: 'share-1' })).status, 403);
  const pending = (await (await shareAction('card-share-list', coach)).json()) as { shares: unknown[] };
  assert.deepEqual(pending.shares, [share]);
  assert.equal((await shareAction('card-share-decide', coach, { shareId: 'share-1' })).status, 200);
  const after = (await (await shareAction('card-share-list', coach)).json()) as { shares: unknown[] };
  assert.deepEqual(after.shares, []);
  assert.equal(bucket.objects.has(`groups/${LICENSE}/card-shares/share-1.json`), true);
});

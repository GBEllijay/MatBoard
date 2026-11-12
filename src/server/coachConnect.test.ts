/**
 * Coach connect QR on Advantage Cloud (no Drive folder): the owner issues a
 * signed link, the instructor's phone accepts it and joins the academy by
 * license id, her card lands in the owner's inbox, and the owner's
 * assessment and promotion come back through the existing student inbox.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCoachAssessmentUpdate } from '../lib/coachSync.ts';
import { buildCoachRankUpdate } from '../lib/coachRankUpdate.ts';
import type { PrivateJwk, PublicJwk } from '../lib/entitlementToken.ts';
import { SYNC_ASSESSMENT_AREA_IDS } from '../lib/progress/syncPackets.ts';
import { handleCoachConnect } from './coachConnect.ts';
import { handleStudentInbox, type InboxBucket } from './studentInbox.ts';
import { issueToken, type IssueInput } from './tokenIssue.ts';

const LICENSE = 'gymowner01';
const NOW = new Date('2026-11-11T23:00:00.000Z');
const HER_ID = 'stu-paige';

function memoryBucket(): InboxBucket & { objects: Map<string, string> } {
  const objects = new Map<string, string>();
  return {
    objects,
    async get(key) {
      const text = objects.get(key);
      return text == null ? null : { text: async () => text };
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

async function secretKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return JSON.stringify({ kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y, d: privateJwk.d });
}

async function pass(secret: string, extra: Partial<IssueInput> & Pick<IssueInput, 'tier' | 'src' | 'kind'>): Promise<string> {
  const issued = await issueToken(secret, {
    licenseId: LICENSE,
    grants: ['white', 'student', 'coach', 'pro'],
    deviceId: 'device-1',
    now: NOW,
    subs: { state: 'active' },
    ...extra,
  });
  if (!issued) throw new Error('token was not issued');
  return issued;
}

let sharedBucket: InboxBucket = memoryBucket();

function connect(secret: string, body: unknown, bearer?: string, at: Date = NOW, bucket: InboxBucket | null = sharedBucket) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  return handleCoachConnect(
    new Request('https://advantage.test/api/gym/coach-connect', { method: 'POST', headers, body: JSON.stringify(body) }),
    { ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1', ENTITLEMENTS_DB: null, GYM_MEDIA: bucket ?? undefined },
    () => at,
  );
}

function inbox(bucket: InboxBucket, secret: string, method: string, url: string, body?: unknown, bearer?: string) {
  const headers = new Headers({ accept: 'application/json' });
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return handleStudentInbox(
    new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' },
    () => NOW,
  );
}

test('only an owner with Advantage Cloud gets a coach connect link; no Drive folder involved', async () => {
  sharedBucket = memoryBucket();
  const secret = await secretKey();
  const cloudOwner = await pass(secret, { tier: 'pro', src: 'stripe', kind: 'pro', subs: { state: 'active', cloud: true } });
  const alphaOwner = await pass(secret, { tier: 'pro', src: 'code', kind: 'pro' });
  const stripeProOnly = await pass(secret, { tier: 'pro', src: 'stripe', kind: 'pro' });
  const locked = await pass(secret, { tier: 'pro', src: 'stripe', kind: 'pro', subs: { state: 'locked', cloud: true } });
  const seat = await pass(secret, { tier: 'seat', src: 'seat', kind: 'seat', preset: 'coach', gym: LICENSE, sid: 'seat-1' });

  const issued = await connect(secret, { action: 'issue', gymName: '  Advantage   BJJ ' }, cloudOwner);
  assert.equal(issued.status, 200);
  const body = (await issued.json()) as { invite: string; gym: string; gymName: string };
  assert.equal(body.gym, LICENSE);
  assert.equal(body.gymName, 'Advantage BJJ');
  assert.equal(body.invite.split('.').length, 3);
  assert.equal((await connect(secret, { action: 'issue' }, cloudOwner, NOW, null)).status, 503, 'needs the Cloud bucket');

  assert.equal((await connect(secret, { action: 'issue' }, alphaOwner)).status, 200);
  assert.equal((await connect(secret, { action: 'issue' }, stripeProOnly)).status, 403, 'Pro without Cloud');
  assert.equal((await connect(secret, { action: 'issue' }, locked)).status, 403, 'locked subscription');
  assert.equal((await connect(secret, { action: 'issue' }, seat)).status, 403, 'a seat cannot issue');
  assert.equal((await connect(secret, { action: 'issue' })).status, 401);
  assert.equal((await connect(secret, { action: 'rotate' }, seat)).status, 403, 'a seat cannot rotate');
});

test('one academy-wide code: stable, reusable by every instructor, never uses a seat; rotating retires the old QR', async () => {
  sharedBucket = memoryBucket();
  const bucket = sharedBucket as ReturnType<typeof memoryBucket>;
  const secret = await secretKey();
  const owner = await pass(secret, { tier: 'pro', src: 'code', kind: 'pro' });
  const issue = async (action = 'issue') =>
    ((await (await connect(secret, { action, gymName: 'Advantage BJJ' }, owner)).json()) as { invite: string }).invite;
  const first = await issue();
  const again = await issue();
  const keyOf = (invite: string) => JSON.parse(Buffer.from(invite.split('.')[1], 'base64url').toString()).key as string;
  assert.equal(keyOf(again), keyOf(first), 'showing the QR again (another device) is the same code');
  const keyObjects = () => [...bucket.objects.keys()].filter((key) => key.includes('coach-connect'));
  assert.deepEqual(keyObjects(), [`groups/${LICENSE}/coach-connect/current.json`]);
  assert.equal([...bucket.objects.keys()].some((key) => /seat/i.test(key)), false, 'no seat record');

  // Paige, Augustus, and anyone after them scan the very same code, as many times as needed.
  for (const instructor of ['paige', 'augustus', 'next-hire', 'paige-again']) {
    const res = await connect(secret, { action: 'accept', invite: first });
    assert.equal(res.status, 200, instructor);
    assert.equal(((await res.json()) as { gym: string }).gym, LICENSE);
  }

  const rotated = await issue('rotate');
  assert.notEqual(keyOf(rotated), keyOf(first));
  const old = await connect(secret, { action: 'accept', invite: first });
  assert.equal(old.status, 400, 'rotated code is rejected');
  assert.match(((await old.json()) as { error: string }).error, /replaced/);
  assert.equal((await connect(secret, { action: 'accept', invite: rotated })).status, 200);
  assert.equal(keyOf(await issue()), keyOf(rotated), 'issue now shows the new code');
});

test('accept checks the signature and the current key', async () => {
  sharedBucket = memoryBucket();
  const secret = await secretKey();
  const owner = await pass(secret, { tier: 'pro', src: 'code', kind: 'pro' });
  const { invite } = (await (await connect(secret, { action: 'issue', gymName: 'Advantage BJJ' }, owner)).json()) as { invite: string };

  const ok = await connect(secret, { action: 'accept', invite });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, gym: LICENSE, gymName: 'Advantage BJJ' });

  const [head, payload, sig] = invite.split('.');
  const realKey = JSON.parse(Buffer.from(payload, 'base64url').toString()).key;
  const forged = Buffer.from(JSON.stringify({ typ: 'coach-connect', v: 1, gym: 'someoneelse1', name: 'X', key: realKey })).toString('base64url');
  assert.equal((await connect(secret, { action: 'accept', invite: `${head}.${forged}.${sig}` })).status, 400);
  assert.equal((await connect(secret, { action: 'accept', invite: `${head}.${payload}.x${sig.slice(1)}` })).status, 400);
  const otherSecret = await secretKey();
  assert.equal((await connect(otherSecret, { action: 'accept', invite })).status, 400, 'signed by another key');
  const yearLater = new Date(NOW.getTime() + 400 * 24 * 60 * 60 * 1000);
  assert.equal((await connect(secret, { action: 'accept', invite }, undefined, yearLater)).status, 200, 'reusable, no expiry date');
  // A seat invite or student pass is not a coach connect link.
  const seatPass = await pass(secret, { tier: 'seat', src: 'seat', kind: 'seat', preset: 'coach', gym: LICENSE, sid: 'seat-1' });
  assert.equal((await connect(secret, { action: 'accept', invite: seatPass })).status, 400);
});

test('her card reaches the owner on Cloud; assessment and promotion come back; coach seats review student cards', async () => {
  sharedBucket = memoryBucket();
  const secret = await secretKey();
  const bucket = memoryBucket();
  const owner = await pass(secret, { tier: 'pro', src: 'code', kind: 'pro' });
  const coachSeat = await pass(secret, { tier: 'seat', src: 'seat', kind: 'seat', preset: 'coach', gym: LICENSE, sid: 'seat-paige' });
  const { invite } = (await (await connect(secret, { action: 'issue', gymName: 'Advantage BJJ' }, owner)).json()) as { invite: string };
  const accepted = (await (await connect(secret, { action: 'accept', invite })).json()) as { gym: string };
  const url = 'https://advantage.test/api/gym/inbox';

  // Instructor's own card → owner's card-share inbox, by the license id from the QR.
  const share = {
    kind: 'student-card-share', v: 1, shareId: 'share-paige', studentId: HER_ID,
    card: { name: 'Paige', belt: 'Purple', stripes: 2, division: '', gym: 'Advantage BJJ' },
    photo: null, parent: { required: false }, sentAt: 10,
  };
  const sent = await inbox(bucket, secret, 'POST', url, { action: 'card-share-submit', license: accepted.gym, studentId: HER_ID, share });
  assert.equal(sent.status, 200);
  const listed = (await (await inbox(bucket, secret, 'POST', url, { action: 'card-share-list', license: LICENSE, studentId: 'coach' }, owner)).json()) as {
    shares: { shareId: string }[];
  };
  assert.deepEqual(listed.shares.map((row) => row.shareId), ['share-paige']);

  // A student's card on the same gym is listed for her Coach seat too.
  const student = { ...share, shareId: 'share-alex', studentId: 'stu-alex', card: { ...share.card, name: 'Alex', belt: 'White' } };
  assert.equal((await inbox(bucket, secret, 'POST', url, { action: 'card-share-submit', license: LICENSE, studentId: 'stu-alex', share: student })).status, 200);
  const seatList = (await (await inbox(bucket, secret, 'POST', url, { action: 'card-share-list', license: LICENSE, studentId: 'coach' }, coachSeat)).json()) as {
    shares: { shareId: string }[];
  };
  assert.deepEqual(seatList.shares.map((row) => row.shareId).sort(), ['share-alex', 'share-paige']);
  const scores = Object.fromEntries(SYNC_ASSESSMENT_AREA_IDS.map((id) => [id, 3]));
  const toAlex = buildCoachAssessmentUpdate({ studentId: 'stu-alex', date: '2026-11-11', scores, now: 30, updateId: 'assess-alex' });
  if (!toAlex.ok) throw new Error(toAlex.error);
  assert.equal((await inbox(bucket, secret, 'POST', url, { action: 'write', license: LICENSE, studentId: 'stu-alex', packet: toAlex.packet }, coachSeat)).status, 200);

  // Owner → instructor: assessment and a promotion, read back with her student pass.
  const assessment = buildCoachAssessmentUpdate({ studentId: HER_ID, date: '2026-11-11', scores, now: 40, updateId: 'assess-paige' });
  if (!assessment.ok) throw new Error(assessment.error);
  const promotion = buildCoachRankUpdate({ studentId: HER_ID, belt: 'Brown', stripeCount: 0, promotionDate: '2026-11-11', now: 50, updateId: 'promo-paige' });
  if (!promotion.ok) throw new Error(promotion.error);
  const wrote = await inbox(bucket, secret, 'POST', url, { action: 'write', license: LICENSE, studentId: HER_ID, packet: assessment.packet }, owner);
  assert.equal(wrote.status, 200);
  const promoted = await inbox(bucket, secret, 'POST', url, { action: 'write', license: LICENSE, studentId: HER_ID, packet: promotion.packet }, owner);
  assert.equal(promoted.status, 200);
  const herPass = ((await promoted.json()) as { studentPass: string }).studentPass;
  const read = await inbox(bucket, secret, 'GET', `${url}?license=${LICENSE}&studentId=${HER_ID}`, undefined, herPass);
  assert.equal(read.status, 200);
  const packets = ((await read.json()) as { packets: { kind: string; updateId: string }[] }).packets;
  assert.deepEqual(packets.map((row) => `${row.kind}:${row.updateId}`).sort(), [
    'coach-assessment-update:assess-paige',
    'coach-rank-update:promo-paige',
  ]);
});

test('Instructor Edition: a seat on this gym reads the same academy-wide code, never makes or replaces it', async () => {
  sharedBucket = memoryBucket();
  const bucket = sharedBucket as ReturnType<typeof memoryBucket>;
  const secret = await secretKey();
  const owner = await pass(secret, { tier: 'pro', src: 'code', kind: 'pro' });
  const seatCloud = await pass(secret, {
    tier: 'seat', src: 'seat', kind: 'seat', preset: 'coach', gym: LICENSE, sid: 'seat-paige', subs: { state: 'active', cloud: true },
  });
  const seatNoCloud = await pass(secret, { tier: 'seat', src: 'seat', kind: 'seat', preset: 'coach', gym: LICENSE, sid: 'seat-x' });
  const lockedSeat = await pass(secret, {
    tier: 'seat', src: 'seat', kind: 'seat', preset: 'coach', gym: LICENSE, sid: 'seat-y', subs: { state: 'locked', cloud: true },
  });
  const keyOf = (invite: string) => JSON.parse(Buffer.from(invite.split('.')[1], 'base64url').toString()).key as string;

  const before = await connect(secret, { action: 'current' }, seatCloud);
  assert.equal(before.status, 404, 'nothing until the owner shows it');
  assert.equal(((await before.json()) as { reason: string }).reason, 'none');
  assert.equal(bucket.objects.size, 0, 'a seat read made no code');

  const ownerInvite = ((await (await connect(secret, { action: 'issue', gymName: 'Advantage BJJ' }, owner)).json()) as { invite: string }).invite;
  const seatRead = await connect(secret, { action: 'current', gymName: 'Wrong Name' }, seatCloud);
  assert.equal(seatRead.status, 200);
  const seatBody = (await seatRead.json()) as { invite: string; gymName: string; owner: boolean };
  assert.equal(keyOf(seatBody.invite), keyOf(ownerInvite), 'same code as Binders');
  assert.equal(seatBody.gymName, 'Advantage BJJ', 'owner-set gym name');
  assert.equal(seatBody.owner, false);
  assert.equal((await connect(secret, { action: 'accept', invite: seatBody.invite })).status, 200);

  assert.equal((await connect(secret, { action: 'current' }, seatNoCloud)).status, 403, 'academy without Cloud');
  assert.equal((await connect(secret, { action: 'current' }, lockedSeat)).status, 403);
  assert.equal((await connect(secret, { action: 'rotate' }, seatCloud)).status, 403, 'seat cannot replace');
  assert.equal((await connect(secret, { action: 'issue' }, seatCloud)).status, 403, 'seat cannot make');
  const ownerCurrent = (await (await connect(secret, { action: 'current' }, owner)).json()) as { invite: string; owner: boolean };
  assert.equal(keyOf(ownerCurrent.invite), keyOf(ownerInvite));
  assert.equal(ownerCurrent.owner, true);

  // After the owner replaces it, the seat shows the new code and the old one is refused.
  const rotated = ((await (await connect(secret, { action: 'rotate' }, owner)).json()) as { invite: string }).invite;
  const seatAfter = (await (await connect(secret, { action: 'current' }, seatCloud)).json()) as { invite: string; gymName: string };
  assert.equal(keyOf(seatAfter.invite), keyOf(rotated));
  assert.equal(seatAfter.gymName, 'Advantage BJJ', 'name kept across Replace');
  assert.equal((await connect(secret, { action: 'accept', invite: seatBody.invite })).status, 400);
});

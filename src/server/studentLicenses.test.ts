import assert from 'node:assert/strict';
import test from 'node:test';
import { readSignedJson, signJson, verifyToken, type PrivateJwk, type PublicJwk } from '../lib/entitlementToken.ts';
import { STUDENT_CLOUD_REFUSED, STUDENT_LICENSE_REVOKED_MESSAGE, studentCloudPathAllowed } from '../lib/studentLicensePool.ts';
import { memoryEmailSender } from './emailSender.ts';
import { handleGymCloud, type GymMediaBucket } from './gymCloud.ts';
import { handleGymRoster } from './gymRoster.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { handleRestoreRequest, handleRestoreVerify } from './restoreAccess.ts';
import { ensureHalfOffCode } from './proBundle.ts';
import { handleStudentInbox, type InboxBucket } from './studentInbox.ts';
import {
  handleStudentLicenseClaim,
  handleStudentLicenseIssue,
  handleStudentLicenseList,
  handleStudentLicenseRevoke,
} from './studentLicenses.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { handleTokenRefresh } from './tokenRefresh.ts';
import { issueToken } from './tokenIssue.ts';
import type { D1Database } from './d1.ts';

const PEPPER = 'test-pepper-student-license';
const NOW = new Date('2026-11-04T21:00:00.000Z');

async function keys(): Promise<{ secret: string; publicJwk: PublicJwk }> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } };
}

function envOf(secret: string) {
  return { ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1', CODE_HASH_PEPPER: PEPPER };
}

async function ownerToken(secret: string, licenseId: string, grants: Array<'pro' | 'coach' | 'student' | 'white'> = ['pro', 'coach', 'student', 'white']) {
  const token = await issueToken(secret, {
    licenseId,
    grants,
    tier: grants.includes('pro') ? 'pro' : 'coach',
    src: 'stripe',
    deviceId: 'owner-phone',
    now: NOW,
    kind: grants.includes('pro') ? 'pro' : 'onetime',
    subs: grants.includes('pro') ? { state: 'active' } : undefined,
  });
  if (!token) throw new Error('owner token');
  return token;
}

async function seatToken(secret: string, gym: string, seatId: string) {
  const token = await issueToken(secret, {
    licenseId: gym,
    grants: ['pro', 'coach', 'student', 'white'],
    tier: 'seat',
    src: 'seat',
    deviceId: 'seat-phone',
    now: NOW,
    kind: 'seat',
    gym,
    sid: seatId,
    preset: 'coach',
    subs: { state: 'active' },
  });
  if (!token) throw new Error('seat token');
  return token;
}

function post(url: string, body: unknown): Request {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

async function issue(db: D1Database, secret: string, token: string) {
  const response = await handleStudentLicenseIssue(post('http://localhost/api/student-licenses/issue', { token }), envOf(secret), db, () => NOW);
  const body = (await response.json()) as { ok?: boolean; code?: string; left?: number; error?: string };
  return { status: response.status, body };
}

async function claim(db: D1Database, secret: string, code: string, deviceId: string, email = 'student@gym.test') {
  const response = await handleStudentLicenseClaim(
    post('http://localhost/api/student-licenses/claim', { code, deviceId, email }),
    envOf(secret),
    db,
    () => NOW,
  );
  const body = (await response.json()) as {
    ok?: boolean;
    token?: string;
    error?: string;
    gymId?: string;
    cloud?: boolean;
    studentPass?: string;
    grants?: string[];
  };
  return { status: response.status, body };
}

function memoryInbox(): InboxBucket & { objects: Map<string, string> } {
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

test('owner issues from a pool of 5, a seat cannot, and one claim is single-use', async () => {
  const pair = await keys();
  const db = sqliteD1();
  const gym = 'gym-license-01';
  const token = await ownerToken(pair.secret, gym);
  const first = await issue(db, pair.secret, token);
  assert.equal(first.status, 200);
  assert.equal(first.body.left, 4);
  assert.match(first.body.code ?? '', /^[a-f0-9]{64}$/);

  const seat = await seatToken(pair.secret, gym, 'seat-1');
  const denied = await issue(db, pair.secret, seat);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, 'Only the gym owner can issue a free Student license.');
  const coach = await ownerToken(pair.secret, 'coach-license-1', ['coach', 'student', 'white']);
  const coachDenied = await issue(db, pair.secret, coach);
  assert.equal(coachDenied.status, 403);

  const code = first.body.code ?? '';
  const missingEmail = await handleStudentLicenseClaim(
    post('http://localhost/api/student-licenses/claim', { code, deviceId: 'phone-a' }),
    envOf(pair.secret),
    db,
    () => NOW,
  );
  assert.equal(missingEmail.status, 400);
  const stillIssued = await db.prepare(`SELECT status FROM student_codes WHERE code = ?`).bind(code).first<{ status: string }>();
  assert.equal(stillIssued?.status, 'issued');

  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
  const claimed = await claim(db, pair.secret, code, 'phone-a', 'Student@Gym.test');
  console.log = original;
  assert.equal(claimed.status, 200);
  assert.equal(logs.some((line) => /student@gym\.test/i.test(line)), false);
  const pass = await verifyToken(claimed.body.token ?? '', [{ kid: 'k1', jwk: pair.publicJwk }]);
  assert.equal(pass?.tier, 'student');
  assert.equal(pass?.preset, 'student-license');
  assert.equal(pass?.gym, gym);
  assert.equal(pass?.grants.includes('pro'), false);
  assert.equal(pass?.grants.includes('student'), true);
  assert.equal(pass?.grants.includes('white'), true);

  const again = await claim(db, pair.secret, code, 'phone-a', 'Student@Gym.test');
  assert.equal(again.status, 200);
  const againPass = await verifyToken(again.body.token ?? '', [{ kid: 'k1', jwk: pair.publicJwk }]);
  assert.equal(againPass?.sub, pass?.sub);
  const grants = await db.prepare(`SELECT COUNT(*) AS total FROM grants WHERE source_ref = ?`).bind(`student-code:${code}`).first<{ total: number }>();
  assert.equal(Number(grants?.total), 1);

  const other = await claim(db, pair.secret, code, 'phone-b', 'other@gym.test');
  assert.equal(other.status, 409);
  assert.equal(other.body.error, 'This free Student license was already claimed.');
  const occupied = await db
    .prepare(`SELECT COUNT(*) AS total FROM student_codes WHERE license_id = ? AND status IN ('issued', 'claimed')`)
    .bind(gym)
    .first<{ total: number }>();
  assert.equal(Number(occupied?.total), 1);
});

test('revoke returns an unclaimed or claimed license to the pool, and the code stays dead', async () => {
  const pair = await keys();
  const db = sqliteD1();
  const gym = 'gym-license-02';
  const token = await ownerToken(pair.secret, gym);
  await ensureHalfOffCode(db, gym, NOW);
  const codes: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const issued = await issue(db, pair.secret, token);
    assert.equal(issued.status, 200, String(issued.body.error));
    codes.push(issued.body.code ?? '');
  }
  const full = await issue(db, pair.secret, token);
  assert.equal(full.status, 409);
  assert.equal(full.body.left, 0);
  const listedFull = await handleStudentLicenseList(post('http://localhost/api/student-licenses/list', { token }), envOf(pair.secret), db);
  const fullBody = (await listedFull.json()) as { left: number; halfOff?: { usesLeft: number; code: string } };
  assert.equal(fullBody.left, 0);
  assert.equal(fullBody.halfOff?.usesLeft, 100);
  assert.match(fullBody.halfOff?.code ?? '', /^ADVH-[A-Z0-9]{12}$/);

  const unclaimed = await handleStudentLicenseRevoke(
    post('http://localhost/api/student-licenses/revoke', { token, code: codes[0] }),
    envOf(pair.secret),
    db,
    () => NOW,
  );
  const unclaimedBody = (await unclaimed.json()) as { ok?: boolean; left?: number; claimed?: boolean };
  assert.equal(unclaimed.status, 200);
  assert.equal(unclaimedBody.claimed, false);
  assert.equal(unclaimedBody.left, 1);
  const dead = await claim(db, pair.secret, codes[0], 'phone-dead');
  assert.equal(dead.status, 403);
  assert.equal(dead.body.error, STUDENT_LICENSE_REVOKED_MESSAGE);
  const replacement = await issue(db, pair.secret, token);
  assert.equal(replacement.status, 200);
  assert.equal(replacement.body.left, 0);

  const live = await claim(db, pair.secret, codes[1], 'phone-live', 'live@gym.test');
  assert.equal(live.status, 200);
  const before = await db
    .prepare(`SELECT status, revoked_at AS revokedAt FROM grants WHERE source_ref = ?`)
    .bind(`student-code:${codes[1]}`)
    .first<{ status: string; revokedAt: string | null }>();
  assert.equal(before?.status, 'active');
  assert.equal(before?.revokedAt, null);
  const claimedRevoke = await handleStudentLicenseRevoke(
    post('http://localhost/api/student-licenses/revoke', { token, code: codes[1] }),
    envOf(pair.secret),
    db,
    () => NOW,
  );
  const claimedBody = (await claimedRevoke.json()) as { left?: number; claimed?: boolean };
  assert.equal(claimedRevoke.status, 200);
  assert.equal(claimedBody.claimed, true);
  assert.equal(claimedBody.left, 1);
  const after = await db
    .prepare(`SELECT status, revoked_at AS revokedAt FROM grants WHERE source_ref = ?`)
    .bind(`student-code:${codes[1]}`)
    .first<{ status: string; revokedAt: string | null }>();
  assert.equal(after?.status, 'inactive');
  assert.ok(after?.revokedAt);
  const reclaimed = await claim(db, pair.secret, codes[1], 'phone-live', 'live@gym.test');
  assert.equal(reclaimed.status, 403);
  assert.equal(reclaimed.body.error, STUDENT_LICENSE_REVOKED_MESSAGE);
  const fresh = await issue(db, pair.secret, token);
  assert.equal(fresh.status, 200);
  assert.notEqual(fresh.body.code, codes[1]);

  const seat = await seatToken(pair.secret, gym, 'seat-2');
  await db.prepare(`INSERT INTO seats (id, gym_license_id, preset, status, created_at) VALUES ('seat-2', ?, 'coach', 'claimed', ?)`).bind(gym, NOW.toISOString()).run();
  const seatRevoke = await handleStudentLicenseRevoke(
    post('http://localhost/api/student-licenses/revoke', { token: seat, code: codes[2] }),
    envOf(pair.secret),
    db,
    () => NOW,
  );
  assert.equal(seatRevoke.status, 403);
  const seatList = await handleStudentLicenseList(post('http://localhost/api/student-licenses/list', { token: seat }), envOf(pair.secret), db);
  const seatBody = (await seatList.json()) as { role?: string; halfOff?: unknown; claims?: { code?: string; status: string }[] };
  assert.equal(seatBody.role, 'seat');
  assert.equal(seatBody.halfOff, undefined);
  assert.equal(seatBody.claims?.some((row) => row.status === 'issued' && row.code), true);
  assert.equal(seatBody.claims?.some((row) => row.status === 'claimed' && row.code), false);
});

test('a claimed email restores on a new device, and a revoked license does not', async () => {
  const pair = await keys();
  const db = sqliteD1();
  const gym = 'gym-license-03';
  const token = await ownerToken(pair.secret, gym);
  const issued = await issue(db, pair.secret, token);
  const claimed = await claim(db, pair.secret, issued.body.code ?? '', 'safari-phone', 'student@gym.test');
  assert.equal(claimed.status, 200);
  const sender = memoryEmailSender();
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
  const restoreEnv = { ...envOf(pair.secret), TURNSTILE_SECRET_KEY: 'turnstile-test' };
  const requested = await handleRestoreRequest(
    post('http://localhost/api/restore/request', { email: 'Student@Gym.test', turnstileToken: 'ok' }),
    restoreEnv,
    db,
    sender,
    fetchImpl,
    () => NOW,
  );
  assert.equal(requested.status, 200);
  const stranger = await handleRestoreRequest(
    post('http://localhost/api/restore/request', { email: 'nobody@gym.test', turnstileToken: 'ok' }),
    restoreEnv,
    db,
    sender,
    fetchImpl,
    () => NOW,
  );
  assert.equal(stranger.status, 200);
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0]?.to, 'Student@Gym.test');
  const mailed = sender.sent[0]?.text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
  const challengeId = ((await requested.json()) as { challengeId: string }).challengeId;
  const restored = await handleRestoreVerify(
    post('http://localhost/api/restore/verify', { challengeId, code: mailed, deviceId: 'home-screen' }),
    restoreEnv,
    db,
    () => NOW,
  );
  assert.equal(restored.status, 200);
  const restoredBody = (await restored.json()) as { token?: string; grants?: string[]; studentPass?: string };
  const restoredClaims = await verifyToken(restoredBody.token ?? '', [{ kid: 'k1', jwk: pair.publicJwk }]);
  const original = await verifyToken(claimed.body.token ?? '', [{ kid: 'k1', jwk: pair.publicJwk }]);
  assert.equal(restoredClaims?.sub, original?.sub);
  assert.notEqual(restoredClaims?.did, original?.did);
  assert.equal(restoredClaims?.did, 'home-screen');
  assert.equal(restoredClaims?.tier, 'student');
  assert.equal(restoredClaims?.preset, 'student-license');
  assert.equal(restoredClaims?.gym, gym);
  assert.equal(restoredBody.grants?.includes('student'), true);
  assert.equal(restoredBody.grants?.includes('pro'), false);

  const refreshed = await handleTokenRefresh(
    post('http://localhost/api/token/refresh', { token: restoredBody.token }),
    envOf(pair.secret),
    db,
    () => new Date(NOW.getTime() + 60_000),
  );
  assert.equal(refreshed.status, 200);
  const refreshedBody = (await refreshed.json()) as { grants?: string[] };
  assert.equal(refreshedBody.grants?.includes('student'), true);
  assert.equal(refreshedBody.grants?.includes('pro'), false);

  await handleStudentLicenseRevoke(
    post('http://localhost/api/student-licenses/revoke', { token, code: issued.body.code }),
    envOf(pair.secret),
    db,
    () => NOW,
  );
  const afterRevoke = await handleTokenRefresh(
    post('http://localhost/api/token/refresh', { token: claimed.body.token }),
    envOf(pair.secret),
    db,
    () => new Date(NOW.getTime() + 120_000),
  );
  assert.equal(afterRevoke.status, 401);
  const sender2 = memoryEmailSender();
  const requestedAgain = await handleRestoreRequest(
    post('http://localhost/api/restore/request', { email: 'student@gym.test', turnstileToken: 'ok' }),
    restoreEnv,
    db,
    sender2,
    fetchImpl,
    () => new Date(NOW.getTime() + 120_000),
  );
  const code2 = sender2.sent[0]?.text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
  const challenge2 = ((await requestedAgain.json()) as { challengeId: string }).challengeId;
  const denied = await handleRestoreVerify(
    post('http://localhost/api/restore/verify', { challengeId: challenge2, code: code2, deviceId: 'home-screen-2' }),
    restoreEnv,
    db,
    () => new Date(NOW.getTime() + 120_000),
  );
  assert.equal(denied.status, 400);
  assert.equal(((await denied.json()) as { token?: string }).token, undefined);
});

test('restore of another purchase is unchanged, and a student pass cannot read coach cloud', async () => {
  const pair = await keys();
  const db = sqliteD1();
  await recordPurchase(db, {
    email: 'white@gym.test',
    product: 'advantage-white',
    source: 'stripe_payment',
    sourceRef: 'cs_white_student_pool',
    sessionId: 'cs_white_student_pool',
    pepper: PEPPER,
    now: NOW,
  });
  await recordPurchase(db, {
    email: 'pro@gym.test',
    product: 'advantage-pro',
    source: 'stripe_payment',
    sourceRef: 'cs_pro_student_pool',
    sessionId: 'cs_pro_student_pool',
    pepper: PEPPER,
    now: NOW,
  });
  const gym = 'gym-license-04';
  const token = await ownerToken(pair.secret, gym);
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES ('cloud-grant', ?, 'advantage-pro', 'code', 'code:cloud-grant', 'active', ?)`,
    )
    .bind(gym, NOW.toISOString())
    .run();
  const issued = await issue(db, pair.secret, token);
  const claimed = await claim(db, pair.secret, issued.body.code ?? '', 'phone-cloud', 'pro@gym.test');
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.cloud, true);
  assert.equal(typeof claimed.body.studentPass, 'string');
  const studentClaims = await verifyToken(claimed.body.token ?? '', [{ kid: 'k1', jwk: pair.publicJwk }]);
  assert.equal(studentClaims?.grants.includes('pro'), false);
  const refreshed = await handleTokenRefresh(
    post('http://localhost/api/token/refresh', { token: claimed.body.token }),
    envOf(pair.secret),
    db,
    () => new Date(NOW.getTime() + 1000),
  );
  const refreshedBody = (await refreshed.json()) as { grants?: string[] };
  assert.equal(refreshed.status, 200);
  assert.equal(refreshedBody.grants?.includes('pro'), false);
  assert.equal(refreshedBody.grants?.includes('student'), true);

  const sender = memoryEmailSender();
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
  const restoreEnv = { ...envOf(pair.secret), TURNSTILE_SECRET_KEY: 'turnstile-test' };
  const whiteRequest = await handleRestoreRequest(
    post('http://localhost/api/restore/request', { email: 'white@gym.test', turnstileToken: 'ok' }),
    restoreEnv,
    db,
    sender,
    fetchImpl,
    () => NOW,
  );
  const whiteCode = sender.sent[0]?.text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
  const whiteChallenge = ((await whiteRequest.json()) as { challengeId: string }).challengeId;
  const whiteRestore = await handleRestoreVerify(
    post('http://localhost/api/restore/verify', { challengeId: whiteChallenge, code: whiteCode, deviceId: 'white-phone' }),
    restoreEnv,
    db,
    () => NOW,
  );
  assert.equal(whiteRestore.status, 200);
  const whiteBody = (await whiteRestore.json()) as { token?: string; grants?: string[] };
  const whiteClaims = await verifyToken(whiteBody.token ?? '', [{ kid: 'k1', jwk: pair.publicJwk }]);
  assert.equal(whiteClaims?.preset, undefined);
  assert.equal(whiteClaims?.gym, undefined);
  assert.equal(whiteBody.grants?.includes('white'), true);
  assert.equal(whiteBody.grants?.includes('student'), false);
  assert.equal(whiteBody.grants?.includes('pro'), false);

  let touched = false;
  const trap = new Proxy(
    {},
    {
      get() {
        return () => {
          touched = true;
          throw new Error('student read coach data');
        };
      },
    },
  ) as GymMediaBucket;
  const cloudEnv = { GYM_MEDIA: trap, ENTITLEMENT_SIGNING_KEY: pair.secret, ENTITLEMENT_KEY_ID: 'k1', ENTITLEMENTS_DB: db };
  const cloud = await handleGymCloud(
    new Request('http://localhost/api/gym/cloud?op=list&purpose=lesson&date=2026-11-04', {
      headers: { authorization: `Bearer ${claimed.body.token}` },
    }),
    cloudEnv,
    () => NOW,
  );
  assert.equal(cloud.status, 403);
  const cloudBody = (await cloud.json()) as { error?: string };
  assert.equal(cloudBody.error, STUDENT_CLOUD_REFUSED);
  const roster = await handleGymRoster(
    new Request('http://localhost/api/gym/roster?op=private', { headers: { authorization: `Bearer ${claimed.body.token}` } }),
    cloudEnv,
    () => NOW,
  );
  assert.equal(roster.status, 403);
  assert.equal(touched, false);
  assert.equal(studentCloudPathAllowed('lessons/current/2026-W45/media/2026-11-04/clip.mp4', studentClaims?.sub ?? ''), false);
  assert.equal(studentCloudPathAllowed('roster/private/owner.json', studentClaims?.sub ?? ''), false);

  const inbox = memoryInbox();
  inbox.objects.set('groups/gym-license-04/lessons/current/2026-W45/2026-11-04.json', '{"note":"coach-only-lesson"}');
  const read = await handleStudentInbox(
    new Request(`http://localhost/api/gym/inbox?license=${gym}&studentId=${encodeURIComponent(studentClaims?.sub ?? '')}`, {
      headers: { authorization: `Bearer ${claimed.body.studentPass}` },
    }),
    { GYM_MEDIA: inbox, ENTITLEMENT_SIGNING_KEY: pair.secret, ENTITLEMENT_KEY_ID: 'k1', ENTITLEMENTS_DB: db },
    () => NOW,
  );
  assert.equal(read.status, 200);
  const readBody = await read.text();
  assert.equal(readBody.includes('coach-only-lesson'), false);
  const other = await handleStudentInbox(
    new Request(`http://localhost/api/gym/inbox?license=${gym}&studentId=other-student`, {
      headers: { authorization: `Bearer ${claimed.body.studentPass}` },
    }),
    { GYM_MEDIA: inbox, ENTITLEMENT_SIGNING_KEY: pair.secret, ENTITLEMENT_KEY_ID: 'k1', ENTITLEMENTS_DB: db },
    () => NOW,
  );
  assert.equal(other.status, 403);

  await handleStudentLicenseRevoke(
    post('http://localhost/api/student-licenses/revoke', { token, code: issued.body.code }),
    envOf(pair.secret),
    db,
    () => NOW,
  );
  const closed = await handleStudentInbox(
    new Request(`http://localhost/api/gym/inbox?license=${gym}&studentId=${encodeURIComponent(studentClaims?.sub ?? '')}`, {
      headers: { authorization: `Bearer ${claimed.body.studentPass}` },
    }),
    { GYM_MEDIA: inbox, ENTITLEMENT_SIGNING_KEY: pair.secret, ENTITLEMENT_KEY_ID: 'k1', ENTITLEMENTS_DB: db },
    () => NOW,
  );
  assert.equal(closed.status, 403);
  const proGrant = await db
    .prepare(`SELECT status, revoked_at AS revokedAt FROM grants WHERE source_ref = 'cs_pro_student_pool'`)
    .first<{ status: string; revokedAt: string | null }>();
  assert.equal(proGrant?.status, 'active');
  assert.equal(proGrant?.revokedAt, null);

  const plain = await signJson(
    'k1',
    { typ: 'student-inbox', v: 1, gym, studentId: 'stu-alex', exp: Math.floor(NOW.getTime() / 1000) + 3600 },
    JSON.parse(pair.secret) as PrivateJwk,
  );
  const plainRead = await handleStudentInbox(
    new Request(`http://localhost/api/gym/inbox?license=${gym}&studentId=stu-alex`, { headers: { authorization: `Bearer ${plain}` } }),
    { GYM_MEDIA: inbox, ENTITLEMENT_SIGNING_KEY: pair.secret, ENTITLEMENT_KEY_ID: 'k1', ENTITLEMENTS_DB: db },
    () => NOW,
  );
  assert.equal(plainRead.status, 200);
});

test('signed student-invite links claim Student Edition only, and a sixth issue is refused', async () => {
  const pair = await keys();
  const db = sqliteD1();
  const gym = 'gym-license-signed';
  const token = await ownerToken(pair.secret, gym);
  const first = await issue(db, pair.secret, token);
  assert.equal(first.status, 200);
  assert.equal(first.body.left, 4);
  const invite = (first.body as { invite?: string }).invite ?? '';
  assert.match(invite, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const payload = (await readSignedJson(invite, [{ kid: 'k1', jwk: pair.publicJwk }])) as {
    typ?: string;
    code?: string;
    gym?: string;
  };
  assert.equal(payload?.typ, 'student-invite');
  assert.equal(payload?.code, first.body.code);
  assert.equal(payload?.gym, gym);

  const claimed = await claim(db, pair.secret, invite, 'phone-signed', 'signed@gym.test');
  assert.equal(claimed.status, 200, String(claimed.body.error));
  const pass = await verifyToken(claimed.body.token ?? '', [{ kid: 'k1', jwk: pair.publicJwk }]);
  assert.equal(pass?.tier, 'student');
  assert.equal(pass?.grants.includes('student'), true);
  assert.equal(pass?.grants.includes('pro'), false);
  assert.equal(pass?.grants.includes('coach'), false);
  assert.equal(claimed.body.gymId, gym);

  const occupied = await db
    .prepare(`SELECT COUNT(*) AS total FROM student_codes WHERE license_id = ? AND status IN ('issued', 'claimed')`)
    .bind(gym)
    .first<{ total: number }>();
  assert.equal(Number(occupied?.total), 1);

  for (let index = 0; index < 4; index += 1) {
    const next = await issue(db, pair.secret, token);
    assert.equal(next.status, 200, String(next.body.error));
  }
  const sixth = await issue(db, pair.secret, token);
  assert.equal(sixth.status, 409);
  assert.equal(sixth.body.left, 0);
  assert.equal(sixth.body.error, 'No free Student licenses left.');
});

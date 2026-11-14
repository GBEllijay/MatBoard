import assert from 'node:assert/strict';
import test from 'node:test';
import { readSignedJson, verifyToken, type PrivateJwk, type PublicJwk } from '../lib/entitlementToken.ts';
import { readCoachConnectClaim } from './coachConnect.ts';
import { memoryEmailSender } from './emailSender.ts';
import { readInviteSelection } from './inviteSelections.ts';
import {
  CODE_FAILED,
  INVITE_FAILED,
  LOGIN_FAILED,
  LOGIN_LOCKED,
  handleLogin,
  maskEmail,
  type LoginEnv,
} from './loginAccount.ts';
import { hashPassword, needsRehash, verifyPassword } from './password.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { handleRestoreRequest } from './restoreAccess.ts';
import { handleSeatIssue, handleSeatPermissions, handleSeatRevoke, handleSeatSync } from './seats.ts';
import { handleStudentLicenseIssue, handleStudentLicenseRevoke } from './studentLicenses.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { issueToken } from './tokenIssue.ts';
import type { D1Database } from './d1.ts';
import type { InboxBucket } from './studentInbox.ts';

/** Isolated fixtures: in-memory SQLite, memory email sender, no Stripe, no Resend, no production. */

const PEPPER = 'login-test-pepper';
const NOW = new Date('2026-11-14T11:00:00.000Z');
const ORIGIN = 'https://advantagebjjtimer.com';

async function keys(): Promise<{ secret: string; publicJwk: PublicJwk }> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } };
}

function memoryBucket(): InboxBucket & { objects: Map<string, string> } {
  const objects = new Map<string, string>();
  return {
    objects,
    async get(key: string) {
      const text = objects.get(key);
      return text == null ? null : { text: async () => text };
    },
    async put(key: string, value: string) {
      objects.set(key, String(value));
      return {};
    },
  } as unknown as InboxBucket & { objects: Map<string, string> };
}

type Fixture = { db: D1Database; env: LoginEnv; secret: string; publicJwk: PublicJwk; bucket: ReturnType<typeof memoryBucket> };

async function fixture(): Promise<Fixture> {
  const db = sqliteD1();
  const pair = await keys();
  const bucket = memoryBucket();
  const env: LoginEnv = {
    CODE_HASH_PEPPER: PEPPER,
    ENTITLEMENT_SIGNING_KEY: pair.secret,
    ENTITLEMENT_KEY_ID: 'k1',
    TURNSTILE_SECRET_KEY: 'turnstile-test',
    GYM_MEDIA: bucket,
  };
  return { db, env, secret: pair.secret, publicJwk: pair.publicJwk, bucket };
}

function post(path: string, body: unknown, cookie = ''): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), 'cf-connecting-ip': '198.51.100.7' },
    body: JSON.stringify(body),
  });
}

type Answer = { status: number; body: Record<string, any>; cookie: string; setCookie: string };

async function call(f: Fixture, request: Request, at: Date = NOW): Promise<Answer> {
  const response = await handleLogin(request, f.env, f.db, () => at, async () => new Response('{}', { status: 404 }));
  const setCookie = response.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  return { status: response.status, body: (await response.json()) as Record<string, any>, cookie, setCookie };
}

async function restoreCode(f: Fixture, email: string): Promise<{ challengeId: string; code: string }> {
  const sender = memoryEmailSender();
  const response = await handleRestoreRequest(
    new Request(`${ORIGIN}/api/restore/request`, {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.20' },
      body: JSON.stringify({ email, turnstileToken: 'ok' }),
    }),
    f.env,
    f.db,
    sender,
    async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    () => NOW,
  );
  const body = (await response.json()) as { challengeId: string };
  const code = sender.sent[0]?.text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
  return { challengeId: body.challengeId, code };
}

async function ownerPro(f: Fixture, email = 'owner@gym.test'): Promise<{ licenseId: string; token: string }> {
  const { licenseId } = await recordPurchase(f.db, {
    email,
    product: 'advantage-pro',
    source: 'stripe_payment',
    sourceRef: `cs_${email}`,
    sessionId: `cs_${email}`,
    pepper: PEPPER,
    now: NOW,
  });
  const token = await issueToken(f.secret, {
    licenseId,
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'owner-phone',
    now: NOW,
    kind: 'pro',
    subs: { state: 'active' },
  });
  if (!token) throw new Error('owner token');
  // The gym has shown its coach connect QR once, so a signed-in invitee can be linked without scanning it.
  f.bucket.objects.set(`groups/${licenseId}/coach-connect/current.json`, JSON.stringify({ key: 'coachkey-0123456789abcdef', name: 'GB Ellijay' }));
  return { licenseId, token };
}

test('passwords use versioned PBKDF2-SHA256 with a random salt and compare safely', async () => {
  const one = await hashPassword('correct horse');
  const two = await hashPassword('correct horse');
  assert.match(one, /^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.notEqual(one, two);
  assert.equal(await verifyPassword('correct horse', one), true);
  assert.equal(await verifyPassword('correct horsf', one), false);
  assert.equal(await verifyPassword('anything', null), false);
  assert.equal(await verifyPassword('anything', 'md5$abc'), false);
  assert.equal(needsRehash(one), false);
  assert.equal(needsRehash(await hashPassword('x'.repeat(8), 1000)), true);
  assert.equal(maskEmail('Paige@Gmail.com'), 'pa•••@gmail.com');
});

test('purchaser sets a first password with the restore code, then signs in with email and password only', async () => {
  const f = await fixture();
  await recordPurchase(f.db, { email: 'buyer@gym.test', product: 'advantage-white', source: 'stripe_payment', sourceRef: 'cs_b', sessionId: 'cs_b', pepper: PEPPER, now: NOW });

  const { challengeId, code } = await restoreCode(f, 'buyer@gym.test');
  const short = await call(f, post('/api/login/code', { email: 'buyer@gym.test', challengeId, code, password: 'short' }));
  assert.equal(short.status, 400);
  // The code must belong to the typed email. Another address cannot spend it.
  const other = await call(f, post('/api/login/code', { email: 'thief@gym.test', challengeId, code, password: 'long enough pw' }));
  assert.equal(other.status, 400);
  assert.equal(other.body.error, CODE_FAILED);
  const setup = await call(f, post('/api/login/code', { email: 'buyer@gym.test', challengeId, code, password: 'long enough pw', deviceId: 'pc-1' }));
  assert.equal(setup.status, 200);
  assert.equal(setup.body.signedIn, true);
  assert.equal(setup.body.email, 'bu•••@gym.test');
  assert.match(setup.setCookie, /^adv_session=[A-Za-z0-9_-]{40,}; Path=\/api\/login; HttpOnly; Secure; SameSite=Lax; Max-Age=7776000$/);
  assert.ok(setup.body.pass.token);
  assert.deepEqual(setup.body.profile.editions, ['white']);
  // No invite, so no academy link and no instructor section.
  assert.equal(setup.body.academy, undefined);
  assert.deepEqual(setup.body.profile.invites, []);
  // The restore code is single use.
  const again = await call(f, post('/api/login/code', { email: 'buyer@gym.test', challengeId, code, password: 'another pw 123' }));
  assert.equal(again.status, 400);

  const signin = await call(f, post('/api/login/signin', { email: 'Buyer@gym.test', password: 'long enough pw', deviceId: 'phone-2', publicJwk: f.publicJwk }));
  assert.equal(signin.status, 200);
  const claims = await verifyToken(signin.body.pass.token, [{ kid: 'k1', jwk: f.publicJwk }]);
  assert.equal(claims?.did, 'phone-2');
  assert.deepEqual(claims?.grants, ['white']);

  const me = await call(f, new Request(`${ORIGIN}/api/login/me`, { headers: { cookie: signin.cookie } }));
  assert.equal(me.body.signedIn, true);
  assert.equal(me.body.pass, undefined, 'GET /me is profile only');
  const refreshed = await call(f, post('/api/login/me', { deviceId: 'phone-2' }, signin.cookie));
  assert.ok(refreshed.body.pass.token, 'POST /me signs this device again with no email code');

  const out = await call(f, post('/api/login/signout', {}, signin.cookie));
  assert.equal(out.status, 200);
  assert.match(out.setCookie, /Max-Age=0/);
  const after = await call(f, new Request(`${ORIGIN}/api/login/me`, { headers: { cookie: signin.cookie } }));
  assert.equal(after.body.signedIn, false);
  // The other session from setup is still signed in. Sign out ends only this browser.
  const setupMe = await call(f, new Request(`${ORIGIN}/api/login/me`, { headers: { cookie: setup.cookie } }));
  assert.equal(setupMe.body.signedIn, true);
});

test('wrong password, unknown email, and lockout give the same generic answers', async () => {
  const f = await fixture();
  await recordPurchase(f.db, { email: 'lock@gym.test', product: 'advantage-white', source: 'stripe_payment', sourceRef: 'cs_l', sessionId: 'cs_l', pepper: PEPPER, now: NOW });
  const { challengeId, code } = await restoreCode(f, 'lock@gym.test');
  assert.equal((await call(f, post('/api/login/code', { email: 'lock@gym.test', challengeId, code, password: 'right password' }))).status, 200);

  const wrong = await call(f, post('/api/login/signin', { email: 'lock@gym.test', password: 'wrong password' }));
  const unknown = await call(f, post('/api/login/signin', { email: 'nobody@gym.test', password: 'wrong password' }));
  assert.equal(wrong.status, unknown.status);
  assert.deepEqual(wrong.body, unknown.body);
  assert.equal(wrong.body.error, LOGIN_FAILED);
  assert.equal(wrong.setCookie, '');

  for (let index = 0; index < 4; index += 1) {
    await call(f, post('/api/login/signin', { email: 'lock@gym.test', password: `wrong ${index}` }));
    await call(f, post('/api/login/signin', { email: 'nobody@gym.test', password: `wrong ${index}` }));
  }
  const locked = await call(f, post('/api/login/signin', { email: 'lock@gym.test', password: 'right password' }));
  const lockedUnknown = await call(f, post('/api/login/signin', { email: 'nobody@gym.test', password: 'right password' }));
  assert.equal(locked.status, 429);
  assert.deepEqual(locked.body, { ok: false, error: LOGIN_LOCKED });
  assert.deepEqual(lockedUnknown.body, locked.body);
  // After the window, the right password works again.
  const later = await call(f, post('/api/login/signin', { email: 'lock@gym.test', password: 'right password' }), new Date(NOW.getTime() + 16 * 60 * 1000));
  assert.equal(later.status, 200);
});

test('forgot password: a new password via the email code signs out every older session', async () => {
  const f = await fixture();
  await recordPurchase(f.db, { email: 'reset@gym.test', product: 'advantage-white', source: 'stripe_payment', sourceRef: 'cs_r', sessionId: 'cs_r', pepper: PEPPER, now: NOW });
  const first = await restoreCode(f, 'reset@gym.test');
  const setup = await call(f, post('/api/login/code', { email: 'reset@gym.test', ...first, password: 'first password' }));
  assert.equal(setup.status, 200);
  const second = await restoreCode(f, 'reset@gym.test');
  const reset = await call(f, post('/api/login/code', { email: 'reset@gym.test', ...second, password: 'second password' }));
  assert.equal(reset.status, 200);
  const old = await call(f, new Request(`${ORIGIN}/api/login/me`, { headers: { cookie: setup.cookie } }));
  assert.equal(old.body.signedIn, false);
  assert.equal((await call(f, post('/api/login/signin', { email: 'reset@gym.test', password: 'first password' }))).status, 400);
  assert.equal((await call(f, post('/api/login/signin', { email: 'reset@gym.test', password: 'second password' }))).status, 200);
});

test('student invite code: first sign-in sets the password, restores the exact selection, and links the coach', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);
  const issued = await handleStudentLicenseIssue(
    post('/api/student-licenses/issue', { token: owner.token, email: 'paige@gmail.com', editions: ['student', 'pro'], features: { rosterPull: false } }),
    f.env,
    f.db,
    () => NOW,
  );
  const issuedBody = (await issued.json()) as { code: string };
  assert.equal(issued.status, 200);
  const stored = await readInviteSelection(f.db, 'student-code', issuedBody.code);
  // A Student code can only grant Student. A Pro pick is dropped, the switches are kept as picked.
  assert.deepEqual(stored?.editions, ['student']);
  assert.deepEqual(stored?.features, { rosterPull: false });
  assert.equal(stored?.issuerId, 'owner');

  const wrongEmail = await call(f, post('/api/login/invite', { email: 'someone@gmail.com', code: issuedBody.code, password: 'student pass 1' }));
  const wrongCode = await call(f, post('/api/login/invite', { email: 'paige@gmail.com', code: 'f'.repeat(64), password: 'student pass 1' }));
  assert.equal(wrongEmail.status, 400);
  assert.deepEqual(wrongEmail.body, wrongCode.body);
  assert.equal(wrongEmail.body.error, INVITE_FAILED);

  // Gmail dots and case do not matter: the same address the instructor typed.
  const first = await call(f, post('/api/login/invite', { email: 'Pai.ge@gmail.com', code: `${ORIGIN}/join/student?code=${issuedBody.code}`, password: 'student pass 1', deviceId: 'student-phone' }));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.pass.student.gymId, owner.licenseId);
  const claims = await verifyToken(first.body.pass.token, [{ kid: 'k1', jwk: f.publicJwk }]);
  assert.equal(claims?.gym, owner.licenseId);
  assert.equal(claims?.tier, 'student');
  assert.deepEqual(first.body.profile.editions, ['white', 'student']);
  assert.equal(first.body.profile.invites.length, 1);
  assert.deepEqual(first.body.profile.invites[0].editions, ['student']);
  assert.deepEqual(first.body.profile.invites[0].features, { rosterPull: false });
  assert.equal(first.body.profile.invites[0].active, true);
  // Coach link in the same step: a signed coach connect code for this gym, from the owner.
  assert.equal(first.body.academy.gym, owner.licenseId);
  assert.equal(first.body.academy.gymName, 'GB Ellijay');
  const connect = readCoachConnectClaim(await readSignedJson(first.body.academy.coachConnect, [{ kid: 'k1', jwk: f.publicJwk }]));
  assert.equal(connect?.gym, owner.licenseId);
  assert.equal(connect?.via, 'owner');
  assert.ok((await readInviteSelection(f.db, 'student-code', issuedBody.code))?.redeemedAt);

  // The code works once for setup. After that it is email and password.
  const reuse = await call(f, post('/api/login/invite', { email: 'paige@gmail.com', code: issuedBody.code, password: 'other pass 1' }));
  assert.equal(reuse.status, 409);
  const daily = await call(f, post('/api/login/signin', { email: 'paige@gmail.com', password: 'student pass 1', deviceId: 'student-laptop' }));
  assert.equal(daily.status, 200);
  assert.equal(daily.body.pass.student.gymId, owner.licenseId);
  assert.equal(daily.body.academy.gym, owner.licenseId);
  assert.deepEqual(daily.body.profile.invites[0].features, { rosterPull: false });

  // Revoked: sign-in still works for the person, but the invite's access is not restored.
  const revoke = await handleStudentLicenseRevoke(post('/api/student-licenses/revoke', { token: owner.token, code: issuedBody.code }), f.env, f.db, () => NOW);
  assert.equal(revoke.status, 200);
  const afterRevoke = await call(f, post('/api/login/signin', { email: 'paige@gmail.com', password: 'student pass 1', deviceId: 'student-laptop' }));
  assert.equal(afterRevoke.status, 200);
  assert.equal(afterRevoke.body.pass, undefined);
  assert.equal(afterRevoke.body.academy, undefined);
  assert.deepEqual(afterRevoke.body.profile.editions, []);
});

test('a revoked Student code cannot be used to set a password', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);
  const issued = await handleStudentLicenseIssue(post('/api/student-licenses/issue', { token: owner.token, email: 'gone@gym.test' }), f.env, f.db, () => NOW);
  const { code } = (await issued.json()) as { code: string };
  await handleStudentLicenseRevoke(post('/api/student-licenses/revoke', { token: owner.token, code }), f.env, f.db, () => NOW);
  const tried = await call(f, post('/api/login/invite', { email: 'gone@gym.test', code, password: 'student pass 1' }));
  assert.equal(tried.status, 400);
  assert.equal(tried.body.error, INVITE_FAILED);
});

test('pending instructor seat invite: email + invite link sets the password and restores the exact switches', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);
  // The owner's own picks, not a preset's factory set: Events off.
  const picked = {
    galleryUpload: true,
    dailyLessonPlanAccess: true,
    rosterSubmit: true,
    rosterPull: true,
    downloadTodaysVideos: true,
    uploadForDistribution: true,
    eventsAccess: false,
    proShopAccess: true,
    dailyVideoUpload: true,
  };
  const issued = await handleSeatIssue(
    post('/api/seats/issue', { token: owner.token, email: 'coach.one@gmail.com', preset: 'instructors', permissions: picked }),
    f.env,
    f.db,
    () => NOW,
  );
  const seat = (await issued.json()) as { seatId: string; invite: string };
  assert.equal(issued.status, 200);
  assert.deepEqual((await readInviteSelection(f.db, 'seat', seat.seatId))?.features, picked);

  // Restore sends nothing here: a pending seat has no license. The invite itself is the code.
  const link = `${ORIGIN}/instructors?invite=${encodeURIComponent(seat.invite)}`;
  const wrong = await call(f, post('/api/login/invite', { email: 'someone.else@gmail.com', code: link, password: 'coach pass 12' }));
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error, INVITE_FAILED);
  const first = await call(f, post('/api/login/invite', { email: 'coachone@gmail.com', code: link, password: 'coach pass 12', deviceId: 'coach-phone' }));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.seat.seatId, seat.seatId);
  assert.deepEqual(first.body.seat.permissions, picked);
  assert.equal(first.body.seat.permissionsSource, 'stored');
  const seatClaims = await verifyToken(first.body.seat.token, [{ kid: 'k1', jwk: f.publicJwk }]);
  assert.equal(seatClaims?.gym, owner.licenseId);
  assert.equal(seatClaims?.sid, seat.seatId);
  assert.equal(seatClaims?.preset, 'instructors');
  assert.equal(first.body.academy.gym, owner.licenseId);
  assert.ok(first.body.academy.coachConnect);
  assert.equal(first.body.pass, undefined, 'a seat-only instructor has no license of her own');

  // Owner edits the switches later. The next sign-in restores the edit.
  const edited = { ...picked, proShopAccess: false };
  const saved = await handleSeatPermissions(post('/api/seats/permissions', { token: owner.token, seatId: seat.seatId, permissions: edited }), f.env, f.db, () => NOW);
  assert.equal(saved.status, 200);
  const daily = await call(f, post('/api/login/signin', { email: 'coachone@gmail.com', password: 'coach pass 12', deviceId: 'coach-laptop' }));
  assert.deepEqual(daily.body.seat.permissions, edited);
  assert.deepEqual(daily.body.profile.invites[0].features, edited);

  // Revoked seat: not restored on sign-in.
  await handleSeatRevoke(post('/api/seats/revoke', { token: owner.token, seatId: seat.seatId }), f.env, f.db, () => NOW);
  const afterRevoke = await call(f, post('/api/login/signin', { email: 'coachone@gmail.com', password: 'coach pass 12', deviceId: 'coach-laptop' }));
  assert.equal(afterRevoke.status, 200);
  assert.equal(afterRevoke.body.seat, undefined);
  assert.deepEqual(afterRevoke.body.profile.invites, []);
});

test('seat issued before switches were stored: its preset menus restore, and a revoked one cannot be used', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);
  const issued = await handleSeatIssue(post('/api/seats/issue', { token: owner.token, email: 'paigegbellijay@gmail.com', preset: 'instructors' }), f.env, f.db, () => NOW);
  const seat = (await issued.json()) as { seatId: string; invite: string };
  // Same as a seat issued on main today: no invite_selections row.
  await f.db.prepare(`DELETE FROM invite_selections WHERE invite_ref = ?`).bind(seat.seatId).run();
  const first = await call(f, post('/api/login/invite', { email: 'paigegbellijay@gmail.com', code: seat.invite, password: 'paige pass 1' }));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.seat.permissionsSource, 'preset');
  // Coach Unlimited + Pro ("instructors"): all nine switches on.
  assert.equal(Object.values(first.body.seat.permissions).length, 9);
  assert.ok(Object.values(first.body.seat.permissions).every((value) => value === true));

  const revokedIssue = await handleSeatIssue(post('/api/seats/issue', { token: owner.token, email: 'late@gmail.com', preset: 'coach' }), f.env, f.db, () => NOW);
  const revoked = (await revokedIssue.json()) as { seatId: string; invite: string };
  await handleSeatRevoke(post('/api/seats/revoke', { token: owner.token, seatId: revoked.seatId }), f.env, f.db, () => NOW);
  const tried = await call(f, post('/api/login/invite', { email: 'late@gmail.com', code: revoked.invite, password: 'late pass 12' }));
  assert.equal(tried.status, 400);
  assert.equal(tried.body.error, INVITE_FAILED);
});

test("device-only seat invite (today's production case): owner sync stores it, then email + invite link signs in with the owner's switches", async () => {
  const f = await fixture();
  const owner = await ownerPro(f);
  // Made on the owner's phone with no server seat (production has none today). The link carries this local token.
  const localToken = crypto.randomUUID();
  const allNine = {
    galleryUpload: true,
    dailyLessonPlanAccess: true,
    rosterSubmit: true,
    rosterPull: true,
    downloadTodaysVideos: true,
    uploadForDistribution: true,
    eventsAccess: true,
    proShopAccess: true,
    dailyVideoUpload: true,
  };
  // Before the owner's device syncs, the invite is unknown to the server and cannot set a password.
  const early = await call(f, post('/api/login/invite', { email: 'paigegbellijay@gmail.com', code: `${ORIGIN}/instructors?invite=${localToken}`, password: 'paige pass 1' }));
  assert.equal(early.status, 400);
  const synced = await handleSeatSync(
    post('/api/seats/sync', { token: owner.token, seats: [{ id: 'local-seat-1', inviteToken: localToken, email: 'paigegbellijay@gmail.com', preset: 'instructors', status: 'invited' }] }),
    f.env,
    f.db,
    () => NOW,
  );
  assert.equal(((await synced.json()) as { registered: number }).registered, 1);
  const pushed = await handleSeatPermissions(post('/api/seats/permissions', { token: owner.token, seatId: localToken, preset: 'instructors', permissions: allNine }), f.env, f.db, () => NOW);
  assert.equal(pushed.status, 200);
  const first = await call(f, post('/api/login/invite', { email: 'paigegbellijay@gmail.com', code: `${ORIGIN}/instructors?invite=${localToken}`, password: 'paige pass 1', deviceId: 'paige-phone' }));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body.seat.permissions, allNine);
  assert.equal(first.body.seat.permissionsSource, 'stored');
  assert.equal(first.body.academy.gym, owner.licenseId);
  const daily = await call(f, post('/api/login/signin', { email: 'paigegbellijay@gmail.com', password: 'paige pass 1', deviceId: 'paige-pc' }));
  assert.equal(daily.body.seat.gymId, owner.licenseId);
});

test('sign-in endpoints refuse cross-site posts and report setup when unconfigured', async () => {
  const f = await fixture();
  const cross = await call(
    f,
    new Request(`${ORIGIN}/api/login/signin`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(10) }) }),
  );
  assert.equal(cross.status, 403);
  const off = await handleLogin(post('/api/login/signin', { email: 'a@b.c', password: 'x'.repeat(10) }), {}, null);
  assert.equal(off.status, 503);
  const me = await handleLogin(new Request(`${ORIGIN}/api/login/me`), {}, null);
  assert.equal(((await me.json()) as { signedIn: boolean }).signedIn, false);
});

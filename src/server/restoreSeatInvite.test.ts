import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyToken, type PrivateJwk, type PublicJwk } from '../lib/entitlementToken.ts';
import { memoryEmailSender } from './emailSender.ts';
import { readInviteSelection } from './inviteSelections.ts';
import {
  CODE_FAILED,
  INVITE_CLAIMED,
  INVITE_EXPIRED,
  INVITE_FAILED,
  INVITE_REPLACED,
  INVITE_REVOKED,
  handleLogin,
  type LoginEnv,
} from './loginAccount.ts';
import { recordPurchase } from './purchaseRecords.ts';
import {
  RESTORE_GENERIC,
  RESTORE_SEAT_USE_ACCOUNT,
  handleRestoreRequest,
  handleRestoreVerify,
  restoreEmailText,
} from './restoreAccess.ts';
import {
  SEAT_ACCOUNT_BOUND,
  handleSeatAccept,
  handleSeatIssue,
  handleSeatReset,
  handleSeatRevoke,
  openSeatForEmailHash,
  refreshSeat,
} from './seats.ts';
import { keyedHash, normalizeEmail } from './codeCrypto.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { issueToken } from './tokenIssue.ts';
import type { D1Database } from './d1.ts';
import type { InboxBucket } from './studentInbox.ts';

/**
 * Restore codes for instructor seat invites (PR 547 rebuilt on email sign-in), and the plain
 * seat invite reasons on /account?invite=. In-memory SQLite and a memory email sender only:
 * no Resend, no Turnstile call, no production database.
 */

const PEPPER = 'restore-seat-pepper';
const NOW = new Date('2026-11-18T13:00:00.000Z');
const ORIGIN = 'https://advantagebjjtimer.com';
const DAY = 24 * 60 * 60 * 1000;

type Fixture = { db: D1Database; env: LoginEnv; secret: string; publicJwk: PublicJwk };

async function fixture(): Promise<Fixture> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const pub = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  const objects = new Map<string, string>();
  const bucket = {
    async get(name: string) {
      const text = objects.get(name);
      return text == null ? null : { text: async () => text };
    },
    async put(name: string, value: string) {
      objects.set(name, String(value));
      return {};
    },
  } as unknown as InboxBucket;
  const env: LoginEnv = {
    CODE_HASH_PEPPER: PEPPER,
    ENTITLEMENT_SIGNING_KEY: JSON.stringify(privateJwk),
    ENTITLEMENT_KEY_ID: 'k1',
    TURNSTILE_SECRET_KEY: 'turnstile-test',
    GYM_MEDIA: bucket,
  };
  return { db: sqliteD1(), env, secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } };
}

function post(path: string, body: unknown, ip = '198.51.100.7'): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

const noNetwork = async () => new Response('{}', { status: 404 });

async function login(f: Fixture, request: Request, at: Date = NOW) {
  const response = await handleLogin(request, f.env, f.db, () => at, noNetwork);
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

type RequestResult = { status: number; body: Record<string, any>; sent: { to: string; subject: string; text: string }[]; code: string };

async function requestCode(
  f: Fixture,
  email: string,
  options: { at?: Date; ip?: string; captcha?: boolean } = {},
): Promise<RequestResult> {
  const sender = memoryEmailSender();
  const response = await handleRestoreRequest(
    new Request(`${ORIGIN}/api/restore/request`, {
      method: 'POST',
      headers: { 'cf-connecting-ip': options.ip ?? '203.0.113.20' },
      body: JSON.stringify({ email, turnstileToken: 'ok' }),
    }),
    f.env,
    f.db,
    sender,
    async () => new Response(JSON.stringify({ success: options.captcha !== false }), { status: 200 }),
    () => options.at ?? NOW,
  );
  const code = sender.sent[0]?.text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
  return { status: response.status, body: (await response.json()) as Record<string, any>, sent: sender.sent, code };
}

async function challengeRows(f: Fixture): Promise<number> {
  const row = await f.db.prepare(`SELECT COUNT(*) AS n FROM restore_challenges`).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

async function ownerPro(f: Fixture): Promise<{ licenseId: string; token: string }> {
  const { licenseId } = await recordPurchase(f.db, {
    email: 'owner@gym.test',
    product: 'advantage-pro',
    source: 'stripe_payment',
    sourceRef: 'cs_owner',
    sessionId: 'cs_owner',
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
  return { licenseId, token };
}

async function issueSeat(f: Fixture, ownerToken: string, email: string, at: Date = NOW): Promise<{ seatId: string; invite: string }> {
  const issued = await handleSeatIssue(post('/api/seats/issue', { token: ownerToken, email, preset: 'coach' }), f.env, f.db, () => at);
  assert.equal(issued.status, 200);
  return (await issued.json()) as { seatId: string; invite: string };
}

test('Augustus case: an address only on an unopened seat invite gets a usable code, and Account turns it into a password and the seat', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);
  const seat = await issueSeat(f, owner.token, 'augustus.coach@gmail.com');

  const invited = await requestCode(f, 'augustus.coach@gmail.com');
  const stranger = await requestCode(f, 'nobody.here@gmail.com');
  // Same answer for both, so the page never tells anyone which addresses are invited.
  assert.equal(invited.status, 200);
  assert.equal(stranger.status, 200);
  assert.equal(invited.body.message, RESTORE_GENERIC);
  assert.deepEqual(Object.keys(invited.body).sort(), Object.keys(stranger.body).sort());
  assert.equal(stranger.body.message, invited.body.message);
  // Only the invited address gets an email and a stored challenge.
  assert.equal(stranger.sent.length, 0);
  assert.equal(invited.sent.length, 1);
  assert.equal(invited.sent[0]?.to, 'augustus.coach@gmail.com');
  assert.match(invited.sent[0]?.text ?? '', /instructor invite/);
  assert.match(invited.sent[0]?.text ?? '', /First time after buying, or forgot password/);
  assert.ok(invited.code);
  assert.equal(await challengeRows(f), 1);

  // /restore only restores purchases. It says where to go and does not spend the code.
  const viaRestore = await handleRestoreVerify(
    post('/api/restore/verify', { challengeId: invited.body.challengeId, code: invited.code, deviceId: 'aug-phone' }),
    f.env,
    f.db,
    () => NOW,
  );
  assert.equal(viaRestore.status, 409);
  const restoreBody = (await viaRestore.json()) as Record<string, unknown>;
  assert.equal(restoreBody.seatOnly, true);
  assert.equal(restoreBody.error, RESTORE_SEAT_USE_ACCOUNT);
  assert.equal(restoreBody.token, undefined);

  // Another address cannot spend this code.
  const thief = await login(f, post('/api/login/code', { email: 'thief@gmail.com', challengeId: invited.body.challengeId, code: invited.code, password: 'thief pass 12' }));
  assert.equal(thief.status, 400);
  assert.equal(thief.body.error, CODE_FAILED);

  const signedIn = await login(
    f,
    post('/api/login/code', {
      email: 'Augustus.Coach@gmail.com',
      challengeId: invited.body.challengeId,
      code: invited.code.toLowerCase(),
      password: 'augustus pass 1',
      deviceId: 'aug-phone',
    }),
  );
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
  assert.equal(signedIn.body.signedIn, true);
  assert.equal(signedIn.body.seat.seatId, seat.seatId);
  assert.equal(signedIn.body.profile.role, 'instructor');
  assert.equal(signedIn.body.pass, undefined, 'a seat-only instructor has no license of his own');
  const claims = await verifyToken(signedIn.body.seat.token, [{ kid: 'k1', jwk: f.publicJwk }]);
  assert.equal(claims?.sid, seat.seatId);
  assert.equal(claims?.gym, owner.licenseId);
  const row = await f.db.prepare(`SELECT status, claimed_device AS d FROM seats WHERE id = ?`).bind(seat.seatId).first<{ status: string; d: string }>();
  assert.equal(row?.status, 'claimed');
  assert.equal(row?.d, SEAT_ACCOUNT_BOUND);
  assert.ok((await readInviteSelection(f.db, 'seat', seat.seatId))?.redeemedAt);

  // Single use, and the new password works on its own afterwards.
  const again = await login(f, post('/api/login/code', { email: 'augustus.coach@gmail.com', challengeId: invited.body.challengeId, code: invited.code, password: 'second pass 12' }));
  assert.equal(again.status, 400);
  const daily = await login(f, post('/api/login/signin', { email: 'augustus.coach@gmail.com', password: 'augustus pass 1', deviceId: 'aug-laptop' }));
  assert.equal(daily.status, 200);
  assert.equal(daily.body.seat.seatId, seat.seatId);
});

test('a seat made before invite selections (no stored email hash) still matches by its email label, Gmail dots included', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);
  const seat = await issueSeat(f, owner.token, 'old.seat@gmail.com');
  await f.db.prepare(`DELETE FROM invite_selections WHERE invite_ref = ?`).bind(seat.seatId).run();
  const emailHash = await keyedHash(normalizeEmail('oldseat@gmail.com'), PEPPER, 'email');
  assert.equal((await openSeatForEmailHash(f.db, emailHash, PEPPER, NOW))?.seatId, seat.seatId);

  const sent = await requestCode(f, 'OldSeat@gmail.com');
  assert.equal(sent.sent.length, 1);
  const signedIn = await login(f, post('/api/login/code', { email: 'oldseat@gmail.com', challengeId: sent.body.challengeId, code: sent.code, password: 'old seat pass', deviceId: 'old-phone' }));
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
  assert.equal(signedIn.body.seat.seatId, seat.seatId);
  assert.equal(signedIn.body.seat.permissionsSource, 'preset');
  assert.equal((await readInviteSelection(f.db, 'seat', seat.seatId))?.emailHash, emailHash);
});

test('revoked and expired-unopened seats get no code, and the answer still looks the same', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);
  const revoked = await issueSeat(f, owner.token, 'revoked@gym.test');
  await handleSeatRevoke(post('/api/seats/revoke', { token: owner.token, seatId: revoked.seatId }), f.env, f.db, () => NOW);
  await issueSeat(f, owner.token, 'stale@gym.test', new Date(NOW.getTime() - 20 * DAY));

  for (const email of ['revoked@gym.test', 'stale@gym.test']) {
    const result = await requestCode(f, email);
    assert.equal(result.status, 200);
    assert.equal(result.body.message, RESTORE_GENERIC);
    assert.equal(result.sent.length, 0, email);
  }
  assert.equal(await challengeRows(f), 0);
});

test('seat codes keep the Turnstile check and the 3-per-email / 10-per-IP hourly limits', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);
  await issueSeat(f, owner.token, 'limits@gym.test');

  const noCaptcha = await requestCode(f, 'limits@gym.test', { captcha: false });
  assert.equal(noCaptcha.status, 400);
  assert.equal(noCaptcha.sent.length, 0);

  for (let i = 0; i < 3; i += 1) assert.equal((await requestCode(f, 'limits@gym.test')).sent.length, 1);
  const fourth = await requestCode(f, 'limits@gym.test');
  assert.equal(fourth.status, 429);
  assert.equal(fourth.sent.length, 0);

  const ip = '203.0.113.99';
  for (let i = 0; i < 10; i += 1) assert.equal((await requestCode(f, `ip${i}@gym.test`, { ip })).status, 200);
  const eleventh = await requestCode(f, 'ip-last@gym.test', { ip });
  assert.equal(eleventh.status, 429);
});

test('an address with a purchase and a seat still restores the purchase on /restore', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);
  await issueSeat(f, owner.token, 'both@gym.test');
  await recordPurchase(f.db, { email: 'both@gym.test', product: 'advantage-white', source: 'stripe_payment', sourceRef: 'cs_both', sessionId: 'cs_both', pepper: PEPPER, now: NOW });
  const sent = await requestCode(f, 'both@gym.test');
  assert.equal(sent.sent.length, 1);
  assert.doesNotMatch(sent.sent[0]?.text ?? '', /instructor invite/, 'purchase email keeps the usual wording');
  const verified = await handleRestoreVerify(post('/api/restore/verify', { challengeId: sent.body.challengeId, code: sent.code, deviceId: 'both-phone' }), f.env, f.db, () => NOW);
  assert.equal(verified.status, 200);
  assert.ok(((await verified.json()) as { token?: string }).token);
});

test('/account?invite= says why a seat invite failed: revoked, expired, replaced, or open on another device', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);

  // Unknown or unreadable invite: unchanged generic answer.
  const junk = await login(f, post('/api/login/invite', { email: 'x@gym.test', code: 'not-an-invite', password: 'some pass 123' }));
  assert.equal(junk.status, 400);
  assert.equal(junk.body.error, INVITE_FAILED);
  assert.equal(junk.body.reason, 'invalid');

  const revoked = await issueSeat(f, owner.token, 'gone@gym.test');
  await handleSeatRevoke(post('/api/seats/revoke', { token: owner.token, seatId: revoked.seatId }), f.env, f.db, () => NOW);
  const r = await login(f, post('/api/login/invite', { email: 'gone@gym.test', code: revoked.invite, password: 'some pass 123' }));
  assert.equal(r.status, 403);
  assert.equal(r.body.reason, 'revoked');
  assert.equal(r.body.error, INVITE_REVOKED);

  const old = await issueSeat(f, owner.token, 'late@gym.test', new Date(NOW.getTime() - 15 * DAY));
  const e = await login(f, post('/api/login/invite', { email: 'late@gym.test', code: `${ORIGIN}/account?invite=${encodeURIComponent(old.invite)}`, password: 'some pass 123' }));
  assert.equal(e.status, 400);
  assert.equal(e.body.reason, 'expired');
  assert.equal(e.body.error, INVITE_EXPIRED);

  const reset = await issueSeat(f, owner.token, 'reset@gym.test');
  const fresh = await handleSeatReset(post('/api/seats/reset', { token: owner.token, seatId: reset.seatId }), f.env, f.db, () => NOW);
  const freshInvite = ((await fresh.json()) as { invite: string }).invite;
  const replaced = await login(f, post('/api/login/invite', { email: 'reset@gym.test', code: reset.invite, password: 'some pass 123' }));
  assert.equal(replaced.status, 400);
  assert.equal(replaced.body.reason, 'replaced');
  assert.equal(replaced.body.error, INVITE_REPLACED);
  const withFresh = await login(f, post('/api/login/invite', { email: 'reset@gym.test', code: freshInvite, password: 'some pass 123', deviceId: 'reset-phone' }));
  assert.equal(withFresh.status, 200, JSON.stringify(withFresh.body));

  // Opened with the link on a phone (no password yet). The link alone does not move it.
  const onPhone = await issueSeat(f, owner.token, 'phone.coach@gym.test');
  const accepted = await handleSeatAccept(post('/api/seats/accept', { invite: onPhone.invite, deviceId: 'first-phone' }), f.env, f.db, noNetwork, () => NOW);
  assert.equal(accepted.status, 200);
  const phonePass = ((await accepted.json()) as { token: string }).token;
  const claimed = await login(f, post('/api/login/invite', { email: 'phone.coach@gym.test', code: onPhone.invite, password: 'some pass 123', deviceId: 'laptop' }));
  assert.equal(claimed.status, 409);
  assert.equal(claimed.body.reason, 'claimed');
  assert.equal(claimed.body.error, INVITE_CLAIMED);
  // The emailed code is the way through, and the first phone keeps working (seat is now account-bound).
  const sent = await requestCode(f, 'phone.coach@gym.test');
  assert.equal(sent.sent.length, 1);
  const viaCode = await login(f, post('/api/login/code', { email: 'phone.coach@gym.test', challengeId: sent.body.challengeId, code: sent.code, password: 'some pass 123', deviceId: 'laptop' }));
  assert.equal(viaCode.status, 200, JSON.stringify(viaCode.body));
  assert.equal(viaCode.body.seat.seatId, onPhone.seatId);
  const phoneClaims = await verifyToken(phonePass, [{ kid: 'k1', jwk: f.publicJwk }]);
  const refreshed = await refreshSeat(f.db, f.env, { gym: phoneClaims?.gym, sid: phoneClaims?.sid, did: String(phoneClaims?.did) }, NOW, noNetwork);
  assert.equal('error' in refreshed, false);
});

test('the seat email names the Account screen; the purchase email is unchanged', () => {
  assert.match(restoreEmailText('ABCD2345', { seat: true }), /Account page/);
  assert.match(restoreEmailText('ABCD2345'), /restore page/);
  assert.doesNotMatch(restoreEmailText('ABCD2345'), /instructor invite/);
});

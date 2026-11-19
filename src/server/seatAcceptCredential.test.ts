import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrivateJwk } from '../lib/entitlementToken.ts';
import { memoryEmailSender } from './emailSender.ts';
import { INVITE_EMAIL_MISMATCH, handleLogin, type LoginEnv } from './loginAccount.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { handleRestoreRequest } from './restoreAccess.ts';
import { handleSeatAccept, handleSeatIssue, handleSeatReset, handleSeatRevoke, handleSeatSync } from './seats.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { issueToken } from './tokenIssue.ts';
import type { D1Database } from './d1.ts';

/**
 * /api/seats/accept needs a real invite credential (Nov 18). A bare seat id used to open any
 * seat, so the id read out of an expired or replaced invite skipped those checks. In-memory
 * SQLite and a memory email sender only: no production data, no email sent.
 */

const PEPPER = 'accept-credential-pepper';
const NOW = new Date('2026-11-18T13:00:00.000Z');
const ORIGIN = 'https://advantagebjjtimer.com';
const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = 'some pass 123';

type Fixture = { db: D1Database; env: LoginEnv; secret: string };

async function fixture(): Promise<Fixture> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const env: LoginEnv = {
    CODE_HASH_PEPPER: PEPPER,
    ENTITLEMENT_SIGNING_KEY: JSON.stringify(privateJwk),
    ENTITLEMENT_KEY_ID: 'k1',
    TURNSTILE_SECRET_KEY: 'turnstile-test',
  };
  return { db: sqliteD1(), env, secret: JSON.stringify(privateJwk) };
}

function post(path: string, body: unknown, ip = '198.51.100.7'): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

const noNetwork = async () => new Response('{}', { status: 404 });

async function accept(f: Fixture, invite: string, deviceId: string, at: Date = NOW) {
  const response = await handleSeatAccept(post('/api/seats/accept', { invite, deviceId }), f.env, f.db, noNetwork, () => at);
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function login(f: Fixture, path: string, body: Record<string, unknown>) {
  const response = await handleLogin(post(path, body), f.env, f.db, () => NOW, noNetwork);
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function seatRow(f: Fixture, id: string) {
  return f.db.prepare(`SELECT status, claimed_device AS claimedDevice FROM seats WHERE id = ?`).bind(id).first<{ status: string; claimedDevice: string | null }>();
}

async function ownerPro(f: Fixture): Promise<string> {
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
  return token;
}

async function issueSeat(f: Fixture, owner: string, email: string, at: Date = NOW) {
  const issued = await handleSeatIssue(post('/api/seats/issue', { token: owner, email, preset: 'coach' }), f.env, f.db, () => at);
  assert.equal(issued.status, 200);
  return (await issued.json()) as { seatId: string; invite: string };
}

test('a bare seat id is refused for a server-issued seat: fresh, expired, or reset', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);

  const fresh = await issueSeat(f, owner, 'fresh@gym.test');
  const bare = await accept(f, fresh.seatId, 'attacker');
  assert.equal(bare.status, 400);
  assert.equal(bare.body.error, 'This invite is not valid.');
  assert.deepEqual({ ...(await seatRow(f, fresh.seatId)) }, { status: 'pending', claimedDevice: null }, 'nothing was claimed');

  const old = await issueSeat(f, owner, 'late@gym.test', new Date(NOW.getTime() - 15 * DAY));
  assert.equal((await accept(f, old.seatId, 'attacker')).status, 400);
  assert.equal((await accept(f, ` ${old.seatId} `, 'attacker')).status, 400);

  const reset = await issueSeat(f, owner, 'reset@gym.test');
  await handleSeatReset(post('/api/seats/reset', { token: owner, seatId: reset.seatId }), f.env, f.db, () => NOW);
  assert.equal((await accept(f, reset.seatId, 'attacker')).status, 400);
  assert.equal((await seatRow(f, reset.seatId))?.claimedDevice, null);
});

test('an expired or replaced signed invite is refused; revoked stays revoked', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);

  const old = await issueSeat(f, owner, 'late@gym.test', new Date(NOW.getTime() - 15 * DAY));
  const expired = await accept(f, old.invite, 'late-phone');
  assert.equal(expired.status, 400);
  assert.match(String(expired.body.error), /expired/);

  const reset = await issueSeat(f, owner, 'reset@gym.test');
  const fresh = await handleSeatReset(post('/api/seats/reset', { token: owner, seatId: reset.seatId }), f.env, f.db, () => NOW);
  const freshInvite = ((await fresh.json()) as { invite: string }).invite;
  assert.equal((await accept(f, reset.invite, 'reset-phone')).status, 400, 'old link after reset');
  assert.equal((await accept(f, freshInvite, 'reset-phone')).status, 200, 'new link after reset');

  const gone = await issueSeat(f, owner, 'gone@gym.test');
  await handleSeatRevoke(post('/api/seats/revoke', { token: owner, seatId: gone.seatId }), f.env, f.db, () => NOW);
  assert.equal((await accept(f, gone.invite, 'gone-phone')).status, 403);
});

test('legitimate paths still work: fresh link, same device again, legacy device seat, invite sign-in, emailed code', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);

  // Fresh invite link, then the same device re-accepting its own seat; another device is refused.
  const seat = await issueSeat(f, owner, 'coach@gym.test');
  assert.equal((await accept(f, seat.invite, 'coach-phone')).status, 200);
  assert.equal((await accept(f, seat.invite, 'coach-phone')).status, 200);
  assert.equal((await accept(f, seat.invite, 'other-phone')).status, 409);

  // Legacy device-made seat: its bare invite token is its seat id, as before.
  const synced = await handleSeatSync(
    post('/api/seats/sync', { token: owner, seats: [{ id: 'local-1', inviteToken: 'legacy-token-already-sent', email: 'old@gym.test', status: 'invited' }] }),
    f.env,
    f.db,
  );
  assert.equal(synced.status, 200);
  assert.equal((await accept(f, 'legacy-token-already-sent', 'old-phone')).status, 200);

  // /account?invite= sign-in (where the wrong-email check lives) is unchanged.
  const invited = await issueSeat(f, owner, 'invited@gym.test');
  const wrong = await login(f, '/api/login/invite', { email: 'someone@gym.test', code: invited.invite, password: PASSWORD });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error, INVITE_EMAIL_MISMATCH);
  const right = await login(f, '/api/login/invite', { email: 'invited@gym.test', code: invited.invite, password: PASSWORD, deviceId: 'invited-phone' });
  assert.equal(right.status, 200, JSON.stringify(right.body));

  // Restore email code sign-in to an open seat (already open on a phone) is unchanged.
  const onPhone = await issueSeat(f, owner, 'phone.coach@gym.test');
  assert.equal((await accept(f, onPhone.invite, 'first-phone')).status, 200);
  const sender = memoryEmailSender();
  const requested = await handleRestoreRequest(
    new Request(`${ORIGIN}/api/restore/request`, {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.20' },
      body: JSON.stringify({ email: 'phone.coach@gym.test', turnstileToken: 'ok' }),
    }),
    f.env,
    f.db,
    sender,
    async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    () => NOW,
  );
  const challengeId = ((await requested.json()) as { challengeId: string }).challengeId;
  const code = sender.sent[0]?.text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
  assert.ok(code, 'memory sender got the code');
  const viaCode = await login(f, '/api/login/code', { email: 'phone.coach@gym.test', challengeId, code, password: PASSWORD, deviceId: 'laptop' });
  assert.equal(viaCode.status, 200, JSON.stringify(viaCode.body));
  assert.equal(viaCode.body.seat.seatId, onPhone.seatId);
});

test('the /i/ short code (PR 580) is a valid credential with the same checks; the bare id still is not', async () => {
  const { shortCodeForSignedSeatInvite } = await import('../lib/seatShortInvite.ts');
  const f = await fixture();
  const owner = await ownerPro(f);

  const fresh = await issueSeat(f, owner, 'short@gym.test');
  const code = shortCodeForSignedSeatInvite(fresh.invite) ?? '';
  assert.equal((await accept(f, fresh.seatId, 'attacker')).status, 400);
  assert.equal((await accept(f, code, 'short-phone')).status, 200);
  assert.equal((await accept(f, code, 'short-phone')).status, 200, 'same device again');
  assert.equal((await accept(f, code, 'other-phone')).status, 409);

  const old = await issueSeat(f, owner, 'late.short@gym.test', new Date(NOW.getTime() - 15 * DAY));
  assert.equal((await accept(f, shortCodeForSignedSeatInvite(old.invite) ?? '', 'late-phone')).status, 400);

  const reset = await issueSeat(f, owner, 'reset.short@gym.test');
  const again = await handleSeatReset(post('/api/seats/reset', { token: owner, seatId: reset.seatId }), f.env, f.db, () => NOW);
  const freshCode = shortCodeForSignedSeatInvite(((await again.json()) as { invite: string }).invite) ?? '';
  assert.equal((await accept(f, shortCodeForSignedSeatInvite(reset.invite) ?? '', 'reset-phone')).status, 400, 'old code after reset');
  assert.equal((await accept(f, freshCode, 'reset-phone')).status, 200);
});

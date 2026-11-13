import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyToken, type PrivateJwk, type PublicJwk } from '../lib/entitlementToken.ts';
import { memoryEmailSender } from './emailSender.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { handleRestoreRequest, handleRestoreVerify, RESTORE_GENERIC } from './restoreAccess.ts';
import { sqliteD1 } from './sqliteD1.ts';
import type { D1Database } from './d1.ts';

const PEPPER = 'restore-seat-pepper';
const NOW = new Date('2026-11-13T23:00:00.000Z');
const GYM = 'gym-license-restore-seat';
const SEAT = 'seat-christopher';
const EMAIL = 'iamallears@gmail.com';
const LABELED = 'I.Am.All.Ears@gmail.com';

async function keys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return {
    secret: JSON.stringify(privateJwk),
    publicJwk: { kty: 'EC' as const, crv: 'P-256' as const, x: publicJwk.x, y: publicJwk.y },
  };
}

function env(secret = 'unused') {
  return { CODE_HASH_PEPPER: PEPPER, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1', TURNSTILE_SECRET_KEY: 'turnstile-test' };
}

const turnstile: typeof fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });

async function insertSeat(
  db: D1Database,
  input: { id?: string; email: string; status?: string; claimedDevice?: string | null; revokedAt?: string | null },
) {
  await db
    .prepare(
      `INSERT INTO seats (
         id, gym_license_id, preset, status, created_at, email_label, claimed_device, claimed_at, revoked_at, legacy
       ) VALUES (?, ?, 'instructors', ?, ?, ?, ?, ?, ?, 0)`,
    )
    .bind(
      input.id ?? SEAT,
      GYM,
      input.status ?? 'claimed',
      NOW.toISOString(),
      input.email,
      input.claimedDevice ?? 'old-device',
      input.status === 'pending' ? null : NOW.toISOString(),
      input.revokedAt ?? null,
    )
    .run();
}

function codeFrom(text: string): string {
  return text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
}

async function requestCode(db: D1Database, email: string, at: Date, ip: string) {
  const sender = memoryEmailSender();
  const response = await handleRestoreRequest(
    new Request('http://localhost/api/restore/request', {
      method: 'POST',
      headers: { 'cf-connecting-ip': ip },
      body: JSON.stringify({ email, turnstileToken: 'ok' }),
    }),
    env(),
    db,
    sender,
    turnstile,
    () => at,
  );
  const body = (await response.json()) as { ok?: boolean; message?: string; challengeId?: string; error?: string };
  return { status: response.status, body, sender };
}

async function verifyCode(db: D1Database, secret: string, challengeId: string, code: string, at: Date, deviceId: string) {
  const response = await handleRestoreVerify(
    new Request('http://localhost/api/restore/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId, code, deviceId }),
    }),
    env(secret),
    db,
    () => at,
  );
  const body = (await response.json()) as {
    ok?: boolean;
    token?: string;
    seatToken?: string;
    seatId?: string;
    gymId?: string;
    preset?: string;
    grants?: string[];
    error?: string;
  };
  return { status: response.status, body };
}

async function seatRow(db: D1Database, id = SEAT) {
  return db
    .prepare(
      `SELECT status, claimed_device AS claimedDevice, account_id AS accountId FROM seats WHERE id = ?`,
    )
    .bind(id)
    .first<{ status: string; claimedDevice: string | null; accountId: string | null }>();
}

test('a claimed instructor seat email gets a restore challenge, including Gmail dot folding', async () => {
  const db = sqliteD1();
  await insertSeat(db, { email: LABELED, claimedDevice: 'old-device' });
  const known = await requestCode(db, EMAIL, NOW, '203.0.113.20');
  const unknown = await requestCode(db, 'nobody@gym.test', NOW, '203.0.113.21');
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(Object.keys(known.body), Object.keys(unknown.body));
  assert.deepEqual(Object.keys(known.body).sort(), ['challengeId', 'message', 'ok']);
  assert.equal(known.body.message, RESTORE_GENERIC);
  assert.equal(unknown.body.message, RESTORE_GENERIC);
  assert.notEqual(known.body.challengeId, unknown.body.challengeId);
  assert.equal(known.sender.sent.length, 1);
  assert.equal(known.sender.sent[0]?.to, EMAIL);
  assert.equal(codeFrom(known.sender.sent[0]?.text ?? '').length, 8);
  assert.equal(unknown.sender.sent.length, 0);
  const challenges = await db.prepare(`SELECT COUNT(*) AS total FROM restore_challenges`).first<{ total: number }>();
  assert.equal(Number(challenges?.total), 1);
});

test('a valid restore code re-issues the instructor seat onto the new device', async () => {
  const db = sqliteD1();
  const signing = await keys();
  await insertSeat(db, { email: EMAIL, claimedDevice: 'old-device' });
  const requested = await requestCode(db, EMAIL, NOW, '203.0.113.22');
  const code = codeFrom(requested.sender.sent[0]?.text ?? '');
  const verified = await verifyCode(db, signing.secret, requested.body.challengeId ?? '', code, NOW, 'new-device');
  assert.equal(verified.status, 200);
  assert.ok(verified.body.token);
  assert.equal(verified.body.seatId, SEAT);
  assert.equal(verified.body.gymId, GYM);
  assert.equal(verified.body.preset, 'instructors');
  const claims = await verifyToken(verified.body.token as string, [{ kid: 'k1', jwk: signing.publicJwk }]);
  assert.equal(claims?.src, 'seat');
  assert.equal(claims?.tier, 'seat');
  assert.equal(claims?.sid, SEAT);
  assert.equal(claims?.gym, GYM);
  assert.equal(claims?.did, 'new-device');
  assert.equal(claims?.preset, 'instructors');
  assert.equal(claims?.sub, GYM);
  const row = await seatRow(db);
  assert.equal(row?.status, 'claimed');
  assert.equal(row?.claimedDevice, 'new-device');
});

test('a revoked instructor seat does not get a code, and the generic success is unchanged', async () => {
  const db = sqliteD1();
  await insertSeat(db, { email: EMAIL, status: 'revoked', claimedDevice: 'old-device', revokedAt: NOW.toISOString() });
  const revoked = await requestCode(db, EMAIL, NOW, '203.0.113.23');
  const unknown = await requestCode(db, 'missing@gym.test', NOW, '203.0.113.24');
  assert.equal(revoked.status, unknown.status);
  assert.equal(revoked.body.message, RESTORE_GENERIC);
  assert.equal(unknown.body.message, RESTORE_GENERIC);
  assert.deepEqual(Object.keys(revoked.body), Object.keys(unknown.body));
  assert.equal(revoked.sender.sent.length, 0);
  assert.equal(unknown.sender.sent.length, 0);
  const challenges = await db.prepare(`SELECT COUNT(*) AS total FROM restore_challenges`).first<{ total: number }>();
  assert.equal(Number(challenges?.total), 0);
});

test('an unknown email sees the same restore response and does not get a code', async () => {
  const db = sqliteD1();
  const unknown = await requestCode(db, EMAIL, NOW, '203.0.113.25');
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.ok, true);
  assert.equal(unknown.body.message, RESTORE_GENERIC);
  assert.ok(unknown.body.challengeId);
  assert.equal(unknown.sender.sent.length, 0);
});

test('restore rate limits still apply to instructor seat emails', async () => {
  const db = sqliteD1();
  await insertSeat(db, { email: EMAIL, claimedDevice: 'old-device' });
  const first = await requestCode(db, EMAIL, NOW, '203.0.113.26');
  const second = await requestCode(db, EMAIL, NOW, '203.0.113.26');
  const third = await requestCode(db, EMAIL, NOW, '203.0.113.26');
  const fourth = await requestCode(db, EMAIL, NOW, '203.0.113.26');
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 200);
  assert.equal(first.body.message, RESTORE_GENERIC);
  assert.equal(fourth.status, 429);
  assert.equal(fourth.body.ok, false);
  assert.match(fourth.body.error ?? '', /wait an hour/i);
  assert.equal(first.sender.sent.length + second.sender.sent.length + third.sender.sent.length, 3);
  assert.equal(fourth.sender.sent.length, 0);
});

test('a purchase and a seat on the same email restore the purchase and move the seat', async () => {
  const db = sqliteD1();
  const signing = await keys();
  await recordPurchase(db, {
    email: EMAIL,
    product: 'advantage-white',
    source: 'stripe_payment',
    sourceRef: 'cs_seat_buyer',
    sessionId: 'cs_seat_buyer',
    pepper: PEPPER,
    now: NOW,
  });
  await insertSeat(db, { email: EMAIL, claimedDevice: 'old-device' });
  const requested = await requestCode(db, EMAIL, NOW, '203.0.113.27');
  assert.equal(requested.sender.sent.length, 1);
  const code = codeFrom(requested.sender.sent[0]?.text ?? '');
  const verified = await verifyCode(db, signing.secret, requested.body.challengeId ?? '', code, NOW, 'new-device');
  assert.equal(verified.status, 200);
  assert.ok(verified.body.token);
  assert.ok(verified.body.seatToken);
  assert.equal(verified.body.seatId, SEAT);
  const purchase = await verifyToken(verified.body.token as string, [{ kid: 'k1', jwk: signing.publicJwk }]);
  assert.notEqual(purchase?.src, 'seat');
  assert.equal(purchase?.did, 'new-device');
  assert.ok(purchase?.grants?.includes('white'));
  const seat = await verifyToken(verified.body.seatToken as string, [{ kid: 'k1', jwk: signing.publicJwk }]);
  assert.equal(seat?.src, 'seat');
  assert.equal(seat?.sid, SEAT);
  assert.equal(seat?.did, 'new-device');
  const row = await seatRow(db);
  assert.equal(row?.claimedDevice, 'new-device');
  const licenseCount = await db.prepare(`SELECT COUNT(*) AS total FROM licenses`).first<{ total: number }>();
  const seatCount = await db.prepare(`SELECT COUNT(*) AS total FROM seats`).first<{ total: number }>();
  assert.equal(Number(licenseCount?.total), 1);
  assert.equal(Number(seatCount?.total), 1);
});

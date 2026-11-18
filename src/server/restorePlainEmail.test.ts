import assert from 'node:assert/strict';
import test from 'node:test';
import { type PrivateJwk, type PublicJwk } from '../lib/entitlementToken.ts';
import { keyedHash, normalizeEmail } from './codeCrypto.ts';
import { memoryEmailSender } from './emailSender.ts';
import { CODE_FAILED, handleLogin, type LoginEnv } from './loginAccount.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { RESTORE_CODE_FAILURE, RESTORE_GENERIC, handleRestoreRequest, handleRestoreVerify } from './restoreAccess.ts';
import { sqliteD1 } from './sqliteD1.ts';
import type { D1Database } from './d1.ts';
import type { InboxBucket } from './studentInbox.ts';

/**
 * Restore codes for an account saved with only its plain email (email_normalized set,
 * email_hash NULL), like an owner account set by hand. In-memory SQLite and a memory email
 * sender only: no Resend, no Turnstile call, no production database.
 */

const PEPPER = 'restore-plain-pepper';
const NOW = new Date('2026-11-18T19:40:00.000Z');
const ORIGIN = 'https://advantagebjjtimer.com';
const MIN = 60 * 1000;

type Fixture = { db: D1Database; env: LoginEnv };

async function fixture(): Promise<Fixture> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
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
  return { db: sqliteD1(), env };
}

function post(path: string, body: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.9' },
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<{ status: number; body: Record<string, any> }> {
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function requestCode(
  f: Fixture,
  email: string,
  options: { captcha?: boolean; ip?: string } = {},
): Promise<{ status: number; body: Record<string, any>; code: string; sent: number }> {
  const sender = memoryEmailSender();
  const response = await handleRestoreRequest(
    new Request(`${ORIGIN}/api/restore/request`, {
      method: 'POST',
      headers: { 'cf-connecting-ip': options.ip ?? '203.0.113.30' },
      body: JSON.stringify({ email, turnstileToken: 'ok' }),
    }),
    f.env,
    f.db,
    sender,
    async () => new Response(JSON.stringify({ success: options.captcha !== false }), { status: 200 }),
    () => NOW,
  );
  const code = sender.sent[0]?.text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
  return { ...(await json(response)), code, sent: sender.sent.length };
}

/** An account with only email_normalized (no hash), one license, and one open grant. No identities row. */
async function plainAccount(
  f: Fixture,
  email: string,
  grant: { product: string; source: string; sourceRef: string },
): Promise<{ accountId: string; licenseId: string }> {
  const accountId = crypto.randomUUID();
  const licenseId = crypto.randomUUID();
  const stamp = NOW.toISOString();
  await f.db
    .prepare(`INSERT INTO accounts (id, email_normalized, email_hash, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)`)
    .bind(accountId, normalizeEmail(email), stamp, stamp)
    .run();
  await f.db.prepare(`INSERT INTO licenses (id, account_id, created_at) VALUES (?, ?, ?)`).bind(licenseId, accountId, stamp).run();
  await f.db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at, ends_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, NULL)`,
    )
    .bind(crypto.randomUUID(), licenseId, grant.product, grant.source, grant.sourceRef, stamp)
    .run();
  return { accountId, licenseId };
}

/** Put the account back the way it was when the code went out, so verify has to use the plain email. */
async function forgetHash(f: Fixture, accountId: string, licenseId: string): Promise<void> {
  await f.db.prepare(`UPDATE accounts SET email_hash = NULL WHERE id = ?`).bind(accountId).run();
  await f.db.prepare(`DELETE FROM identities WHERE account_id = ? OR license_id = ?`).bind(accountId, licenseId).run();
}

async function used(f: Fixture, challengeId: string): Promise<boolean> {
  const row = await f.db.prepare(`SELECT used_at AS usedAt FROM restore_challenges WHERE id = ?`).bind(challengeId).first<{ usedAt: string | null }>();
  return Boolean(row?.usedAt);
}

const OWNER_GRANT = { product: 'advantage-pro', source: 'owner', sourceRef: 'owner-academy' };

test('owner account with a plain email and no hash: request emails a code and fills in the missing hash', async () => {
  const f = await fixture();
  const email = 'Owner.Plain@Gym.test';
  const { accountId } = await plainAccount(f, email, OWNER_GRANT);
  const sent = await requestCode(f, email);
  assert.equal(sent.status, 200);
  assert.equal(sent.body.message ?? RESTORE_GENERIC, RESTORE_GENERIC);
  assert.equal(sent.sent, 1);
  assert.ok(sent.code);
  const row = await f.db.prepare(`SELECT email_hash AS emailHash FROM accounts WHERE id = ?`).bind(accountId).first<{ emailHash: string | null }>();
  assert.equal(row?.emailHash, await keyedHash(normalizeEmail(email), PEPPER, 'email'));
  // With the hash filled in, the plain /restore verify (no typed email) finds the account by hash.
  const verified = await json(await handleRestoreVerify(post('/api/restore/verify', { challengeId: sent.body.challengeId, code: sent.code, deviceId: 'owner-new-phone' }), f.env, f.db, () => NOW));
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.accountId, accountId);
});

test('Forgot password with an emailed code signs the plain-email owner in even when email_hash is still empty', async () => {
  const f = await fixture();
  const email = 'owner.plain@gym.test';
  const { accountId, licenseId } = await plainAccount(f, email, OWNER_GRANT);
  const { body, code } = await requestCode(f, email);
  assert.ok(code);
  await forgetHash(f, accountId, licenseId);
  const setup = await json(
    await handleLogin(post('/api/login/code', { email, challengeId: body.challengeId, code, password: 'long enough pw', deviceId: 'owner-phone' }), f.env, f.db, () => NOW, async () => new Response('{}', { status: 404 })),
  );
  assert.equal(setup.status, 200, JSON.stringify(setup.body));
  assert.equal(setup.body.signedIn, true);
  assert.ok(setup.body.pass?.token);
  assert.equal(setup.body.profile?.license?.accountId, accountId);
  assert.equal(await used(f, body.challengeId), true);
  // Single use still holds.
  const again = await json(
    await handleLogin(post('/api/login/code', { email, challengeId: body.challengeId, code, password: 'another pw 123' }), f.env, f.db, () => NOW, async () => new Response('{}', { status: 404 })),
  );
  assert.equal(again.status, 400);
  assert.equal(again.body.error, CODE_FAILED);
  // Password sign-in works afterwards.
  const signin = await json(await handleLogin(post('/api/login/signin', { email, password: 'long enough pw', deviceId: 'owner-phone-2' }), f.env, f.db, () => NOW, async () => new Response('{}', { status: 404 })));
  assert.equal(signin.status, 200, JSON.stringify(signin.body));
});

test('/restore verify with the typed email finds a plain-email purchase; a different typed email fails without spending the code', async () => {
  const f = await fixture();
  const email = 'plainbuyer@gym.test';
  const { accountId, licenseId } = await plainAccount(f, email, { product: 'advantage-white', source: 'stripe_payment', sourceRef: 'cs_plain' });
  const { body, code } = await requestCode(f, email);
  await forgetHash(f, accountId, licenseId);
  const wrong = await json(await handleRestoreVerify(post('/api/restore/verify', { challengeId: body.challengeId, code, email: 'someone@else.test' }), f.env, f.db, () => NOW));
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error, RESTORE_CODE_FAILURE);
  assert.equal(await used(f, body.challengeId), false);
  const ok = await json(await handleRestoreVerify(post('/api/restore/verify', { challengeId: body.challengeId, code, email: ' PlainBuyer@gym.test ', deviceId: 'pc' }), f.env, f.db, () => NOW));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.grants, ['white']);
  assert.equal(ok.body.accountId, accountId);
  assert.equal(await used(f, body.challengeId), true);
});

test('the hash lookup still wins: a hashed purchase restores its own license, not a plain-email look-alike', async () => {
  const f = await fixture();
  const { licenseId: hashed } = await recordPurchase(f.db, { email: 'hashed@gym.test', product: 'advantage-white', source: 'stripe_payment', sourceRef: 'cs_h', sessionId: 'cs_h', pepper: PEPPER, now: NOW });
  const { body, code } = await requestCode(f, 'hashed@gym.test');
  const ok = await json(await handleRestoreVerify(post('/api/restore/verify', { challengeId: body.challengeId, code, email: 'hashed@gym.test', deviceId: 'pc' }), f.env, f.db, () => NOW));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const linked = await f.db.prepare(`SELECT account_id AS accountId FROM licenses WHERE id = ?`).bind(hashed).first<{ accountId: string }>();
  assert.equal(ok.body.accountId, linked?.accountId);
});

test('plain-email fallback keeps the 15-minute expiry, Turnstile, the generic answer, and the hourly limits', async () => {
  const f = await fixture();
  const email = 'limits.plain@gym.test';
  const { accountId, licenseId } = await plainAccount(f, email, OWNER_GRANT);
  // Turnstile still required.
  const bot = await requestCode(f, email, { captcha: false });
  assert.equal(bot.status, 400);
  assert.equal(bot.sent, 0);
  // Expiry still applies.
  const first = await requestCode(f, email);
  await forgetHash(f, accountId, licenseId);
  const late = await json(await handleRestoreVerify(post('/api/restore/verify', { challengeId: first.body.challengeId, code: first.code, email }), f.env, f.db, () => new Date(NOW.getTime() + 16 * MIN)));
  assert.equal(late.status, 400);
  assert.equal(late.body.error, RESTORE_CODE_FAILURE);
  // Unknown address gets the same generic 200 and no email.
  const nobody = await requestCode(f, 'nobody.plain@gym.test');
  assert.equal(nobody.status, 200);
  assert.equal(nobody.sent, 0);
  assert.deepEqual(Object.keys(nobody.body).sort(), Object.keys(first.body).sort());
  // Three per address per hour (first + 2 more), then 429.
  await requestCode(f, email);
  await requestCode(f, email);
  const capped = await requestCode(f, email);
  assert.equal(capped.status, 429);
  assert.equal(capped.sent, 0);
});

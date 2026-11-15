import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Owner sign-in, end to end on this browser: /api/login handler (in-memory SQLite) →
 * applyLoginPayload → the doors the homepage and the Upgrade bar read.
 * Production case (Nov 14, 2026): the owner academy is one undated `source = 'owner'`
 * advantage-pro row written by an owner code (`code:owner-…:pro`), no owner-academy rows.
 */

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}
const local = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, userAgent: '' }, configurable: true });

const { verifyToken } = await import('./entitlementToken.ts');
const {
  ENTITLEMENT_TOKEN_KEY,
  ENTITLEMENT_DEVICE_KEY,
  clearEntitlementToken,
  doorOpen,
  entitlementSnapshot,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
} = await import('./entitlement.ts');
const { LEGACY_AMNESTY_ENDS_AT, PRO_RELOCK_KEY, COACH_RELOCK_KEY } = await import('./legacyUnlock.ts');
const { applyLoginPayload } = await import('./emailLogin.ts');
const { proPlusCloudUnlocked } = await import('./proPlusCloud.ts');
const { highestEdition } = await import('./editionLadder.ts');
const { handleLogin } = await import('../server/loginAccount.ts');
const { handleRestoreRequest } = await import('../server/restoreAccess.ts');
const { memoryEmailSender } = await import('../server/emailSender.ts');
const { recordPurchase } = await import('../server/purchaseRecords.ts');
const { sqliteD1 } = await import('../server/sqliteD1.ts');
const { issueToken } = await import('../server/tokenIssue.ts');

import type { LoginPayload } from './emailLogin.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';

const PEPPER = 'owner-login-pepper';
const NOW = new Date('2026-11-14T17:12:00.000Z');
const ORIGIN = 'https://advantagebjjtimer.com';
const EMAIL = 'owner@gym.test';
const DEVICE = '2aaf5962-abc8-46a0-9a87-1afbe43f0667';

async function keys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const pub = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC' as const, crv: 'P-256' as const, x: pub.x, y: pub.y } };
}

function post(path: string, body: unknown, cookie = ''): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-advantage-app': '9.9.9', ...(cookie ? { cookie } : {}), 'cf-connecting-ip': '198.51.100.9' },
    body: JSON.stringify(body),
  });
}

type Grant = { product: string; source: 'owner' | 'code' | 'stripe_payment'; sourceRef: string };

/** Signs in with the restore email code (first password), the way the owner did. */
async function signIn(grant: Grant) {
  const db = sqliteD1();
  const pair = await keys();
  const env = { CODE_HASH_PEPPER: PEPPER, ENTITLEMENT_SIGNING_KEY: pair.secret, ENTITLEMENT_KEY_ID: 'k1', TURNSTILE_SECRET_KEY: 't' };
  const { licenseId } = await recordPurchase(db, { email: EMAIL, product: grant.product, source: grant.source, sourceRef: grant.sourceRef, sessionId: grant.sourceRef, pepper: PEPPER, now: NOW } as never);
  const sender = memoryEmailSender();
  const requested = await handleRestoreRequest(
    new Request(`${ORIGIN}/api/restore/request`, { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.9' }, body: JSON.stringify({ email: EMAIL, turnstileToken: 'ok' }) }),
    env,
    db,
    sender,
    async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    () => NOW,
  );
  const { challengeId } = (await requested.json()) as { challengeId: string };
  const code = sender.sent[0]?.text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
  const response = await handleLogin(
    post('/api/login/code', { email: EMAIL, challengeId, code, password: 'long enough pw', deviceId: DEVICE }),
    env,
    db,
    () => NOW,
    async () => new Response('{}', { status: 404 }),
  );
  assert.equal(response.status, 200);
  const payload = (await response.json()) as LoginPayload;
  return { db, env, pair, licenseId, payload };
}

function resetBrowser(publicJwk: PublicJwk) {
  local.clear();
  clearEntitlementToken();
  setEntitlementClockForTests(() => NOW.getTime() + 1000);
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: publicJwk }], legacyAmnestyEndsAt: LEGACY_AMNESTY_ENDS_AT });
  local.setItem(ENTITLEMENT_DEVICE_KEY, DEVICE);
}

function homepageDoors() {
  return {
    white: doorOpen('white'),
    student: doorOpen('student'),
    media: doorOpen('media'),
    instructor: doorOpen('coach'),
    pro: doorOpen('pro'),
    'pro-cloud': proPlusCloudUnlocked(),
  };
}

const OWNER_CODE_GRANT: Grant = { product: 'advantage-pro', source: 'owner', sourceRef: `code:owner-0a218bba:${DEVICE}:pro` };

test('owner-code license: sign-in pass is an owner pass with Pro + Cloud, and the Upgrade bar has nothing to sell', async () => {
  const { pair, licenseId, payload } = await signIn(OWNER_CODE_GRANT);
  const profile = payload.profile;
  assert.equal(profile.role, 'owner');
  assert.equal(profile.license?.ownerAcademy, true);
  assert.deepEqual(profile.cloud, { entitled: true, edition: 'pro', lapsedAt: null, owner: true });
  const claims = await verifyToken(payload.pass?.token ?? '', [{ kid: 'k1', jwk: pair.publicJwk }]);
  assert.equal(claims?.sub, licenseId);
  assert.equal(claims?.src, 'owner');
  assert.equal(claims?.tier, 'owner');
  assert.ok(claims?.grants.includes('pro'));

  resetBrowser(pair.publicJwk);
  await applyLoginPayload(payload, local as unknown as Storage);
  assert.ok(local.getItem(ENTITLEMENT_TOKEN_KEY), 'the login pass is stored on this browser');
  const doors = homepageDoors();
  assert.deepEqual(doors, { white: true, student: true, media: true, instructor: true, pro: true, 'pro-cloud': true });
  // SignedInUpgradeBar hides at Pro + Cloud.
  assert.equal(highestEdition(doors), 'pro-cloud');
});

test('a Lock Pro left on this browser does not keep an owner sign-in locked', async () => {
  const { pair, payload } = await signIn(OWNER_CODE_GRANT);
  resetBrowser(pair.publicJwk);
  local.setItem(PRO_RELOCK_KEY, '1');
  local.setItem(COACH_RELOCK_KEY, '1');
  await applyLoginPayload(payload, local as unknown as Storage);
  assert.equal(doorOpen('pro'), true);
  assert.equal(doorOpen('coach'), true);
  assert.equal(proPlusCloudUnlocked(), true);
});

test('a weaker login pass never replaces a stronger owner pass already on this browser', async () => {
  // Paid Stripe Pro only: Pro, but not Cloud.
  const { pair, payload, licenseId } = await signIn({ product: 'advantage-pro', source: 'stripe_payment', sourceRef: 'cs_owner' });
  assert.equal(payload.profile.cloud, null, 'plain paid Pro is not widened to Cloud');
  resetBrowser(pair.publicJwk);
  const owner = await issueToken(pair.secret, {
    licenseId,
    grants: ['white', 'student', 'coach', 'pro', 'media'],
    tier: 'owner',
    src: 'owner',
    deviceId: DEVICE,
    now: NOW,
    kind: 'owner-test',
    ownerTestSeconds: 14 * 24 * 60 * 60,
  });
  const { acceptServerToken } = await import('./entitlement.ts');
  assert.equal(await acceptServerToken(owner ?? ''), true);
  assert.equal(proPlusCloudUnlocked(), true);
  await applyLoginPayload(payload, local as unknown as Storage);
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), owner, 'the owner pass stays');
  assert.equal(entitlementSnapshot().claims?.src, 'owner');
  assert.equal(proPlusCloudUnlocked(), true);
});

test('alpha-pro code license signs in with Cloud on; plain paid Pro does not', async () => {
  const alpha = await signIn({ product: 'advantage-pro', source: 'code', sourceRef: 'code:alpha-1:salt:pro' });
  assert.deepEqual(alpha.payload.profile.cloud, { entitled: true, edition: 'pro', lapsedAt: null });
  assert.equal(alpha.payload.profile.license?.ownerAcademy, false);
  resetBrowser(alpha.pair.publicJwk);
  await applyLoginPayload(alpha.payload, local as unknown as Storage);
  assert.equal(entitlementSnapshot().claims?.src, 'code');
  assert.equal(doorOpen('pro'), true);
  assert.equal(proPlusCloudUnlocked(), true);

  const paid = await signIn({ product: 'advantage-pro', source: 'stripe_payment', sourceRef: 'cs_paid' });
  resetBrowser(paid.pair.publicJwk);
  await applyLoginPayload(paid.payload, local as unknown as Storage);
  assert.equal(entitlementSnapshot().claims?.src, 'stripe');
  assert.equal(doorOpen('pro'), true);
  assert.equal(proPlusCloudUnlocked(), false);
});

test('sign-in replaces a seat pass with the owner pass, and an expired stronger pass is not protected', async () => {
  const { loginPassWouldDowngrade } = await import('./passDowngrade.ts');
  const now = Math.floor(NOW.getTime() / 1000);
  const seat = { src: 'seat', tier: 'seat', grants: ['white', 'student', 'coach', 'media'], exp: now + 3600 };
  const owner = { src: 'owner', tier: 'owner', grants: ['white', 'student', 'coach', 'pro', 'media'] };
  const paidPro = { src: 'stripe', tier: 'pro', grants: ['white', 'student', 'coach', 'pro', 'media'], subs: { state: 'active' } };
  assert.equal(loginPassWouldDowngrade(seat, owner, now), false);
  assert.equal(loginPassWouldDowngrade({ ...owner, exp: now + 3600 }, paidPro, now), true, 'Cloud would be lost');
  assert.equal(loginPassWouldDowngrade({ ...owner, exp: now - 1 }, paidPro, now), false);
  assert.equal(loginPassWouldDowngrade(null, paidPro, now), false);
});

test('the Pro + Cloud page links existing owners to sign in and restore', async () => {
  const { readFileSync } = await import('node:fs');
  const info = readFileSync(new URL('../pages/ProPlusCloudInfo.tsx', import.meta.url), 'utf8');
  assert.match(info, /to=\{ACCOUNT_PATH\}/);
  assert.match(info, /Sign in to restore Pro \+ Cloud/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  afterFailedUnlock,
  GENERIC_CODE_ERROR,
  looksLikeUnlockCode,
  redeemAccessCode,
  submitOwnerTestOrCode,
  UNLOCK_CODE_MISMATCH_ERROR,
  UNLOCK_CODE_NO_MATCH,
} from './codeRedeemClient.ts';
import { isCoachUnlocked, lockCoach } from './coachUnlock.ts';
import { clearEntitlementToken, entitlementSnapshot, setEntitlementClockForTests, setEntitlementConfigForTests } from './entitlement.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { isProUnlocked, lockPro } from './proUnlock.ts';
import { isStudentEditionUnlocked, lockStudentEditionBrowser } from './studentUnlock.ts';
import { isWhiteUnlocked, lockWhite } from './whiteUnlock.ts';
import { keyedHash, normalizeCode } from '../server/codeCrypto.ts';
import { handleCodeRedeem } from '../server/codeRedeem.ts';
import { resetRateLimitsForTests } from '../server/rateLimit.ts';
import { MemoryRedemptionLedger } from '../server/redemptionLedger.ts';
import { sqliteD1 } from '../server/sqliteD1.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    key: () => null,
    length: 0,
    clear: () => store.clear(),
  };
}
const local = memoryStorage();
const session = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });

const pepper = 'owner-code-test-pepper';
// Same shape the generator prints. Made up for this test only.
const CODES = {
  owner: 'ABCD-EFGH-JKLM-NPQR-ST',
  'alpha-pro': 'BCDE-FGHJ-KLMN-PQRS-TU',
  'free-white': 'CDEF-GHJK-LMNP-QRST-UV',
} as const;

async function setup() {
  local.clear();
  session.clear();
  clearEntitlementToken();
  resetRateLimitsForTests();
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } }] });
  const records = [];
  for (const [kind, code] of Object.entries(CODES)) {
    const hash = await keyedHash(normalizeCode(code), pepper, 'code');
    records.push({ id: `${kind}-${hash.slice(0, 8)}`, hash, kind });
  }
  const env = { CODE_HASH_PEPPER: pepper, CODE_CATALOG: JSON.stringify(records) };
  const db = sqliteD1();
  const ledger = new MemoryRedemptionLedger();
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string, init: RequestInit) => {
      if (String(url).includes('/api/owner-test')) return new Response(JSON.stringify({ ok: false, error: GENERIC_CODE_ERROR }), { status: 400 });
      const request = new Request(new URL(url, 'https://advantagebjjtimer.test'), { ...init, headers: { ...(init.headers as Record<string, string>), 'cf-connecting-ip': '203.0.113.50' } });
      return handleCodeRedeem(request, env, null, ledger, () => new Date(), { db, signingKey: JSON.stringify(privateJwk), keyId: 'k1' });
    },
  });
}

function relockEverything() {
  lockWhite();
  lockPro();
  lockCoach();
  lockStudentEditionBrowser();
  assert.equal(isWhiteUnlocked(), false);
  assert.equal(isProUnlocked(), false);
}

test('an owner code from the generator opens White, Student, Coach and Pro, even after every Lock button', async () => {
  await setup();
  relockEverything();
  const result = await redeemAccessCode(CODES.owner.toLowerCase().replace(/-/g, ' '));
  assert.deepEqual(result, { ok: true });
  assert.equal(isWhiteUnlocked(), true, 'white');
  assert.equal(isStudentEditionUnlocked(), true, 'student');
  assert.equal(isCoachUnlocked(), true, 'coach');
  assert.equal(isProUnlocked(), true, 'pro');
  for (const door of ['white', 'student', 'coach', 'pro'] as const) assert.equal(entitlementSnapshot().claims?.grants.includes(door), true, `token ${door}`);
});

test('the alpha-pro code still opens Pro, Coach and Student and leaves White closed', async () => {
  await setup();
  const result = await redeemAccessCode(CODES['alpha-pro']);
  assert.deepEqual(result, { ok: true });
  assert.equal(isProUnlocked(), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isStudentEditionUnlocked(), true);
  assert.equal(isWhiteUnlocked(), false);
});

test('the free White code opens White after Lock White', async () => {
  await setup();
  lockWhite();
  const result = await redeemAccessCode(CODES['free-white']);
  assert.deepEqual(result, { ok: true });
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(isProUnlocked(), false);
});

test('a code hashed with a different pepper fails with the generic message', async () => {
  await setup();
  const result = await redeemAccessCode('ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZ');
  assert.deepEqual(result, { ok: false, error: "That code didn't work." });
  assert.equal(isWhiteUnlocked(), false);
});

test('generator-shaped text is recognised as an unlock code, promo codes are not', () => {
  assert.equal(looksLikeUnlockCode(CODES.owner), true);
  assert.equal(looksLikeUnlockCode(' abcd efgh jklm npqr st '), true);
  assert.equal(looksLikeUnlockCode('ABCDEFGHJKLMNPQRST'), true);
  assert.equal(looksLikeUnlockCode('HALF50'), false);
  assert.equal(looksLikeUnlockCode('WINBYADV'), false);
  assert.equal(looksLikeUnlockCode('ABCD-EFGH-JKLM-NPQR-S0'), false, 'zero is not in the alphabet');
  assert.equal(looksLikeUnlockCode('ABCD-EFGH-JKLM-NPQR'), false, 'too short');
});

test('/buy: an unlock code that does not match is not sent to Stripe as a promo code', () => {
  assert.deepEqual(afterFailedUnlock(CODES.owner, GENERIC_CODE_ERROR), { action: 'show', error: UNLOCK_CODE_MISMATCH_ERROR });
  assert.deepEqual(afterFailedUnlock('HALF50', GENERIC_CODE_ERROR), { action: 'checkout' });
  assert.deepEqual(afterFailedUnlock(CODES['free-white'], 'This network already used this free unlock today.'), {
    action: 'show',
    error: 'This network already used this free unlock today.',
  });
});

test('an owner unlock code typed into the Owner test box is redeemed as an unlock code', async () => {
  await setup();
  relockEverything();
  const result = await submitOwnerTestOrCode({ secret: CODES.owner, tier: 'all', days: 7 });
  assert.deepEqual(result, { ok: true, via: 'code' });
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(isProUnlocked(), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isStudentEditionUnlocked(), true);
});

test('the Owner test box does not send a non-code secret to the code endpoint', async () => {
  await setup();
  let codeCalls = 0;
  const real = globalThis.fetch;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string, init: RequestInit) => {
      if (String(url).includes('/api/codes/redeem')) codeCalls += 1;
      return real(url, init);
    },
  });
  const wrong = await submitOwnerTestOrCode({ secret: 'not-the-secret', tier: 'all', days: 7 });
  assert.deepEqual(wrong, { ok: false, error: GENERIC_CODE_ERROR });
  assert.equal(codeCalls, 0);
  const mismatch = await submitOwnerTestOrCode({ secret: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZ', tier: 'all', days: 7 });
  assert.deepEqual(mismatch, { ok: false, error: UNLOCK_CODE_NO_MATCH });
  assert.equal(codeCalls, 1);
  assert.equal(isWhiteUnlocked(), false);
});

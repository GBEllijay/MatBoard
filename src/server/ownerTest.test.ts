import assert from 'node:assert/strict';
import test from 'node:test';
import { paidChunkAllowed } from '../lib/paidChunkAccess.ts';
import { verifyToken, type PrivateJwk, type PublicJwk } from '../lib/entitlementToken.ts';
import { handleOwnerTest } from './ownerTest.ts';
import { GENERIC_CODE_FAILURE } from './paywallDecisions.ts';
import { resetRateLimitsForTests } from './rateLimit.ts';

function post(body: unknown, ip = '198.51.100.10'): Request {
  return new Request('http://localhost/api/owner-test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

test('owner test unlock works only with the server secret', async () => {
  resetRateLimitsForTests();
  const env = { OWNER_TEST_SECRET: 'test-secret-value' };
  const yes = await handleOwnerTest(post({ secret: 'test-secret-value', tier: 'pro', days: 1 }, '198.51.100.11'), env);
  assert.equal(yes.status, 200);
  const body = (await yes.json()) as { ok: boolean; grants: string[]; expiresAt: string; source: string };
  assert.equal(body.ok, true);
  assert.deepEqual(body.grants, ['pro', 'student']);
  assert.equal(body.source, 'owner-test');
  assert.ok(Date.parse(body.expiresAt) > Date.now());
  assert.equal(JSON.stringify(body).includes('test-secret-value'), false);

  const media = await handleOwnerTest(post({ secret: 'test-secret-value', tier: 'media', days: 1 }, '198.51.100.17'), env);
  assert.deepEqual(((await media.json()) as { grants: string[] }).grants, ['media']);
  const seat = await handleOwnerTest(post({ secret: 'test-secret-value', tier: 'seat', days: 30 }, '198.51.100.12'), env);
  assert.deepEqual(((await seat.json()) as { grants: string[] }).grants, ['seat']);
  const all = await handleOwnerTest(post({ secret: 'test-secret-value', tier: 'all', days: 99 }, '198.51.100.13'), env);
  const allBody = (await all.json()) as { grants: string[] };
  assert.deepEqual(allBody.grants.sort(), ['coach', 'media', 'pro', 'seat', 'student', 'white']);

  const wrong = await handleOwnerTest(post({ secret: 'nope', tier: 'all' }, '198.51.100.14'), env);
  const unset = await handleOwnerTest(post({ secret: 'test-secret-value', tier: 'all' }, '198.51.100.15'), {});
  assert.equal(wrong.status, 400);
  assert.equal(unset.status, 400);
  assert.deepEqual(await wrong.json(), await unset.json());
  assert.equal(((await handleOwnerTest(post({ secret: '', tier: 'all' }, '198.51.100.16'), env)).status), 400);
  assert.equal(GENERIC_CODE_FAILURE, "That code didn't work.");
});

test('owner test seat and pro passes can load the paid screens they open', async () => {
  resetRateLimitsForTests();
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  const env = { OWNER_TEST_SECRET: 'test-secret-value', ENTITLEMENT_SIGNING_KEY: JSON.stringify(privateJwk) };
  const now = Date.now();
  const keys = [{ kid: 'k1', jwk: { kty: 'EC' as const, crv: 'P-256' as const, x: publicJwk.x, y: publicJwk.y } }];

  const seat = await handleOwnerTest(post({ secret: 'test-secret-value', tier: 'seat', days: 7 }, '198.51.100.40'), env);
  const seatBody = (await seat.json()) as { ok: boolean; token?: string; grants: string[] };
  assert.equal(seatBody.ok, true);
  assert.deepEqual(seatBody.grants, ['seat']);
  assert.equal(typeof seatBody.token, 'string');
  const seatClaims = await verifyToken(seatBody.token ?? '', keys);
  assert.equal(seatClaims?.tier, 'seat');
  assert.equal(seatClaims?.preset, 'instructors');
  assert.equal(seatClaims?.subs, undefined);
  assert.equal(paidChunkAllowed(seatClaims!, 'media-console', now), true);
  assert.equal(paidChunkAllowed(seatClaims!, 'lesson-cloud', now), true);
  assert.equal(paidChunkAllowed(seatClaims!, 'pro-console', now), true);
  assert.equal(paidChunkAllowed(seatClaims!, 'coach-unlimited', now), false);

  const tiers = ['white', 'student', 'coach', 'pro', 'all'] as const;
  for (const tier of tiers) {
    const response = await handleOwnerTest(
      post({ secret: 'test-secret-value', tier, days: 1 }, `198.51.100.${40 + tiers.indexOf(tier)}`),
      env,
    );
    const body = (await response.json()) as { token?: string; grants: string[] };
    assert.equal(response.status, 200, tier);
    assert.equal(typeof body.token, 'string', tier);
    const claims = await verifyToken(body.token ?? '', keys);
    assert.ok(claims, tier);
    const proOpen = body.grants.includes('pro');
    assert.equal(paidChunkAllowed(claims!, 'pro-console', now), proOpen, tier);
    assert.equal(paidChunkAllowed(claims!, 'coach-unlimited', now), proOpen, tier);
  }
});

test('owner test is rate limited and clear needs the secret', async () => {
  resetRateLimitsForTests();
  const env = { OWNER_TEST_SECRET: 'test-secret-value' };
  let limited = 0;
  for (let index = 0; index < 12; index += 1) {
    const response = await handleOwnerTest(post({ secret: 'nope', tier: 'white' }, '198.51.100.20'), env);
    if (response.status === 429) limited += 1;
  }
  assert.ok(limited > 0);
  resetRateLimitsForTests();
  const cleared = await handleOwnerTest(post({ secret: 'test-secret-value', action: 'clear' }, '198.51.100.21'), env);
  assert.equal(cleared.status, 200);
  assert.equal(((await cleared.json()) as { cleared: boolean }).cleared, true);
  const denied = await handleOwnerTest(post({ secret: 'nope', action: 'clear' }, '198.51.100.22'), env);
  assert.equal(denied.status, 400);
});

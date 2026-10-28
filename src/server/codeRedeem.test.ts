import assert from 'node:assert/strict';
import test from 'node:test';
import { keyedHash, normalizeCode, normalizeEmail, timingSafeEqual } from './codeCrypto.ts';
import { handleCodeRedeem } from './codeRedeem.ts';
import { MemoryRedemptionLedger } from './redemptionLedger.ts';
import { resetRateLimitsForTests } from './rateLimit.ts';
import { FREE_WHITE_DAILY_CAP, FREE_WHITE_GRANT_DAYS, FREE_WHITE_PER_IP_PER_DAY, FREE_WHITE_TOTAL_CAP } from './paywallDecisions.ts';

const pepper = 'test-pepper';

async function catalog(kind: 'owner' | 'alpha-pro' | 'alpha-coach' | 'alpha-student' | 'free-white', code: string) {
  const hash = await keyedHash(normalizeCode(code), pepper, 'code');
  return JSON.stringify([{ id: kind, hash, kind }]);
}

function post(body: unknown, ip = '203.0.113.10'): Request {
  return new Request('http://localhost/api/codes/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

test('keyed hashes are peppered and compared in constant time', async () => {
  const left = await keyedHash('same-code', pepper, 'code');
  const right = await keyedHash('same-code', pepper, 'code');
  const other = await keyedHash('same-code', 'other-pepper', 'code');
  assert.equal(left, right);
  assert.notEqual(left, other);
  assert.equal(timingSafeEqual(left, right), true);
  assert.equal(timingSafeEqual(left, other), false);
  assert.equal(timingSafeEqual(left, left.slice(0, -1)), false);
  assert.equal(normalizeEmail('A.B+tag@gmail.com'), 'ab@gmail.com');
  assert.equal(normalizeEmail('Coach@Gym.com'), 'coach@gym.com');
});

test('a hashed owner code grants every door and a wrong code does not', async () => {
  resetRateLimitsForTests();
  const env = { CODE_HASH_PEPPER: pepper, CODE_CATALOG: await catalog('owner', 'fresh-owner-code') };
  const yes = await handleCodeRedeem(post({ code: ' FRESH-OWNER-CODE ' }, '203.0.113.11'), env);
  assert.equal(yes.status, 200);
  const body = (await yes.json()) as { ok: boolean; grants: string[]; source: string };
  assert.equal(body.ok, true);
  assert.deepEqual(body.grants.sort(), ['coach', 'pro', 'student', 'white']);
  assert.equal(body.source, 'code');
  assert.equal(JSON.stringify(body).includes('fresh-owner-code'), false);

  const no = await handleCodeRedeem(post({ code: 'nope' }, '203.0.113.12'), env);
  assert.equal(no.status, 400);
  const miss = (await no.json()) as { error: string; grants?: string[] };
  assert.equal(miss.error, "That code didn't work.");
  assert.equal(miss.grants, undefined);
});

test('alpha codes keep the old door rules', async () => {
  resetRateLimitsForTests();
  const pro = await handleCodeRedeem(post({ code: 'pro-alpha' }, '203.0.113.20'), {
    CODE_HASH_PEPPER: pepper,
    CODE_CATALOG: await catalog('alpha-pro', 'pro-alpha'),
  });
  assert.deepEqual(((await pro.json()) as { grants: string[] }).grants.sort(), ['pro', 'student']);
  const coach = await handleCodeRedeem(post({ code: 'coach-alpha' }, '203.0.113.21'), {
    CODE_HASH_PEPPER: pepper,
    CODE_CATALOG: await catalog('alpha-coach', 'coach-alpha'),
  });
  assert.deepEqual(((await coach.json()) as { grants: string[] }).grants, ['coach']);
  const student = await handleCodeRedeem(post({ code: 'student-alpha' }, '203.0.113.22'), {
    CODE_HASH_PEPPER: pepper,
    CODE_CATALOG: await catalog('alpha-student', 'student-alpha'),
  });
  assert.deepEqual(((await student.json()) as { grants: string[] }).grants, ['student']);
});

test('free white caps are enforced and email is optional', async () => {
  resetRateLimitsForTests();
  const ledger = new MemoryRedemptionLedger();
  const env = { CODE_HASH_PEPPER: pepper, CODE_CATALOG: await catalog('free-white', 'free-campaign') };
  const now = new Date('2026-10-28T15:00:00.000Z');
  const first = await handleCodeRedeem(post({ code: 'free-campaign' }, '203.0.113.30'), env, null, ledger, () => now);
  assert.equal(first.status, 200);
  const granted = (await first.json()) as { grants: string[]; expiresAt: string };
  assert.deepEqual(granted.grants, ['white']);
  const expires = Date.parse(granted.expiresAt) - now.getTime();
  assert.equal(Math.round(expires / 86400000), FREE_WHITE_GRANT_DAYS);

  const second = await handleCodeRedeem(post({ code: 'free-campaign' }, '203.0.113.30'), env, null, ledger, () => now);
  assert.equal(second.status, 200);
  const third = await handleCodeRedeem(post({ code: 'free-campaign' }, '203.0.113.30'), env, null, ledger, () => now);
  assert.equal(third.status, 409);
  assert.match(((await third.json()) as { error: string }).error, /network/i);

  const emailed = await handleCodeRedeem(
    post({ code: 'free-campaign', email: 'A.B+tag@gmail.com' }, '203.0.113.40'),
    env,
    null,
    ledger,
    () => now,
  );
  assert.equal(emailed.status, 200);
  const again = await handleCodeRedeem(
    post({ code: 'free-campaign', email: 'ab@gmail.com' }, '203.0.113.41'),
    env,
    null,
    ledger,
    () => now,
  );
  assert.equal(again.status, 409);
  assert.match(((await again.json()) as { error: string }).error, /email/i);

  assert.equal(FREE_WHITE_TOTAL_CAP, 300);
  assert.equal(FREE_WHITE_DAILY_CAP, 25);
  assert.equal(FREE_WHITE_PER_IP_PER_DAY, 2);
});

test('parallel free redemptions do not pass the total cap', async () => {
  resetRateLimitsForTests();
  const ledger = new MemoryRedemptionLedger();
  const env = {
    CODE_HASH_PEPPER: pepper,
    CODE_CATALOG: JSON.stringify([{ id: 'free-white', hash: await keyedHash(normalizeCode('cap-code'), pepper, 'code'), kind: 'free-white', maxUses: 5, dailyCap: 100, perEmail: null, perIpPerDay: null }]),
  };
  const now = () => new Date('2026-10-28T16:00:00.000Z');
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      handleCodeRedeem(post({ code: 'cap-code' }, `203.0.113.${index + 1}`), env, null, ledger, now),
    ),
  );
  const ok = results.filter((response) => response.status === 200).length;
  assert.equal(ok, 5);
  assert.equal(ledger.snapshot()['total:free-white'], 5);
});

test('redeem is disabled without a pepper and rate limited', async () => {
  resetRateLimitsForTests();
  const missing = await handleCodeRedeem(post({ code: 'anything' }, '203.0.113.80'), {});
  assert.equal(missing.status, 503);
  assert.match(((await missing.json()) as { error: string }).error, /CODE_HASH_PEPPER/);

  const env = { CODE_HASH_PEPPER: pepper, CODE_CATALOG: await catalog('owner', 'rate-code') };
  let limited = 0;
  for (let index = 0; index < 25; index += 1) {
    const response = await handleCodeRedeem(post({ code: 'nope' }, '203.0.113.81'), env);
    if (response.status === 429) limited += 1;
  }
  assert.ok(limited > 0);
});

test('unknown and expired codes share one failure', async () => {
  resetRateLimitsForTests();
  const hash = await keyedHash(normalizeCode('old-code'), pepper, 'code');
  const env = {
    CODE_HASH_PEPPER: pepper,
    CODE_CATALOG: JSON.stringify([{ id: 'old', hash, kind: 'owner', expiresAt: '2020-01-01T00:00:00.000Z' }]),
  };
  const expired = await handleCodeRedeem(post({ code: 'old-code' }, '203.0.113.90'), env, null, null, () => new Date('2026-10-28T00:00:00.000Z'));
  const unknown = await handleCodeRedeem(post({ code: 'missing' }, '203.0.113.91'), env);
  const left = await expired.json();
  const right = await unknown.json();
  assert.deepEqual(left, right);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { clearOwnerTestUnlock, submitOwnerTest } from './codeRedeemClient.ts';
import { isCoachUnlocked, lockCoach } from './coachUnlock.ts';
import {
  acceptServerToken,
  clearEntitlementToken,
  ENTITLEMENT_TOKEN_KEY,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
} from './entitlement.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { readCurrentSeat } from './instructorSeats.ts';
import { clearOwnerTestGrant, dropOwnerTestDoors, ownerTestActive, readOwnerTestGrant } from './ownerTestGrant.ts';
import { coachDoorOpen, mediaConsoleDoorOpen } from './productNames.ts';
import { isProUnlocked, lockPro } from './proUnlock.ts';
import { isStudentEditionRelocked, isStudentEditionUnlocked, lockStudentEditionBrowser } from './studentUnlock.ts';
import { isWhiteUnlocked } from './whiteUnlock.ts';
import { issueToken } from '../server/tokenIssue.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: () => null,
    length: 0,
    clear() {
      store.clear();
    },
  };
}

const local = memoryStorage();
const session = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });

const NOW = new Date('2026-10-30T12:00:00.000Z');
const ALL = ['white', 'student', 'coach', 'pro', 'seat'];

async function keys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC' as const, crv: 'P-256' as const, x: publicJwk.x, y: publicJwk.y } };
}

/** Same response shape as src/server/ownerTest.ts. No real secret is used or sent anywhere. */
async function ownerTestResponse(secret: string | null, tier: 'all' | 'pro', grants: string[]) {
  const doors = tier === 'all' ? (['white', 'student', 'coach', 'pro'] as const) : (['pro', 'student', 'coach'] as const);
  const token = secret
    ? await issueToken(secret, {
        licenseId: 'owner-test',
        grants: [...doors],
        tier: 'owner',
        src: 'owner',
        deviceId: 'dev',
        now: NOW,
        kind: 'owner-test',
        ownerTestSeconds: 7 * 24 * 60 * 60,
      })
    : null;
  return {
    ok: true,
    grants,
    expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    source: 'owner-test',
    tier,
    ...(token ? { token, deviceId: 'dev' } : { degraded: true }),
  };
}

function mockOwnerTestServer(body: () => Promise<unknown>) {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => new Response(JSON.stringify(await body()), { status: 200 }),
  });
}

async function runOwnerTest() {
  const result = await submitOwnerTest({ secret: 'placeholder', tier: 'all', days: 7 });
  assert.equal(result.ok, true);
}

function mediaConsoleOpen(): boolean {
  const seat = readCurrentSeat();
  return mediaConsoleDoorOpen({
    proUnlocked: isProUnlocked(),
    seated: Boolean(seat),
    seatGrantsMedia: Boolean(seat && (seat.permissions.galleryUpload || seat.permissions.eventsAccess || seat.permissions.proShopAccess)),
    programDirectorSeat: false,
    coachMenus: false,
  });
}

function assertAllOpen(label: string) {
  assert.equal(isWhiteUnlocked(), true, `${label}: white`);
  assert.equal(isStudentEditionUnlocked(), true, `${label}: student`);
  assert.equal(isCoachUnlocked(), true, `${label}: coach`);
  assert.equal(isProUnlocked(), true, `${label}: pro`);
  assert.ok(readCurrentSeat(), `${label}: owner test seat`);
}

function reset() {
  local.clear();
  session.clear();
  clearEntitlementToken();
  clearOwnerTestGrant();
}

async function signedSetup() {
  reset();
  const pair = await keys();
  setEntitlementClockForTests(() => NOW.getTime());
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: pair.publicJwk }] });
  mockOwnerTestServer(() => ownerTestResponse(pair.secret, 'all', ALL));
  return pair;
}

function teardown() {
  reset();
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests(null);
}

test('owner test all, Lock Pro, then owner test again reopens everything', async () => {
  await signedSetup();
  await runOwnerTest();
  assertAllOpen('first owner test');

  lockPro();
  assert.equal(isProUnlocked(), false);
  assert.equal(readCurrentSeat(), null, 'Lock Pro removes the fake owner-test seat');
  assert.equal(ownerTestActive('seat'), false);
  assert.equal(mediaConsoleOpen(), false, 'Media Console closes with Pro');
  assert.equal(isCoachUnlocked(), true, 'Coach stays');
  assert.equal(isWhiteUnlocked(), true, 'White stays');
  assert.equal(isStudentEditionUnlocked(), true, 'Student Edition stays when it was granted on its own');

  await runOwnerTest();
  assertAllOpen('after Lock Pro');
  assert.equal(mediaConsoleOpen(), true);
  teardown();
});

test('Lock Coach closes Coach and leaves Pro, White, and Student Edition', async () => {
  await signedSetup();
  await runOwnerTest();
  lockCoach();
  assert.equal(isCoachUnlocked(), false);
  assert.equal(ownerTestActive('coach'), false);
  assert.equal(readCurrentSeat(), null, 'the owner-test seat no longer holds the Coach card open');
  assert.equal(coachDoorOpen(false, isCoachUnlocked(), Boolean(readCurrentSeat())), false);
  assert.equal(isProUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(isStudentEditionUnlocked(), true);

  await runOwnerTest();
  assertAllOpen('after Lock Coach');
  teardown();
});

test('Lock Student Edition, then owner test again reopens it even after Clear test unlock', async () => {
  await signedSetup();
  await runOwnerTest();
  lockStudentEditionBrowser();
  assert.equal(isStudentEditionRelocked(), true);
  assert.equal(isStudentEditionUnlocked(), false);
  assert.equal(ownerTestActive('student'), false);
  assert.equal(isProUnlocked(), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);

  clearOwnerTestUnlock();
  await runOwnerTest();
  assert.equal(isStudentEditionRelocked(), false);
  assertAllOpen('after Lock Student Edition');
  teardown();
});

test('Clear test unlock closes every door and removes only the owner-test token', async () => {
  const pair = await signedSetup();
  await runOwnerTest();
  assertAllOpen('before clear');
  clearOwnerTestUnlock();
  assert.equal(readOwnerTestGrant(), null);
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), null);
  assert.equal(isWhiteUnlocked(), false);
  assert.equal(isStudentEditionUnlocked(), false);
  assert.equal(isCoachUnlocked(), false);
  assert.equal(isProUnlocked(), false);
  assert.equal(readCurrentSeat(), null);

  const paid = await issueToken(pair.secret, {
    licenseId: 'lic-paid',
    grants: ['white'],
    tier: 'white',
    src: 'stripe',
    deviceId: 'dev',
    now: NOW,
    kind: 'onetime',
  });
  assert.equal(await acceptServerToken(paid as string), true);
  clearOwnerTestUnlock();
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), paid, 'a paid token is not an owner-test token');
  assert.equal(isWhiteUnlocked(), true);
  teardown();
});

test('without a signing key the session record alone follows each Lock', async () => {
  reset();
  setEntitlementClockForTests(() => NOW.getTime());
  setEntitlementConfigForTests({ signing: false, keys: [] });
  mockOwnerTestServer(() => ownerTestResponse(null, 'all', ALL));
  await runOwnerTest();
  assertAllOpen('degraded owner test');
  lockPro();
  assert.deepEqual(readOwnerTestGrant()?.grants, ['white', 'student', 'coach']);
  lockCoach();
  assert.deepEqual(readOwnerTestGrant()?.grants, ['white', 'student']);
  lockStudentEditionBrowser();
  assert.deepEqual(readOwnerTestGrant()?.grants, ['white']);
  dropOwnerTestDoors(['white']);
  assert.equal(readOwnerTestGrant(), null, 'an empty record is removed');
  await runOwnerTest();
  assertAllOpen('degraded owner test again');
  teardown();
});

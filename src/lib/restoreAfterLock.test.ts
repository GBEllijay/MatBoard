import assert from 'node:assert/strict';
import test from 'node:test';
import { expandGrants } from '../server/grantMatrix.ts';
import { issueToken } from '../server/tokenIssue.ts';
import { isCoachUnlocked } from './coachUnlock.ts';
import {
  acceptServerToken,
  clearEntitlementToken,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
} from './entitlement.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { isProUnlocked, lockPro } from './proUnlock.ts';
import { acceptRestoredToken } from './restoreAccept.ts';
import { isStudentEditionUnlocked } from './studentUnlock.ts';
import { isWhiteUnlocked } from './whiteUnlock.ts';

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
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });

const NOW = new Date('2026-10-30T12:00:00.000Z');
let privateJwk = '';

async function setupKeys(): Promise<void> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  privateJwk = JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
  const pub = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  setEntitlementClockForTests(() => NOW.getTime());
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }] });
}

async function pass(grants: string[], licenseId: string, src: 'stripe' | 'code' = 'stripe'): Promise<string> {
  return (await issueToken(privateJwk, {
    licenseId,
    grants: expandGrants(grants),
    tier: grants.includes('pro') ? 'pro' : 'white',
    src,
    deviceId: 'dev',
    now: NOW,
    kind: 'onetime',
  })) as string;
}

function state() {
  return { pro: isProUnlocked(), coach: isCoachUnlocked(), student: isStudentEditionUnlocked(), white: isWhiteUnlocked() };
}

async function proThenLock(): Promise<void> {
  local.clear();
  clearEntitlementToken();
  assert.equal(await acceptServerToken(await pass(['pro'], 'lic-pro', 'code')), true);
  assert.deepEqual(state(), { pro: true, coach: true, student: true, white: true });
  lockPro();
  assert.deepEqual(state(), { pro: false, coach: false, student: false, white: false });
}

test('restore after Lock Pro with a White-only pass reopens White and leaves Pro, Coach and Student locked', async () => {
  await setupKeys();
  await proThenLock();
  assert.equal(await acceptRestoredToken(await pass(['white'], 'lic-white')), true);
  assert.deepEqual(state(), { pro: false, coach: false, student: false, white: true });
  assert.equal(local.getItem('advantage.proRelocked'), '1');
  assert.equal(local.getItem('advantage.coachRelocked'), '1');
  assert.equal(local.getItem('advantage.studentEditionRelocked'), '1');
  assert.equal(local.getItem('advantage.whiteRelocked'), null);
});

test('restore after Lock Pro with a Pro pass reopens all four doors', async () => {
  await setupKeys();
  await proThenLock();
  assert.equal(await acceptRestoredToken(await pass(['pro'], 'lic-pro')), true);
  assert.deepEqual(state(), { pro: true, coach: true, student: true, white: true });
});

test('a restore pass that fails to verify clears no Lock marks', async () => {
  await setupKeys();
  await proThenLock();
  assert.equal(await acceptRestoredToken('not.a.token'), false);
  assert.deepEqual(state(), { pro: false, coach: false, student: false, white: false });
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests(null);
  clearEntitlementToken();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { clearOwnerTestUnlock } from './codeRedeemClient.ts';
import {
  acceptServerToken,
  clearEntitlementToken,
  doorOpen,
  ENTITLEMENT_TOKEN_KEY,
  setEntitlementConfigForTests,
} from './entitlement.ts';
import { refreshEntitlement } from './entitlementRefresh.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { DRIVE_BINDING_KEY } from './googleDrive.ts';
import { GYM_PROFILE_KEY } from './gymProfile.ts';
import {
  INSTRUCTOR_SEAT_SESSION_KEY,
  INSTRUCTOR_SEATS_STORAGE_KEY,
} from './instructorSeats.ts';
import { applyOwnerTestGrant, readOwnerTestGrant } from './ownerTestGrant.ts';
import { isProUnlocked } from './proUnlock.ts';
import { signOutThisDevice } from './signOut.ts';
import { STUDENT_EDITION_STORAGE_KEY } from './studentEdition.ts';
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

const NOW = new Date('2026-11-08T15:00:00.000Z');

async function keys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC' as const, crv: 'P-256' as const, x: publicJwk.x, y: publicJwk.y } };
}

async function ownerPass(secret: string, licenseId: string) {
  return issueToken(secret, {
    licenseId,
    grants: ['pro', 'coach', 'media', 'student', 'white'],
    tier: 'owner',
    src: 'owner',
    deviceId: 'phone',
    now: NOW,
    kind: 'owner-test',
    ownerTestSeconds: 7 * 24 * 60 * 60,
  });
}

test('Clear test unlock removes a database owner pass and leaves a paid pass', async () => {
  const pair = await keys();
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: pair.publicJwk }] });
  clearEntitlementToken();
  const databasePass = await ownerPass(pair.secret, crypto.randomUUID());
  assert.ok(databasePass);
  local.setItem(ENTITLEMENT_TOKEN_KEY, databasePass);
  applyOwnerTestGrant({ grants: ['pro', 'seat'], expiresAt: '2099-01-01T00:00:00.000Z', tier: 'all' });
  clearOwnerTestUnlock();
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), null);
  assert.equal(readOwnerTestGrant(), null);
  assert.equal(isProUnlocked(), false);

  const literal = await ownerPass(pair.secret, 'owner-test');
  assert.ok(literal);
  assert.equal(await acceptServerToken(literal), true);
  clearOwnerTestUnlock();
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), null);

  const paid = await issueToken(pair.secret, {
    licenseId: 'lic-paid',
    grants: ['white'],
    tier: 'white',
    src: 'stripe',
    deviceId: 'phone',
    now: NOW,
    kind: 'onetime',
  });
  assert.ok(paid);
  clearEntitlementToken();
  local.setItem(ENTITLEMENT_TOKEN_KEY, paid);
  clearOwnerTestUnlock();
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), paid);
});

test('sign out closes this browser and keeps the journal, roster, profile, and Drive', async () => {
  const pair = await keys();
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: pair.publicJwk }] });
  const pass = await ownerPass(pair.secret, crypto.randomUUID());
  assert.ok(pass);
  assert.equal(await acceptServerToken(pass), true);
  local.setItem('advantage.proUnlocked', '1');
  local.setItem('advantage.coachUnlocked', '1');
  local.setItem(STUDENT_EDITION_STORAGE_KEY, '{"journal":"kept"}');
  local.setItem(GYM_PROFILE_KEY, '{"v":1,"founders":"kept"}');
  local.setItem(DRIVE_BINDING_KEY, '{"folderId":"kept"}');
  local.setItem(INSTRUCTOR_SEATS_STORAGE_KEY, '{"seats":[{"id":"seat-1"}]}');
  local.setItem(INSTRUCTOR_SEAT_SESSION_KEY, 'seat-1');
  applyOwnerTestGrant({ grants: ['pro'], expiresAt: '2099-01-01T00:00:00.000Z', tier: 'pro' });
  assert.equal(doorOpen('pro'), true);

  signOutThisDevice();

  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), null);
  assert.equal(local.getItem('advantage.proUnlocked'), null);
  assert.equal(local.getItem('advantage.coachUnlocked'), null);
  assert.equal(readOwnerTestGrant(), null);
  assert.equal(local.getItem(INSTRUCTOR_SEAT_SESSION_KEY), null);
  assert.equal(doorOpen('pro'), false);
  assert.equal(isProUnlocked(), false);
  assert.equal(local.getItem(STUDENT_EDITION_STORAGE_KEY), '{"journal":"kept"}');
  assert.equal(local.getItem(GYM_PROFILE_KEY), '{"v":1,"founders":"kept"}');
  assert.equal(local.getItem(DRIVE_BINDING_KEY), '{"folderId":"kept"}');
  assert.equal(local.getItem(INSTRUCTOR_SEATS_STORAGE_KEY), '{"seats":[{"id":"seat-1"}]}');

  assert.equal(await refreshEntitlement(), false);
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), null);
});

test('a refresh already in flight cannot put the pass back after sign out', async () => {
  const pair = await keys();
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: pair.publicJwk }] });
  const pass = await ownerPass(pair.secret, crypto.randomUUID());
  assert.ok(pass);
  assert.equal(await acceptServerToken(pass), true);
  const replacement = await ownerPass(pair.secret, crypto.randomUUID());
  assert.ok(replacement);
  let release: (response: Response) => void = () => undefined;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const previous = globalThis.fetch;
  globalThis.fetch = (() => pending) as typeof fetch;
  const refreshing = refreshEntitlement();
  signOutThisDevice();
  release(new Response(JSON.stringify({ ok: true, token: replacement }), { status: 200 }));
  assert.equal(await refreshing, false);
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), null);
  assert.equal(doorOpen('pro'), false);
  globalThis.fetch = previous;
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { doorOpen, acceptServerToken, clearEntitlementToken, setEntitlementClockForTests, setEntitlementConfigForTests } from './entitlement.ts';
import { issueToken } from '../server/tokenIssue.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { BRACKET_PHOTO_KEY } from './bracketPhoto.ts';
import { GYM_LOGO_STORAGE_KEY } from './gymLogo.ts';
import { lockedDataSnapshot } from './lockedExport.ts';
import { DRIVE_BINDING_KEY } from './googleDrive.ts';
import { ONEDRIVE_BINDING_KEY } from './oneDrive.ts';
import { RANK_PHOTO_KEY } from './rankPhotos.ts';
import { legacySeatBlocked, noteSeatSunset } from './seatSunset.ts';

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
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
    clear() {
      throw new Error('localStorage.clear must not run');
    },
  };
}

const local = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });

async function pair() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC' as const, crv: 'P-256' as const, x: publicJwk.x, y: publicJwk.y } };
}

test('a locked Pro token keeps one-time doors and an export does not touch media', async () => {
  const calls: string[] = [];
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      open() {
        calls.push('open');
        throw new Error('export must not open IndexedDB');
      },
    },
  });
  const media: Record<string, string> = {
    [GYM_LOGO_STORAGE_KEY]: 'logo',
    [RANK_PHOTO_KEY]: 'rank',
    [BRACKET_PHOTO_KEY]: 'bracket',
    [DRIVE_BINDING_KEY]: 'drive',
    [ONEDRIVE_BINDING_KEY]: 'onedrive',
    'matboard.gallery.v1': 'photos',
  };
  for (const [key, value] of Object.entries(media)) local.setItem(key, value);
  const keys = await pair();
  const now = new Date('2026-10-08T00:00:00.000Z');
  const token = await issueToken(keys.secret, {
    licenseId: 'lic',
    grants: ['white', 'student'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'dev',
    now,
    kind: 'pro',
    subs: { state: 'locked' },
  });
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: keys.publicJwk }] });
  setEntitlementClockForTests(() => now.getTime());
  assert.equal(await acceptServerToken(token as string), true);
  assert.equal(doorOpen('pro'), false);
  assert.equal(doorOpen('coach'), false);
  assert.equal(doorOpen('white'), true);
  assert.equal(doorOpen('student'), true);
  const before = lockedDataSnapshot(local);
  const after = lockedDataSnapshot(local);
  assert.equal(after[GYM_LOGO_STORAGE_KEY], 'logo');
  assert.equal(after[DRIVE_BINDING_KEY], 'drive');
  assert.equal(after[ONEDRIVE_BINDING_KEY], 'onedrive');
  assert.equal(JSON.stringify(before), JSON.stringify(after));
  for (const [key, value] of Object.entries(media)) assert.equal(local.getItem(key), value, key);
  assert.equal(calls.length, 0);
  assert.equal(before['advantage.entitlement.token'], undefined);

  const grace = await issueToken(keys.secret, {
    licenseId: 'lic',
    grants: ['pro', 'student', 'coach'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'dev',
    now,
    kind: 'pro',
    subs: { state: 'grace', lock_at: '2026-10-09T00:00:00.000Z' },
  });
  clearEntitlementToken();
  assert.equal(await acceptServerToken(grace as string), true);
  assert.equal(doorOpen('pro'), true);
  assert.equal(doorOpen('student'), true);
  assert.equal(doorOpen('coach'), true);
  assert.equal(doorOpen('white'), false);
  setEntitlementClockForTests(() => Date.parse('2026-10-09T00:00:00.000Z'));
  assert.equal(doorOpen('pro'), false);
  assert.equal(doorOpen('white'), false);
  for (const [key, value] of Object.entries(media)) assert.equal(local.getItem(key), value, key);
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests(null);
  clearEntitlementToken();
});

test('unsigned seats stay usable until the sunset date is configured and passed', () => {
  noteSeatSunset(null);
  assert.equal(legacySeatBlocked('legacy-token'), false);
  noteSeatSunset('2026-12-28T00:00:00.000Z');
  assert.equal(legacySeatBlocked('legacy-token', Date.parse('2026-12-01T00:00:00.000Z')), false);
  assert.equal(legacySeatBlocked('legacy-token', Date.parse('2026-12-28T00:00:00.000Z')), true);
  noteSeatSunset(null);
});

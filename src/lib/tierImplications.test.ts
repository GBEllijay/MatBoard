import assert from 'node:assert/strict';
import test from 'node:test';
import { IMPLIED_DOORS, doorsThatOpen, impliedDoors } from './tierImplications.ts';
import { expandGrants, grantsForProduct } from '../server/grantMatrix.ts';
import { CODE_KINDS, grantsForKind } from '../server/codeCatalog.ts';
import { proGrantOpen } from './paidChunkAccess.ts';
import { isCoachUnlocked, lockCoach } from './coachUnlock.ts';
import {
  acceptServerToken,
  clearEntitlementToken,
  clearRelocksFor,
  doorOpen,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
} from './entitlement.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { COACH_RELOCK_KEY, PRO_RELOCK_KEY, STUDENT_RELOCK_KEY, WHITE_RELOCK_KEY } from './legacyUnlock.ts';
import { isProUnlocked, lockPro } from './proUnlock.ts';
import { isStudentEditionUnlocked } from './studentUnlock.ts';
import { isWhiteUnlocked } from './whiteUnlock.ts';
import { issueToken } from '../server/tokenIssue.ts';

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

test('the tier table is pinned to the ladder: every tier opens every tier below it', () => {
  // Owner 2026-11-01: "Every higher tier unlocks the lower tiers." White < Student < Media < Coach < Pro.
  assert.deepEqual(impliedDoors(['pro']), ['white', 'student', 'coach', 'pro', 'media']);
  assert.deepEqual(impliedDoors(['coach']), ['white', 'student', 'coach', 'media']);
  assert.deepEqual(impliedDoors(['media']), ['white', 'student', 'media']);
  assert.deepEqual(impliedDoors(['student']), ['white', 'student']);
  assert.deepEqual(impliedDoors(['white']), ['white']);
  assert.deepEqual(impliedDoors(['bogus', 'seat']), []);
  assert.deepEqual(doorsThatOpen('white'), ['white', 'student', 'coach', 'pro', 'media']);
  assert.deepEqual(doorsThatOpen('student'), ['student', 'coach', 'pro', 'media']);
  assert.deepEqual(doorsThatOpen('media'), ['coach', 'pro', 'media']);
  assert.deepEqual(doorsThatOpen('coach'), ['coach', 'pro']);
  assert.deepEqual(doorsThatOpen('pro'), ['pro']);
  for (const [door, row] of Object.entries(IMPLIED_DOORS)) assert.equal(row.includes(door as never), true, `${door} opens itself`);
});

test('Media Edition: Pro and Instructor include Media; Media opens Student and White, not Coach or Pro', () => {
  assert.equal(impliedDoors(['pro']).includes('media'), true);
  assert.equal(impliedDoors(['coach']).includes('media'), true);
  assert.deepEqual(impliedDoors(['media']), ['white', 'student', 'media']);
  assert.equal(impliedDoors(['student']).includes('media'), false);
  assert.equal(impliedDoors(['white']).includes('media'), false);
});

test('server: every Stripe product and code kind carries its implied doors in the pass scope', () => {
  assert.deepEqual(grantsForProduct('advantage-white'), ['white']);
  assert.deepEqual(grantsForProduct('advantage-student'), ['white', 'student']);
  assert.deepEqual(grantsForProduct('advantage-coach'), ['white', 'student', 'coach', 'media']);
  assert.deepEqual(grantsForProduct('advantage-pro'), ['white', 'student', 'coach', 'pro', 'media']);
  assert.deepEqual(grantsForProduct('advantage-media'), ['white', 'student', 'media']);
  const byKind = Object.fromEntries(CODE_KINDS.map((kind) => [kind, expandGrants(grantsForKind(kind))]));
  assert.deepEqual(byKind, {
    owner: ['white', 'student', 'coach', 'pro', 'media'],
    'alpha-coach': ['white', 'student', 'coach', 'media'],
    'alpha-pro': ['white', 'student', 'coach', 'pro', 'media'],
    'alpha-student': ['white', 'student'],
    'free-white': ['white'],
    'alpha-media': ['white', 'student', 'media'],
  });
});

const NOW = new Date('2026-10-30T12:00:00.000Z');

async function signedProToken(grants: string[]) {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  setEntitlementClockForTests(() => NOW.getTime());
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } }] });
  return (await issueToken(JSON.stringify(privateJwk), {
    licenseId: 'lic-pro',
    grants: expandGrants(grants),
    tier: 'alpha',
    src: 'code',
    deviceId: 'dev',
    now: NOW,
    kind: 'code',
  })) as string;
}

const ALL = ['white', 'student', 'coach', 'pro'] as const;
const RELOCKS = [PRO_RELOCK_KEY, COACH_RELOCK_KEY, STUDENT_RELOCK_KEY, WHITE_RELOCK_KEY];

test('a signed Pro pass opens every door and the Phase 4 Pro check, Lock Pro closes all of them, and cycles leave no strays', async () => {
  local.clear();
  clearEntitlementToken();
  const token = await signedProToken(['pro']);
  assert.equal(await acceptServerToken(token), true);
  for (const door of ALL) assert.equal(doorOpen(door), true, `open ${door}`);

  for (let round = 0; round < 3; round += 1) {
    lockPro();
    assert.equal(isProUnlocked(), false, `round ${round} pro`);
    assert.equal(isCoachUnlocked(), false, `round ${round} coach`);
    assert.equal(isStudentEditionUnlocked(), false, `round ${round} student`);
    assert.equal(isWhiteUnlocked(), false, `round ${round} white`);
    for (const key of RELOCKS) assert.equal(local.getItem(key), '1', `round ${round} ${key}`);

    // A server grant for Pro (redeem, checkout confirm, owner test) reopens all of them.
    clearRelocksFor(['pro']);
    for (const door of ALL) assert.equal(doorOpen(door), true, `round ${round} reopened ${door}`);
    for (const key of RELOCKS) assert.equal(local.getItem(key), null, `round ${round} cleared ${key}`);
  }

  lockCoach();
  assert.equal(isCoachUnlocked(), false);
  assert.equal(isWhiteUnlocked(), false, 'Lock Coach closes White');
  assert.equal(isProUnlocked(), true, 'Lock Coach leaves Pro');
  assert.equal(isStudentEditionUnlocked(), false, 'Coach includes Student Edition (ladder), so Lock Coach closes it');
  assert.equal(doorOpen('media'), false, 'Coach includes Media (ladder), so Lock Coach closes it');
  clearRelocksFor(['coach']);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(isStudentEditionUnlocked(), true);
  assert.equal(doorOpen('media'), true);
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests(null);
  clearEntitlementToken();
});

test('Phase 4 paid screens read Pro through the same table', () => {
  const claims = { grants: ['white', 'student', 'coach', 'pro'] } as never;
  assert.equal(proGrantOpen(claims, NOW.getTime()), true);
  assert.equal(proGrantOpen({ grants: ['white', 'coach'] } as never, NOW.getTime()), false);
});

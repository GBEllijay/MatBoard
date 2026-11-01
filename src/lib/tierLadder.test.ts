/**
 * Owner 2026-11-01: "Every higher tier unlocks the lower tiers."
 * Ladder: White < Student Edition < Media Edition < Instructor (coach) < Pro.
 * For every tier, bought or via its code kind, a real signed pass opens that tier and every
 * tier below it, and nothing above it, on every gate:
 *   - client doors (doorOpen via isWhite/Student/Media/Coach/ProUnlocked: /media hub, Media Console, skin picker)
 *   - Phase 4 server paid-chunk gate (paidChunkAllowed: Media Console, Pro Console, Lesson Cloud, Coach Unlimited)
 * Coach Unlimited stays Instructor/alpha-coach/Pro only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { CLIENT_APP_VERSION } from './appCapability.ts';
import { isCoachUnlimitedUnlocked, isCoachUnlocked } from './coachUnlock.ts';
import {
  acceptServerToken,
  clearEntitlementToken,
  doorOpen,
  entitlementSnapshot,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
} from './entitlement.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { isMediaUnlocked } from './mediaUnlock.ts';
import { clearOwnerTestGrant } from './ownerTestGrant.ts';
import { paidChunkAllowed, type PaidChunkId } from './paidChunkAccess.ts';
import { isProUnlocked } from './proUnlock.ts';
import { isStudentEditionUnlocked } from './studentUnlock.ts';
import { impliedDoors } from './tierImplications.ts';
import { isWhiteUnlocked } from './whiteUnlock.ts';
import { grantsForKind, type CodeKind } from '../server/codeCatalog.ts';
import { expandGrants, grantsForProduct } from '../server/grantMatrix.ts';
import { API_PRODUCT_COACH, API_PRODUCT_ID, API_PRODUCT_MEDIA, API_PRODUCT_PRO, API_PRODUCT_STUDENT } from '../server/routes.ts';
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
const session = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });

let signingKey = '';

async function freshKeys() {
  local.clear();
  session.clear();
  clearEntitlementToken();
  clearOwnerTestGrant();
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  signingKey = JSON.stringify(privateJwk);
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } }] });
}

type Pass = { grants: string[]; src: 'stripe' | 'code'; subs?: { state: 'active' | 'locked' } };

async function accept(pass: Pass) {
  await freshKeys();
  const token = await issueToken(
    signingKey,
    {
      licenseId: 'lic-gate',
      grants: pass.grants as never,
      tier: pass.src === 'code' ? 'alpha' : 'white',
      src: pass.src,
      deviceId: 'dev',
      now: new Date(),
      kind: pass.subs ? 'subscription' : 'onetime',
      appVersion: CLIENT_APP_VERSION,
      ...(pass.subs ? { subs: pass.subs } : {}),
    } as Parameters<typeof issueToken>[1],
    'k1',
  );
  assert.ok(token);
  assert.equal(await acceptServerToken(token as string), true);
  const claims = entitlementSnapshot().claims;
  assert.ok(claims);
  return claims;
}

const LADDER = ['white', 'student', 'media', 'coach', 'pro'] as const;
type Tier = (typeof LADDER)[number];

const PRODUCT: Record<Tier, string> = {
  white: API_PRODUCT_ID,
  student: API_PRODUCT_STUDENT,
  media: API_PRODUCT_MEDIA,
  coach: API_PRODUCT_COACH,
  pro: API_PRODUCT_PRO,
};
const CODE: Record<Tier, CodeKind> = {
  white: 'free-white',
  student: 'alpha-student',
  media: 'alpha-media',
  coach: 'alpha-coach',
  pro: 'alpha-pro',
};

function clientDoors(): Record<Tier, boolean> {
  return {
    white: isWhiteUnlocked(),
    student: isStudentEditionUnlocked(),
    media: isMediaUnlocked(),
    coach: isCoachUnlocked(),
    pro: isProUnlocked(),
  };
}

function expectedDoors(tier: Tier): Record<Tier, boolean> {
  const rank = LADDER.indexOf(tier);
  return Object.fromEntries(LADDER.map((door, index) => [door, index <= rank])) as Record<Tier, boolean>;
}

function expectedChunks(tier: Tier): Record<PaidChunkId, boolean> {
  const rank = LADDER.indexOf(tier);
  return {
    'pro-console': tier === 'pro',
    'media-console': rank >= LADDER.indexOf('media'),
    'lesson-cloud': tier === 'pro',
    'coach-unlimited': rank >= LADDER.indexOf('coach'),
  };
}

test('the table: each tier opens itself and every tier below it, never one above', () => {
  for (const tier of LADDER) {
    const rank = LADDER.indexOf(tier);
    const open = new Set(impliedDoors([tier]));
    for (const [index, door] of LADDER.entries()) {
      assert.equal(open.has(door), index <= rank, `${tier} -> ${door}`);
    }
    assert.deepEqual(new Set(expandGrants([tier])), open, `${tier} server expandGrants matches the client table`);
  }
});

for (const tier of LADDER) {
  for (const [how, pass] of [
    ['purchase', { grants: grantsForProduct(PRODUCT[tier]), src: 'stripe', ...(tier === 'pro' ? { subs: { state: 'active' } } : {}) }],
    ['code', { grants: grantsForKind(CODE[tier]), src: 'code' }],
  ] as [string, Pass][]) {
    test(`${tier} ${how} opens ${tier} and every lower tier on every gate, and nothing higher`, async () => {
      const claims = await accept(pass);
      assert.deepEqual(clientDoors(), expectedDoors(tier), 'client doors');
      for (const door of LADDER) assert.equal(doorOpen(door), expectedDoors(tier)[door], `doorOpen(${door})`);
      const now = Date.now();
      const chunks = Object.fromEntries(
        (Object.keys(expectedChunks(tier)) as PaidChunkId[]).map((chunk) => [chunk, paidChunkAllowed(claims, chunk, now)]),
      );
      assert.deepEqual(chunks, expectedChunks(tier), 'server paid-chunk gate');
      assert.equal(isCoachUnlimitedUnlocked(), tier === 'coach' || tier === 'pro', 'Coach Unlimited route door');
    });
  }
}

test('a locked Pro subscription still closes Pro, the Media Console download and Coach Unlimited (unchanged)', async () => {
  const claims = await accept({ grants: grantsForProduct(API_PRODUCT_PRO), src: 'stripe', subs: { state: 'locked' } });
  assert.equal(isProUnlocked(), false);
  assert.equal(isCoachUnlimitedUnlocked(), false);
  assert.equal(paidChunkAllowed(claims, 'media-console', Date.now()), false);
  assert.equal(paidChunkAllowed(claims, 'coach-unlimited', Date.now()), false);
});

test.after(() => {
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests(null);
  clearEntitlementToken();
});

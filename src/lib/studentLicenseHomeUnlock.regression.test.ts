/**
 * A claimed free Student license must open White and Student Edition the way a
 * paid Student purchase does. Higher editions stay locked and keep their buy /
 * learn-more / upgrade paths.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CLIENT_APP_VERSION } from './appCapability.ts';
import {
  clearEntitlementToken,
  doorOpen,
  ENTITLEMENT_TOKEN_KEY,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
} from './entitlement.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { applyClaimedStudentLicense } from './studentLicenseClient.ts';
import { STUDENT_LICENSE_PRESET } from './studentLicensePool.ts';
import { STUDENT_SIDE_TOKEN_KEY } from './passDowngrade.ts';
import {
  isStudentPurchased,
  studentEditionEntitled,
  studentHomeEntryPath,
  STUDENT_PURCHASE_STORAGE_KEY,
} from './studentEdition.ts';
import { TIER_BUY_PATHS } from './tierBuyPages.ts';
import { isStudentEditionUnlocked } from './studentUnlock.ts';
import { isWhiteUnlocked, whiteEntryPath, whiteHubAllowed, whiteLiveToolsAllowed } from './whiteUnlock.ts';
import { expandGrants } from '../server/grantMatrix.ts';
import { issueToken } from '../server/tokenIssue.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
}

const local = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });

let signingKey = '';
let publicJwk: PublicJwk;

async function keys(amnestyEndsAt = '2099-01-01T00:00:00.000Z') {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  signingKey = JSON.stringify(privateJwk);
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests({
    signing: true,
    keys: [{ kid: 'k1', jwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } }],
    legacyAmnestyEndsAt: amnestyEndsAt,
  });
}

async function studentToken() {
  const token = await issueToken(
    signingKey,
    {
      licenseId: 'student-lic-1',
      grants: expandGrants(['student']),
      tier: 'student',
      src: 'free',
      deviceId: 'dev-student',
      now: new Date(),
      kind: 'onetime',
      gym: 'academy01',
      preset: STUDENT_LICENSE_PRESET,
      appVersion: CLIENT_APP_VERSION,
    },
    'k1',
  );
  assert.ok(token);
  return token;
}

async function claimOnDevice(amnestyEndsAt = '2099-01-01T00:00:00.000Z') {
  local.clear();
  clearEntitlementToken();
  await keys(amnestyEndsAt);
  const token = await studentToken();
  const applied = await applyClaimedStudentLicense(
    {
      ok: true,
      token,
      grants: ['student'],
      gymId: 'academy01',
      deviceId: 'dev-student',
      cloud: false,
    },
    'North Gym',
    local,
  );
  return { applied, token };
}

function studentOwner() {
  return {
    pro: doorOpen('pro'),
    coach: doorOpen('coach'),
    white: doorOpen('white'),
    student: doorOpen('student'),
  };
}

test('studentHomeEntryPath opens /student when entitled and the buy page when not', () => {
  assert.equal(studentHomeEntryPath(true), '/student');
  assert.equal(studentHomeEntryPath(false), TIER_BUY_PATHS.student);
  assert.equal(studentHomeEntryPath(false), '/editions/student');
});

test('claiming a free Student license opens White and Student like a paid purchase, and leaves higher editions locked', async () => {
  const { applied, token } = await claimOnDevice();
  assert.deepEqual(applied, { applied: true, keptHigher: false });
  assert.equal(local.getItem(STUDENT_PURCHASE_STORAGE_KEY), '1', 'claim must set the same purchase remember a checkout writes');
  assert.equal(isStudentPurchased(), true);
  assert.equal(isStudentEditionUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(doorOpen('student'), true);
  assert.equal(doorOpen('white'), true);
  assert.equal(doorOpen('media'), false);
  assert.equal(doorOpen('coach'), false);
  assert.equal(doorOpen('pro'), false);
  assert.equal(studentEditionEntitled(studentOwner()), true);
  assert.equal(whiteEntryPath(isWhiteUnlocked()), '/white');
  assert.notEqual(whiteEntryPath(isWhiteUnlocked()), '/buy');
  assert.equal(whiteHubAllowed(isWhiteUnlocked()), true);
  assert.equal(whiteLiveToolsAllowed({ whiteUnlocked: true, coachDoor: false, proDoor: false }), true);
  assert.equal(studentHomeEntryPath(studentEditionEntitled(studentOwner())), '/student');
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), token);
  assert.equal(local.getItem(STUDENT_SIDE_TOKEN_KEY), null);
});

test('the claimed Student pass still opens White and Student after legacy amnesty ends', async () => {
  const { token } = await claimOnDevice('2000-01-01T00:00:00.000Z');
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), token);
  // Purchase flags no longer count once amnesty is over. The signed pass must.
  assert.equal(isStudentPurchased(), false);
  assert.equal(doorOpen('student'), true);
  assert.equal(doorOpen('white'), true);
  assert.equal(doorOpen('media'), false);
  assert.equal(doorOpen('coach'), false);
  assert.equal(doorOpen('pro'), false);
  assert.equal(studentEditionEntitled(studentOwner()), true);
  assert.equal(whiteEntryPath(true), '/white');
  assert.equal(studentHomeEntryPath(true), '/student');
});

test('/products and the public homepage open White and Student from a claimed license, and keep higher-tier buy links', () => {
  const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8');
  const storefront = readFileSync(new URL('../pages/Storefront.tsx', import.meta.url), 'utf8');
  const hero = readFileSync(new URL('../pages/StorefrontHero.tsx', import.meta.url), 'utf8');
  assert.match(home, /studentHomeEntryPath\(true\)/);
  assert.match(home, /studentHomeEntryPath\(false\)/);
  assert.match(home, /whiteEntryPath\(true\)/);
  assert.match(home, /whiteEntryPath\(false\)/);
  assert.match(home, /TIER_BUY_PATHS\.media/);
  assert.match(home, /TIER_BUY_PATHS\.instructor/);
  assert.match(home, /TIER_BUY_PATHS\.pro/);
  assert.match(storefront, /whiteEntryPath\(unlocked\)/);
  assert.match(storefront, /studentHomeEntryPath\(studentUnlocked\)/);
  assert.match(storefront, /rung\.id === 'white' \? !unlocked : rung\.id === 'student' \? !studentUnlocked : true/);
  assert.match(hero, /to="\/white"/);
  assert.match(hero, /to="\/student"/);
  assert.match(hero, /STOREFRONT_BUY_PATH/);
});

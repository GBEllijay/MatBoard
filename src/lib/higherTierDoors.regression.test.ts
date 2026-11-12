/**
 * Home menu and /media hub: an open higher tier opens the lower doors.
 * A stale Media relock, or a pre-Media Lock Pro mark, must not keep Media shut
 * while Instructor, Pro, or the owner pass is open. A seat token still does not
 * open the Media door. Lock Media still locks someone who owns only Media.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CLIENT_APP_VERSION } from './appCapability.ts';
import {
  acceptServerToken,
  clearEntitlementToken,
  doorOpen,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
} from './entitlement.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { purchasePromptsHidden, readCurrentSeat } from './instructorSeats.ts';
import { MEDIA_RELOCK_KEY, PRO_RELOCK_KEY, STUDENT_RELOCK_KEY, WHITE_RELOCK_KEY } from './legacyUnlock.ts';
import { isMediaUnlocked, lockMedia } from './mediaUnlock.ts';
import { applyOwnerTestGrant, clearOwnerTestGrant } from './ownerTestGrant.ts';
import { mediaConsoleDoorOpen } from './productNames.ts';
import { isStudentEditionUnlocked } from './studentUnlock.ts';
import { isWhiteUnlocked } from './whiteUnlock.ts';
import { expandGrants } from '../server/grantMatrix.ts';
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

async function keys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  signingKey = JSON.stringify(privateJwk);
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests({
    signing: true,
    keys: [{ kid: 'k1', jwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } }],
  });
}

async function setup() {
  local.clear();
  session.clear();
  clearEntitlementToken();
  clearOwnerTestGrant();
  await keys();
}

async function acceptPass(input: {
  grants: string[];
  tier: 'alpha' | 'owner' | 'seat';
  src: 'code' | 'owner' | 'seat';
  licenseId: string;
  kind: 'onetime' | 'owner-test' | 'seat';
  preset?: string;
}) {
  const token = await issueToken(
    signingKey,
    {
      licenseId: input.licenseId,
      grants: input.tier === 'seat' ? (input.grants as never) : expandGrants(input.grants),
      tier: input.tier,
      src: input.src,
      deviceId: 'dev',
      now: new Date(),
      kind: input.kind,
      appVersion: CLIENT_APP_VERSION,
      ...(input.kind === 'owner-test' ? { ownerTestSeconds: 7 * 24 * 60 * 60 } : {}),
      ...(input.preset ? { preset: input.preset } : {}),
    },
    'k1',
  );
  assert.ok(token);
  assert.equal(await acceptServerToken(token), true);
}

function hubOpen(): boolean {
  return mediaConsoleDoorOpen({
    proUnlocked: doorOpen('pro'),
    seated: false,
    seatGrantsMedia: false,
    programDirectorSeat: false,
    coachMenus: false,
    mediaUnlocked: isMediaUnlocked(),
    coachUnlocked: doorOpen('coach'),
  });
}

test('a stale Media relock stays open while Coach is open, including Student and White', async () => {
  await setup();
  await acceptPass({ grants: ['coach'], tier: 'alpha', src: 'code', licenseId: 'lic-coach', kind: 'onetime' });
  local.setItem(MEDIA_RELOCK_KEY, '1');
  local.setItem(STUDENT_RELOCK_KEY, '1');
  local.setItem(WHITE_RELOCK_KEY, '1');
  assert.equal(doorOpen('coach'), true);
  assert.equal(doorOpen('pro'), false);
  assert.equal(doorOpen('media'), true);
  assert.equal(isMediaUnlocked(), true);
  assert.equal(doorOpen('student'), true);
  assert.equal(isStudentEditionUnlocked(), true);
  assert.equal(doorOpen('white'), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(hubOpen(), true, '/media hub follows the open Media door');
});

test('a null Media mark with Pro relocked stays shut for a code pass and opens for the owner pass', async () => {
  await setup();
  await acceptPass({ grants: ['pro'], tier: 'alpha', src: 'code', licenseId: 'lic-pro', kind: 'onetime' });
  local.setItem(PRO_RELOCK_KEY, '1');
  local.removeItem(MEDIA_RELOCK_KEY);
  assert.equal(doorOpen('media'), false, 'a non-owner Lock Pro from before Media existed still shuts Media');

  clearEntitlementToken();
  local.setItem(PRO_RELOCK_KEY, '1');
  local.removeItem(MEDIA_RELOCK_KEY);
  await acceptPass({
    grants: ['pro'],
    tier: 'owner',
    src: 'owner',
    licenseId: 'owner-test',
    kind: 'owner-test',
  });
  assert.equal(doorOpen('pro'), false, 'the Pro relock still closes Pro');
  assert.equal(doorOpen('media'), true, 'the owner pass opens Media');
  assert.equal(isMediaUnlocked(), true);
  assert.equal(hubOpen(), true);

  clearEntitlementToken();
  local.setItem(PRO_RELOCK_KEY, '1');
  local.removeItem(MEDIA_RELOCK_KEY);
  assert.equal(
    applyOwnerTestGrant({
      grants: ['pro', 'coach', 'media', 'seat'],
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      tier: 'all',
    }),
    true,
  );
  assert.equal(doorOpen('media'), true, 'the owner-test record opens Media too');
  assert.equal(purchasePromptsHidden(readCurrentSeat()), true, 'All tiers still signs in the preview seat');
  assert.equal(isMediaUnlocked(), true, 'that seat does not shut the Media door');
});

test('a seat token never opens the Media door, even with Pro on the pass or a stale Media relock', async () => {
  await setup();
  await acceptPass({
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'seat',
    src: 'seat',
    licenseId: 'lic-seat',
    kind: 'seat',
    preset: 'instructors',
  });
  assert.equal(doorOpen('pro'), true);
  assert.equal(doorOpen('coach'), true);
  assert.equal(doorOpen('media'), false);
  assert.equal(isMediaUnlocked(), false);
  local.setItem(MEDIA_RELOCK_KEY, '1');
  assert.equal(doorOpen('media'), false, 'a stale Media relock does not open Media for a seat');
  assert.equal(
    mediaConsoleDoorOpen({
      proUnlocked: true,
      seated: true,
      seatGrantsMedia: false,
      programDirectorSeat: false,
      coachMenus: true,
      mediaUnlocked: isMediaUnlocked(),
    }),
    false,
    'a seat without a media preset does not open the /media hub',
  );
});

test('Lock Media still locks Media, Student, and White for someone who owns only Media', async () => {
  await setup();
  await acceptPass({ grants: ['media'], tier: 'alpha', src: 'code', licenseId: 'lic-media', kind: 'onetime' });
  assert.equal(doorOpen('media'), true);
  assert.equal(doorOpen('coach'), false);
  assert.equal(doorOpen('pro'), false);
  lockMedia();
  assert.equal(local.getItem(MEDIA_RELOCK_KEY), '1');
  assert.equal(doorOpen('media'), false);
  assert.equal(isMediaUnlocked(), false);
  assert.equal(doorOpen('student'), false);
  assert.equal(doorOpen('white'), false);
  assert.equal(hubOpen(), false);
  assert.equal(doorOpen('coach'), false);
  assert.equal(doorOpen('pro'), false);
});

test('the home Media card follows mediaEditionDoorOpen and does not shut it for a seat', () => {
  const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8');
  assert.match(home, /<MediaHomeCard open=\{mediaEditionDoorOpen\(door\)\} \/>/);
  assert.doesNotMatch(home, /mediaUnlocked && !seated/);
  assert.match(home, /purchasePromptsHidden\(seat\)/);
});

test.after(() => {
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests(null);
  clearEntitlementToken();
  clearOwnerTestGrant();
});

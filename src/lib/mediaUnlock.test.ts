import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { APP_VERSION_HEADER, CLIENT_APP_VERSION, appSupportsMedia, passScopeForApp } from './appCapability.ts';
import { redeemAccessCode } from './codeRedeemClient.ts';
import { isCoachUnlocked, lockCoach } from './coachUnlock.ts';
import {
  acceptServerToken,
  clearEntitlementToken,
  clearRelocksFor,
  doorOpen,
  entitlementSnapshot,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
} from './entitlement.ts';
import type { EntitlementClaims, PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { COACH_RELOCK_KEY, MEDIA_RELOCK_KEY, PRO_RELOCK_KEY, STUDENT_RELOCK_KEY, WHITE_RELOCK_KEY } from './legacyUnlock.ts';
import { isMediaUnlocked, lockMedia } from './mediaUnlock.ts';
import { applyOwnerTestGrant, clearOwnerTestGrant } from './ownerTestGrant.ts';
import { paidChunkGrant } from './paidChunkAccess.ts';
import { mediaConsoleDoorOpen } from './productNames.ts';
import { isProUnlocked, lockPro } from './proUnlock.ts';
import { isStudentEditionUnlocked } from './studentUnlock.ts';
import { isWhiteUnlocked, whiteLiveToolsAllowed } from './whiteUnlock.ts';
import { keyedHash, normalizeCode } from '../server/codeCrypto.ts';
import { handleCodeRedeem } from '../server/codeRedeem.ts';
import { expandGrants, tierForGrants } from '../server/grantMatrix.ts';
import { resetRateLimitsForTests } from '../server/rateLimit.ts';
import { MemoryRedemptionLedger } from '../server/redemptionLedger.ts';
import { sqliteD1 } from '../server/sqliteD1.ts';
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

// Made up for this test only. Same shape the generator prints.
const pepper = 'media-unlock-test-pepper';
const MEDIA_CODE = 'DEFG-HJKL-MNPQ-RSTU-VW';
const RELOCK_KEYS = [WHITE_RELOCK_KEY, STUDENT_RELOCK_KEY, COACH_RELOCK_KEY, PRO_RELOCK_KEY, MEDIA_RELOCK_KEY];

let signingKey = '';

async function keys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  signingKey = JSON.stringify(privateJwk);
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } }] });
}

async function setup() {
  local.clear();
  session.clear();
  clearEntitlementToken();
  clearOwnerTestGrant();
  resetRateLimitsForTests();
  await keys();
  const hash = await keyedHash(normalizeCode(MEDIA_CODE), pepper, 'code');
  const env = { CODE_HASH_PEPPER: pepper, CODE_CATALOG: JSON.stringify([{ id: `alpha-media-${hash.slice(0, 8)}`, hash, kind: 'alpha-media' }]) };
  const db = sqliteD1();
  const ledger = new MemoryRedemptionLedger();
  const requests: Request[] = [];
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string, init: RequestInit) => {
      const request = new Request(new URL(url, 'https://advantagebjjtimer.test'), {
        ...init,
        headers: { ...(init.headers as Record<string, string>), 'cf-connecting-ip': '203.0.113.60' },
      });
      requests.push(request.clone());
      return handleCodeRedeem(request, env, null, ledger, () => new Date(), { db, signingKey, keyId: 'k1' });
    },
  });
  return { env, db, ledger, requests };
}

async function acceptPass(grants: string[], extra: Partial<Parameters<typeof issueToken>[1]> = {}) {
  const token = await issueToken(signingKey, {
    licenseId: 'lic-media',
    grants: expandGrants(grants),
    tier: 'alpha',
    src: 'code',
    deviceId: 'dev',
    now: new Date(),
    kind: 'onetime',
    appVersion: CLIENT_APP_VERSION,
    ...extra,
  }, 'k1');
  assert.ok(token);
  assert.equal(await acceptServerToken(token as string), true);
}

function claims(): EntitlementClaims {
  const value = entitlementSnapshot().claims;
  assert.ok(value);
  return value;
}

function surfaces() {
  const media = isMediaUnlocked();
  const pro = isProUnlocked();
  return {
    media,
    white: isWhiteUnlocked(),
    console: mediaConsoleDoorOpen({ proUnlocked: pro, seated: false, seatGrantsMedia: false, programDirectorSeat: false, coachMenus: false, mediaUnlocked: media }),
    liveTools: whiteLiveToolsAllowed({ whiteUnlocked: isWhiteUnlocked(), coachDoor: isCoachUnlocked(), proDoor: pro }),
    pro,
    coach: isCoachUnlocked(),
    student: isStudentEditionUnlocked(),
  };
}

function payload(token: string): { grants: string[]; tier: string } {
  const part = token.split('.')[1];
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

test('redeeming alpha-media opens Media Console, Scoreboard and Timer; Pro, Coach and Student stay locked', async () => {
  const { requests } = await setup();
  assert.deepEqual(await redeemAccessCode(MEDIA_CODE), { ok: true });
  assert.equal(requests[0].headers.get(APP_VERSION_HEADER), CLIENT_APP_VERSION, 'the client says it understands media');
  assert.deepEqual(surfaces(), { media: true, white: true, console: true, liveTools: true, pro: false, coach: false, student: false });
  assert.equal(paidChunkGrant(claims(), 'media-console', Date.now()), true);
  assert.equal(paidChunkGrant(claims(), 'pro-console', Date.now()), false);
  assert.equal(paidChunkGrant(claims(), 'lesson-cloud', Date.now()), false);
  assert.equal(paidChunkGrant(claims(), 'coach-unlimited', Date.now()), false);
  assert.deepEqual([...claims().grants].sort(), ['media', 'white']);
});

test('Lock Media closes Media Console, Scoreboard and Timer, and the code reopens them with no stray marks', async () => {
  await setup();
  for (let round = 0; round < 3; round += 1) {
    assert.deepEqual(await redeemAccessCode(MEDIA_CODE), { ok: true }, `round ${round}`);
    assert.equal(surfaces().console, true);
    lockMedia();
    assert.deepEqual(surfaces(), { media: false, white: false, console: false, liveTools: false, pro: false, coach: false, student: false });
    assert.equal(local.getItem(MEDIA_RELOCK_KEY), '1');
    assert.equal(local.getItem(WHITE_RELOCK_KEY), '1');
    assert.equal(local.getItem(PRO_RELOCK_KEY), null, 'Lock Media never marks Pro');
    assert.equal(local.getItem(COACH_RELOCK_KEY), null);
    assert.equal(local.getItem(STUDENT_RELOCK_KEY), null);
  }
  assert.deepEqual(await redeemAccessCode(MEDIA_CODE), { ok: true });
  assert.equal(surfaces().media, true);
  assert.equal(local.getItem(WHITE_RELOCK_KEY), null);
  assert.equal(local.getItem(MEDIA_RELOCK_KEY), '0');
});

test('Lock Media keeps White when Coach is still open; Lock Coach after it closes White', async () => {
  await setup();
  await acceptPass(['coach', 'media']);
  lockMedia();
  assert.equal(isMediaUnlocked(), false);
  assert.equal(isWhiteUnlocked(), true, 'Coach includes White');
  assert.equal(isCoachUnlocked(), true);
  lockCoach();
  assert.equal(isWhiteUnlocked(), false);
  clearRelocksFor(['coach', 'media']);
  assert.equal(isMediaUnlocked(), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);
});

test('Pro implies Media; Lock Pro closes Media; Lock Media with Pro on closes only Media', async () => {
  await setup();
  await acceptPass(['pro']);
  assert.equal(isMediaUnlocked(), true);
  assert.equal(paidChunkGrant(claims(), 'media-console', Date.now()), true);
  lockMedia();
  assert.equal(isMediaUnlocked(), false);
  assert.equal(isProUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true, 'Pro still opens White');
  assert.equal(surfaces().console, false, 'Lock Media hides the Media Console hub');
  clearRelocksFor(['pro']);
  assert.equal(isMediaUnlocked(), true);
  lockPro();
  assert.deepEqual(surfaces(), { media: false, white: false, console: false, liveTools: false, pro: false, coach: false, student: false });
  for (let round = 0; round < 3; round += 1) {
    clearRelocksFor(['pro']);
    assert.equal(surfaces().media && surfaces().white && surfaces().pro && surfaces().coach && surfaces().student, true);
    lockPro();
    assert.equal(isMediaUnlocked(), false);
  }
  clearRelocksFor(['pro']);
  for (const key of RELOCK_KEYS) assert.notEqual(local.getItem(key), '1', `${key} left over`);
});

test('a Lock Pro from before Media existed keeps Media shut until a grant clears it', async () => {
  await setup();
  await acceptPass(['pro']);
  local.setItem(PRO_RELOCK_KEY, '1');
  local.removeItem(MEDIA_RELOCK_KEY);
  assert.equal(isMediaUnlocked(), false);
  clearRelocksFor(['pro']);
  assert.equal(isMediaUnlocked(), true);
});

test('owner test: the Media preset opens Media and White; dropping it closes them', async () => {
  await setup();
  clearEntitlementToken();
  setEntitlementConfigForTests({ signing: false, keys: [] });
  assert.equal(applyOwnerTestGrant({ grants: ['media'], expiresAt: new Date(Date.now() + 86_400_000).toISOString(), tier: 'media' }), true);
  assert.equal(isMediaUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(isProUnlocked(), false);
  lockMedia();
  assert.equal(isMediaUnlocked(), false);
  assert.equal(isWhiteUnlocked(), false);
  clearOwnerTestGrant();
});

test('old clients: a pass for an app without the version header omits media and never says tier media', async () => {
  await keys();
  const base = { licenseId: 'lic', tier: 'media' as const, src: 'stripe' as const, deviceId: 'dev', now: new Date(), kind: 'onetime' as const };
  const old = await issueToken(signingKey, { ...base, grants: ['white', 'media'] }, 'k1');
  assert.deepEqual(payload(old as string).grants, ['white']);
  assert.equal(payload(old as string).tier, 'white');
  const fresh = await issueToken(signingKey, { ...base, grants: ['white', 'media'], appVersion: '3' }, 'k1');
  assert.deepEqual(payload(fresh as string).grants, ['white', 'media']);
  assert.equal(payload(fresh as string).tier, 'media');
  const oldPro = await issueToken(signingKey, { ...base, tier: 'alpha', grants: expandGrants(['pro']), appVersion: '2' }, 'k1');
  assert.deepEqual(payload(oldPro as string).grants, ['white', 'student', 'coach', 'pro']);
  assert.equal(appSupportsMedia(null), false);
  assert.equal(appSupportsMedia('2'), false);
  assert.equal(appSupportsMedia('3'), true);
  assert.deepEqual(passScopeForApp(['media'], 'media', '2'), { grants: [], tier: 'white' });
  assert.equal(tierForGrants(['white', 'media'], 'stripe'), 'media');
  assert.equal(tierForGrants(['white', 'media'], 'code'), 'alpha');
});

test('old clients: redeeming alpha-media without the header still opens White and leaves media out', async () => {
  const { env, db, ledger } = await setup();
  const response = await handleCodeRedeem(
    new Request('https://advantagebjjtimer.test/api/codes/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.61' },
      body: JSON.stringify({ code: MEDIA_CODE, deviceId: 'old-dev' }),
    }),
    env, null, ledger, () => new Date(), { db, signingKey, keyId: 'k1' },
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { token?: string };
  assert.ok(body.token);
  assert.deepEqual(payload(body.token as string).grants, ['white']);
});

test('seats follow their preset: a seat pass never opens the Media door', async () => {
  await setup();
  const token = await issueToken(signingKey, {
    licenseId: 'lic-seat', grants: ['pro', 'media'], tier: 'seat', src: 'seat', deviceId: 'dev', now: new Date(), kind: 'seat', preset: 'instructors', appVersion: '3',
  }, 'k1');
  assert.equal(await acceptServerToken(token as string), true);
  assert.equal(isMediaUnlocked(), false);
  assert.equal(paidChunkGrant(claims(), 'media-console', Date.now()), true, 'the instructors preset still opens Media Console');
});

test('the generator makes an alpha-media record with a dummy pepper', () => {
  const run = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/generate-unlock-codes.ts', '--kind', 'alpha-media'], {
    env: { ...process.env, CODE_HASH_PEPPER: 'dummy-pepper-for-tests-only' },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0);
  const lines = run.stdout.split('\n');
  const record = JSON.parse(lines[lines.indexOf('Catalog record:') + 1]) as { id: string; kind: string };
  assert.equal(record.kind, 'alpha-media');
  assert.equal(record.id.startsWith('alpha-media-'), true);
});

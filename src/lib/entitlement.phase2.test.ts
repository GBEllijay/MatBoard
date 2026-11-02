import assert from 'node:assert/strict';
import test from 'node:test';
import { applyUnlockSearch, isProUnlocked, setProUnlocked } from './proUnlock.ts';
import { isCoachUnlocked } from './coachUnlock.ts';
import { isWhiteUnlocked } from './whiteUnlock.ts';
import { studentDemoMode } from './studentEdition.ts';
import { isStudentEditionUnlocked } from './studentUnlock.ts';
import {
  acceptServerToken,
  clearEntitlementToken,
  doorOpen,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
} from './entitlement.ts';
import { LEGACY_AMNESTY_ENDS_AT } from './legacyUnlock.ts';
import { issueToken } from '../server/tokenIssue.ts';
import { signToken, type PrivateJwk, type PublicJwk } from './entitlementToken.ts';

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
    clear() {
      store.clear();
    },
  };
}

const local = memoryStorage();
const session = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });

async function keys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC' as const, crv: 'P-256' as const, x: publicJwk.x, y: publicJwk.y }, privateJwk };
}

test('hand-edited flags, URL params, and demo mode do not grant a tier after amnesty', async () => {
  local.clear();
  session.clear();
  clearEntitlementToken();
  setEntitlementClockForTests(() => Date.parse('2026-10-28T00:00:00.000Z'));
  setEntitlementConfigForTests({ signing: false, keys: [], legacyAmnestyEndsAt: LEGACY_AMNESTY_ENDS_AT });
  setProUnlocked(true);
  assert.equal(isProUnlocked(), true);
  assert.equal(isStudentEditionUnlocked(), true);
  // Tier rule: Pro opens Coach and White too, during amnesty as well.
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);

  setEntitlementClockForTests(() => Date.parse('2027-01-01T00:00:00.000Z'));
  local.setItem('advantage.proUnlocked', '1');
  local.setItem('advantage.coachUnlocked', '1');
  local.setItem('advantage.whiteUnlocked', '1');
  local.setItem('advantage.studentEditionUnlocked', '1');
  local.setItem('advantage.studentUnlocked', '1');
  assert.equal(isProUnlocked(), false);
  assert.equal(isCoachUnlocked(), false);
  assert.equal(isWhiteUnlocked(), false);
  assert.equal(isStudentEditionUnlocked(), false);
  assert.equal(doorOpen('pro'), false);
  assert.equal(applyUnlockSearch(new URLSearchParams('pro=1')), false);
  assert.equal(applyUnlockSearch(new URLSearchParams('unlock=1')), false);
  const before = local.getItem('advantage.proUnlocked');
  assert.equal(studentDemoMode(new URLSearchParams('student=1'), { pro: false, coach: false, white: false }), true);
  assert.equal(local.getItem('advantage.proUnlocked'), before);
  assert.equal(local.getItem('advantage.studentEditionUnlocked'), '1');

  const material = await keys();
  const now = new Date('2027-01-01T00:00:00.000Z');
  const token = await issueToken(material.secret, {
    licenseId: 'lic',
    grants: ['white'],
    tier: 'white',
    src: 'stripe',
    deviceId: 'device',
    now,
    kind: 'onetime',
  });
  setEntitlementConfigForTests({
    signing: true,
    keys: [{ kid: 'k1', jwk: material.publicJwk }],
    legacyAmnestyEndsAt: LEGACY_AMNESTY_ENDS_AT,
  });
  assert.equal(await acceptServerToken(token as string), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(isProUnlocked(), false);
  local.setItem(local.getItem('advantage.entitlement.token') ?? '', 'not-a-token');
  const tampered = await signToken(
    {
      iss: 'advantage',
      aud: 'advantagebjjtimer.com',
      kid: 'k1',
      sub: 'lic',
      grants: ['pro', 'student', 'coach', 'white'],
      tier: 'pro',
      src: 'stripe',
      exp: Math.floor(now.getTime() / 1000) + 3600,
      iat: Math.floor(now.getTime() / 1000),
      nbf: Math.floor(now.getTime() / 1000),
      refresh_after: Math.floor(now.getTime() / 1000),
      did: 'device',
      v: 1,
    },
    material.privateJwk,
  );
  local.setItem('advantage.entitlement.token', `${tampered}tamper`);
  clearEntitlementToken();
  local.setItem('advantage.entitlement.token', `${tampered.slice(0, -4)}xxxx`);
  assert.equal(await acceptServerToken(local.getItem('advantage.entitlement.token') ?? ''), false);
  assert.equal(isProUnlocked(), false);

  setEntitlementConfigForTests({
    signing: true,
    keys: [{ kid: 'k1', jwk: material.publicJwk }],
    legacyAmnestyEndsAt: LEGACY_AMNESTY_ENDS_AT,
  });
  assert.equal(await acceptServerToken(tampered), true);
  local.setItem('advantage.entitlement.clock', String(Date.parse('2027-06-01T00:00:00.000Z')));
  setEntitlementClockForTests(() => Date.parse('2027-01-02T00:00:00.000Z'));
  assert.equal(isWhiteUnlocked(), false);
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests(null);
  clearEntitlementToken();
});

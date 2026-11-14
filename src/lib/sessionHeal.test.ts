import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENTITLEMENT_TOKEN_KEY,
  acceptServerToken,
  clearEntitlementToken,
  doorOpen,
  hasLoginSessionHint,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
  setSessionHealerForTests,
  settleStoredPass,
} from './entitlement.ts';
import { LEGACY_AMNESTY_ENDS_AT } from './legacyUnlock.ts';
import { issueToken } from '../server/tokenIssue.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { inAppBrowserHintText, isInAppBrowser } from './inAppBrowser.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}
const local = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });

async function keys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const pub = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC' as const, crv: 'P-256' as const, x: pub.x, y: pub.y } };
}

const now = new Date('2027-01-01T00:00:00.000Z');
async function pass(secret: string): Promise<string> {
  return (await issueToken(secret, { licenseId: 'lic', grants: ['student'], tier: 'student', src: 'stripe', deviceId: 'd', now, kind: 'onetime' })) as string;
}

function setOnline(online: boolean) {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: online, userAgent: '' }, configurable: true });
}

async function setup() {
  local.clear();
  clearEntitlementToken();
  setEntitlementClockForTests(() => now.getTime());
  const good = await keys();
  const stale = await keys();
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: good.publicJwk }], legacyAmnestyEndsAt: LEGACY_AMNESTY_ENDS_AT });
  return { good, stale };
}

test('a pass that fails online is healed from the sign-in session before anything is discarded', async () => {
  setOnline(true);
  const { good, stale } = await setup();
  local.setItem(ENTITLEMENT_TOKEN_KEY, await pass(stale.secret));
  let calls = 0;
  setSessionHealerForTests(async () => {
    calls += 1;
    return acceptServerToken(await pass(good.secret));
  });
  assert.equal(await settleStoredPass(), 'ok');
  assert.equal(calls, 1);
  assert.equal(doorOpen('student'), true);
  setSessionHealerForTests(null);
});

test('a wiped localStorage self-heals from the session (iOS storage split / in-app browser)', async () => {
  setOnline(true);
  const { good } = await setup();
  setSessionHealerForTests(async () => acceptServerToken(await pass(good.secret)));
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), null);
  assert.equal(await settleStoredPass(), 'ok');
  assert.ok(local.getItem(ENTITLEMENT_TOKEN_KEY));
  setSessionHealerForTests(null);
});

test('online failure with no session: only then is the bad pass dropped', async () => {
  setOnline(true);
  const { stale } = await setup();
  local.setItem(ENTITLEMENT_TOKEN_KEY, await pass(stale.secret));
  setSessionHealerForTests(async () => false);
  assert.equal(await settleStoredPass(), 'failed');
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), null);
  setSessionHealerForTests(null);
});

test('offline or missing keys never deletes the stored pass', async () => {
  const { stale } = await setup();
  const token = await pass(stale.secret);
  local.setItem(ENTITLEMENT_TOKEN_KEY, token);
  let calls = 0;
  setSessionHealerForTests(async () => {
    calls += 1;
    return false;
  });
  setOnline(false);
  assert.equal(await settleStoredPass(), 'kept');
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), token);
  setOnline(true);
  setEntitlementConfigForTests({ signing: true, keys: [], legacyAmnestyEndsAt: LEGACY_AMNESTY_ENDS_AT });
  assert.equal(await settleStoredPass(), 'kept');
  assert.equal(local.getItem(ENTITLEMENT_TOKEN_KEY), token);
  assert.equal(calls, 0);
  setSessionHealerForTests(null);
});

test('session hint cookie is read without touching the HttpOnly session', () => {
  assert.equal(hasLoginSessionHint('a=1; adv_login=1; b=2'), true);
  assert.equal(hasLoginSessionHint('adv_login=1'), true);
  assert.equal(hasLoginSessionHint('adv_login=; x=1'), false);
  assert.equal(hasLoginSessionHint(''), false);
});

test('in-app browser hint shows for Facebook, Instagram, Google app, LINE; not Safari', () => {
  const iosSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  assert.equal(isInAppBrowser(iosSafari), false);
  assert.equal(isInAppBrowser(`${iosSafari} [FBAN/FBIOS;FBAV/480.0]`), true);
  assert.equal(isInAppBrowser(`${iosSafari} Instagram 350.0`), true);
  assert.equal(isInAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 GSA/350.0 Mobile/15E148 Safari/604.1'), true);
  assert.equal(isInAppBrowser(`${iosSafari} Line/14.0`), true);
  assert.match(inAppBrowserHintText(iosSafari), /Open in Safari.*Add to Home Screen/);
});

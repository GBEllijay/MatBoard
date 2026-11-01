import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyOwnerTestGrant, clearOwnerTestGrant } from './ownerTestGrant.ts';
import { proPlusCloudUnlocked } from './proPlusCloud.ts';

if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    configurable: true,
  });
}

const page = readFileSync(new URL('../pages/ProPlusCloud.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8');

test('Pro Plus Cloud opens for an owner or alpha pass, not a Stripe Pro purchase', () => {
  clearOwnerTestGrant();
  assert.equal(proPlusCloudUnlocked(), false);
  applyOwnerTestGrant({
    grants: ['pro', 'coach', 'media', 'student', 'white'],
    expiresAt: '2099-01-01T00:00:00.000Z',
    tier: 'all',
  });
  assert.equal(proPlusCloudUnlocked(), true);
  clearOwnerTestGrant();
  applyOwnerTestGrant({
    grants: ['white'],
    expiresAt: '2099-01-01T00:00:00.000Z',
    tier: 'white',
  });
  assert.equal(proPlusCloudUnlocked(), false);
  clearOwnerTestGrant();
});

test('Pro Plus Cloud page is display only: no checkout, no Drive, no entitlement write', () => {
  assert.match(page, /Not for sale on this page/);
  assert.match(page, /Cloudflare/);
  assert.match(page, /Google Drive or OneDrive/);
  assert.doesNotMatch(page, /fetch\(|stripe\.com|oauth|WHITE_CHECKOUT|Continue to checkout/i);
  assert.match(home, /Advantage Pro Plus Cloud, coming soon/);
  assert.match(home, /PRO_PLUS_CLOUD_PRICE_LINE/);
  assert.match(home, /useProPlusCloudUnlocked/);
  assert.doesNotMatch(home, /Continue to checkout/);
});

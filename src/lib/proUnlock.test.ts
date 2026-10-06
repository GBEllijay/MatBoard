import assert from 'node:assert/strict';
import test from 'node:test';
import { COACH_UNLOCK_STORAGE_KEY, isCoachUnlocked, lockCoach } from './coachUnlock.ts';
import {
  FULL_OWNER_UNLOCK_CODE,
  PRO_UNLOCK_STORAGE_KEY,
  applyFullOwnerSearch,
  applyUnlockSearch,
  codesMatch,
  isFullOwnerUnlockCode,
  isProUnlocked,
  lockPro,
  previewUnlockFromSearch,
  stripUnlockParams,
  tryProductOwnerUnlock,
  tryUnlock,
} from './proUnlock.ts';
import { PRO_PRODUCT_ID, proDeviceUnlock, proPurchaseEntitled, proPurchaseReturn } from './proEntitlement.ts';
import { API_PRODUCT_PRO } from '../server/routes.ts';
import { WHITE_UNLOCK_STORAGE_KEY, isWhiteUnlocked, setWhiteUnlocked } from './whiteUnlock.ts';

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
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

function resetUnlocks(): void {
  lockPro();
  lockCoach();
  setWhiteUnlocked(false);
}

test('Pro owner code matches case-insensitively', () => {
  assert.equal(codesMatch('advantage'), true);
  assert.equal(codesMatch(' Advantage '), true);
  assert.equal(codesMatch('ADVANTAGE'), true);
  assert.equal(codesMatch('nope'), false);
});

test('Pro query preview unlocks, locks, or ignores', () => {
  assert.equal(previewUnlockFromSearch(new URLSearchParams('pro=advantage')), true);
  assert.equal(previewUnlockFromSearch(new URLSearchParams('unlock=1')), true);
  assert.equal(previewUnlockFromSearch(new URLSearchParams('pro=0')), false);
  assert.equal(previewUnlockFromSearch(new URLSearchParams('pro=lock')), false);
  assert.equal(previewUnlockFromSearch(new URLSearchParams('pro=nope')), null);
  assert.equal(previewUnlockFromSearch(new URLSearchParams('')), null);
});

test('Pro query apply writes the local flag and strips params', () => {
  resetUnlocks();
  assert.equal(isProUnlocked(), false);
  assert.equal(applyUnlockSearch(new URLSearchParams('pro=advantage')), true);
  assert.equal(isProUnlocked(), true);
  assert.equal(isCoachUnlocked(), false);
  assert.equal(isWhiteUnlocked(), false);
  assert.equal(localStorage.getItem(PRO_UNLOCK_STORAGE_KEY), '1');
  assert.equal(tryUnlock('1'), true);
  assert.equal(isWhiteUnlocked(), false);
  lockPro();
  assert.equal(isProUnlocked(), false);
  assert.equal(applyUnlockSearch(new URLSearchParams('pro=0')), true);
  assert.equal(isProUnlocked(), false);
  const stripped = stripUnlockParams(new URLSearchParams('pro=advantage&stay=1'));
  assert.equal(stripped.has('pro'), false);
  assert.equal(stripped.get('stay'), '1');
});

test('WINBYADV unlocks White, Coach, and Pro on the owner path', () => {
  assert.equal(FULL_OWNER_UNLOCK_CODE, 'WINBYADV');
  assert.equal(isFullOwnerUnlockCode('WINBYADV'), true);
  assert.equal(isFullOwnerUnlockCode(' winbyadv '), true);
  assert.equal(isFullOwnerUnlockCode('WinByAdv'), true);
  assert.equal(isFullOwnerUnlockCode('advantage'), false);
  assert.equal(codesMatch('WINBYADV'), true);
  assert.equal(previewUnlockFromSearch(new URLSearchParams('pro=WINBYADV')), true);
  assert.equal(previewUnlockFromSearch(new URLSearchParams('unlock=winbyadv')), true);

  resetUnlocks();
  assert.equal(tryProductOwnerUnlock('pro', '  winbyadv '), true);
  assert.equal(isProUnlocked(), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(localStorage.getItem(COACH_UNLOCK_STORAGE_KEY), '1');
  assert.equal(localStorage.getItem(WHITE_UNLOCK_STORAGE_KEY), '1');

  resetUnlocks();
  assert.equal(tryProductOwnerUnlock('coach', 'WINBYADV'), true);
  assert.equal(isProUnlocked(), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);

  resetUnlocks();
  assert.equal(tryUnlock('advantage'), true);
  assert.equal(isProUnlocked(), true);
  assert.equal(isCoachUnlocked(), false);
  assert.equal(isWhiteUnlocked(), false);
  assert.equal(tryProductOwnerUnlock('coach', 'advantage'), false);
  assert.equal(isCoachUnlocked(), false);
  assert.equal(tryProductOwnerUnlock('pro', 'gbellijay'), false);

  resetUnlocks();
  assert.equal(applyUnlockSearch(new URLSearchParams('pro=WINBYADV')), true);
  assert.equal(isProUnlocked(), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);

  resetUnlocks();
  assert.equal(applyFullOwnerSearch(new URLSearchParams('coach=winbyadv')), true);
  assert.equal(isProUnlocked(), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(applyFullOwnerSearch(new URLSearchParams('pro=advantage')), false);
  assert.equal(applyFullOwnerSearch(new URLSearchParams('coach=gbellijay')), false);
});

test('a Pro subscription entitlement matches the Stripe product id', () => {
  assert.equal(PRO_PRODUCT_ID, API_PRODUCT_PRO);
  assert.equal(proPurchaseEntitled({ entitled: true, product: 'advantage-pro' }), true);
  assert.equal(proPurchaseEntitled({ entitled: true, product: 'advantage-white' }), false);
  assert.equal(proPurchaseEntitled({ entitled: false, product: 'advantage-pro' }), false);
  assert.equal(proDeviceUnlock({ entitled: true, product: 'advantage-pro' }), true);
  assert.equal(proDeviceUnlock({ entitled: false, product: 'advantage-pro' }), false);
  assert.equal(proDeviceUnlock({ entitled: false }), null);
  assert.equal(proDeviceUnlock({ entitled: true, product: 'advantage-white' }), null);
  assert.equal(
    proPurchaseReturn(new URLSearchParams('checkout=success&session_id=cs_test_pro')),
    true,
  );
  assert.equal(proPurchaseReturn(new URLSearchParams('checkout=cancel&session_id=cs_test_pro')), false);
  assert.equal(proPurchaseReturn(new URLSearchParams('checkout=success')), false);
});

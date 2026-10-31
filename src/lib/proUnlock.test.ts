import assert from 'node:assert/strict';
import test from 'node:test';
import { COACH_UNLOCK_STORAGE_KEY, isCoachUnlocked, lockCoach } from './coachUnlock.ts';
import {
  PRO_UNLOCK_STORAGE_KEY,
  applyFullOwnerSearch,
  applyUnlockSearch,
  isProUnlocked,
  lockPro,
  previewUnlockFromSearch,
  setProUnlocked,
  tryProductOwnerUnlock,
  tryUnlock,
} from './proUnlock.ts';
import { PRO_PRODUCT_ID, proDeviceUnlock, proPurchaseEntitled, proPurchaseReturn } from './proEntitlement.ts';
import { studentEditionOpen } from './studentEdition.ts';
import { isStudentEditionUnlocked } from './studentUnlock.ts';
import { API_PRODUCT_PRO } from '../server/routes.ts';
import { WHITE_UNLOCK_STORAGE_KEY, isWhiteUnlocked, setWhiteUnlocked } from './whiteUnlock.ts';
import { clearOwnerTestGrant } from './ownerTestGrant.ts';

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
Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });

function resetUnlocks(): void {
  lockPro();
  lockCoach();
  setWhiteUnlocked(false);
  clearOwnerTestGrant();
}

test('a typed code does not unlock Pro in the browser', () => {
  resetUnlocks();
  assert.equal(tryUnlock('1'), false);
  assert.equal(tryUnlock('not-a-code'), false);
  assert.equal(tryProductOwnerUnlock('pro', 'not-a-code'), false);
  assert.equal(tryProductOwnerUnlock('coach', 'not-a-code'), false);
  assert.equal(tryProductOwnerUnlock('student', 'not-a-code'), false);
  assert.equal(isProUnlocked(), false);
  assert.equal(isCoachUnlocked(), false);
  assert.equal(isWhiteUnlocked(), false);
});

test('query params do not unlock or lock Pro', () => {
  resetUnlocks();
  setProUnlocked(true);
  for (const search of ['pro=1', 'unlock=1', 'pro=0', 'pro=lock', 'coach=1', 'student=1']) {
    assert.equal(previewUnlockFromSearch(new URLSearchParams(search)), null);
    assert.equal(applyUnlockSearch(new URLSearchParams(search)), false);
    assert.equal(applyFullOwnerSearch(new URLSearchParams(search)), false);
  }
  assert.equal(isProUnlocked(), true);
  assert.equal(localStorage.getItem(PRO_UNLOCK_STORAGE_KEY), '1');
  resetUnlocks();
});

test('setting Pro opens Student Edition, Coach and White (Pro includes everything below it)', () => {
  resetUnlocks();
  setProUnlocked(true);
  assert.equal(isProUnlocked(), true);
  assert.equal(isStudentEditionUnlocked(), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: true, coach: false, white: false }), true);
  lockPro();
  assert.equal(isProUnlocked(), false);
  assert.equal(isStudentEditionUnlocked(), false);
  assert.equal(isCoachUnlocked(), false);
  assert.equal(isWhiteUnlocked(), false);
  assert.equal(localStorage.getItem(COACH_UNLOCK_STORAGE_KEY), null);
  assert.equal(localStorage.getItem(WHITE_UNLOCK_STORAGE_KEY), null);
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
  assert.equal(proPurchaseReturn(new URLSearchParams('checkout=success&session_id=cs_test_pro')), true);
  assert.equal(proPurchaseReturn(new URLSearchParams('checkout=cancel&session_id=cs_test_pro')), false);
  assert.equal(proPurchaseReturn(new URLSearchParams('checkout=success')), false);
  resetUnlocks();
  assert.equal(isProUnlocked(), false);
});

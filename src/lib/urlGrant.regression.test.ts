import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCoachUnlockSearch, isCoachUnlocked, lockCoach } from './coachUnlock.ts';
import { clearOwnerTestGrant, ownerTestActive, readOwnerTestGrant } from './ownerTestGrant.ts';
import { applyFullOwnerSearch, applyUnlockSearch, isProUnlocked, lockPro, previewUnlockFromSearch } from './proUnlock.ts';
import { studentDemoMode, studentEditionEntitled } from './studentEdition.ts';
import { isStudentEditionUnlocked, lockStudentEdition } from './studentUnlock.ts';
import { isWhiteUnlocked, setWhiteUnlocked } from './whiteUnlock.ts';

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

Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });

const owner = { pro: false, coach: false, white: false, student: false };

test('no URL or hash grants a tier', () => {
  lockPro();
  lockCoach();
  lockStudentEdition();
  setWhiteUnlocked(false);
  clearOwnerTestGrant();
  const attacks = [
    'pro=1',
    'coach=1',
    'unlock=1',
    'student=1',
    'checkout=success&session_id=cs_test_anything',
    'checkout=success&session_id=free_anything',
    'code=1',
    'promo=1',
  ];
  for (const search of attacks) {
    const params = new URLSearchParams(search);
    assert.equal(applyUnlockSearch(params), false, search);
    assert.equal(applyCoachUnlockSearch(params), false, search);
    assert.equal(applyFullOwnerSearch(params), false, search);
    assert.equal(previewUnlockFromSearch(params), null, search);
  }
  assert.equal(isProUnlocked(), false);
  assert.equal(isCoachUnlocked(), false);
  assert.equal(isWhiteUnlocked(), false);
  assert.equal(isStudentEditionUnlocked(), false);
  assert.equal(readOwnerTestGrant(), null);
  assert.equal(ownerTestActive('pro'), false);
  assert.equal(ownerTestActive('seat'), false);
  assert.equal(studentEditionEntitled(owner), false);
  assert.equal(studentDemoMode(new URLSearchParams('student=1'), owner), true);
  const hashParams = new URLSearchParams('');
  assert.equal(applyUnlockSearch(hashParams), false);
  assert.equal(isProUnlocked(), false);
});

test('localStorage tampering does not create an owner-test grant', () => {
  clearOwnerTestGrant();
  localStorage.setItem('advantage.ownerTest.v1', JSON.stringify({ grants: ['pro', 'seat'], expiresAt: '2999-01-01T00:00:00.000Z' }));
  localStorage.setItem('advantage.proUnlocked', '1');
  assert.equal(readOwnerTestGrant(), null);
  assert.equal(ownerTestActive('seat'), false);
  localStorage.removeItem('advantage.proUnlocked');
});

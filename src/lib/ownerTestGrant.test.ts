import assert from 'node:assert/strict';
import test from 'node:test';
import { readCurrentSeat } from './instructorSeats.ts';
import {
  applyOwnerTestGrant,
  clearOwnerTestGrant,
  ownerTestActive,
  readOwnerTestGrant,
} from './ownerTestGrant.ts';
import { isCoachUnlocked } from './coachUnlock.ts';
import { isProUnlocked } from './proUnlock.ts';
import { isWhiteUnlocked } from './whiteUnlock.ts';
import { studentDemoMode } from './studentEdition.ts';

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
    key: () => null,
    length: 0,
    clear() {
      store.clear();
    },
  };
}

const local = memoryStorage();
const session = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });

test('owner test grant is session-only, expires, and clears', () => {
  clearOwnerTestGrant();
  local.clear();
  assert.equal(
    applyOwnerTestGrant({
      grants: ['white', 'student', 'coach', 'pro', 'seat'],
      expiresAt: '2999-01-01T00:00:00.000Z',
      tier: 'all',
    }),
    true,
  );
  assert.equal(ownerTestActive('pro'), true);
  assert.equal(ownerTestActive('seat'), true);
  assert.equal(isProUnlocked(), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(readCurrentSeat()?.email, 'Owner test');
  assert.equal(local.getItem('matboard.pro.instructorSeats.v1'), null);
  assert.equal(local.getItem('advantage.proUnlocked'), null);

  clearOwnerTestGrant();
  assert.equal(readOwnerTestGrant(), null);
  assert.equal(isProUnlocked(), false);
  assert.equal(readCurrentSeat(), null);

  applyOwnerTestGrant({ grants: ['pro'], expiresAt: '2000-01-01T00:00:00.000Z', tier: 'pro' });
  assert.equal(readOwnerTestGrant(), null);
  assert.equal(studentDemoMode(new URLSearchParams('student=1'), { pro: false, coach: false, white: false }), true);
  assert.equal(ownerTestActive('pro'), false);
});

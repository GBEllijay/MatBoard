import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readCurrentSeat, readSignedOutToast, signOutInstructorSeat } from './instructorSeats.ts';
import { ownerPassOutranksSeat } from './ownerPassRank.ts';
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
  // The Instructors preview stays signed in while Pro is on the same grant.
  assert.equal(readCurrentSeat()?.email, 'Owner test');
  assert.equal(readCurrentSeat()?.presetId, 'instructors');
  assert.equal(local.getItem('matboard.pro.instructorSeats.v1'), null);
  assert.equal(local.getItem('advantage.proUnlocked'), null);

  clearOwnerTestGrant();
  applyOwnerTestGrant({ grants: ['seat'], expiresAt: '2999-01-01T00:00:00.000Z', tier: 'seat' });
  assert.equal(readCurrentSeat()?.email, 'Owner test');
  assert.equal(readCurrentSeat()?.presetId, 'instructors');

  clearOwnerTestGrant();
  assert.equal(readOwnerTestGrant(), null);
  assert.equal(isProUnlocked(), false);
  assert.equal(readCurrentSeat(), null);

  applyOwnerTestGrant({ grants: ['pro'], expiresAt: '2000-01-01T00:00:00.000Z', tier: 'pro' });
  assert.equal(readOwnerTestGrant(), null);
  assert.equal(studentDemoMode(new URLSearchParams('student=1'), { pro: false, coach: false, white: false }), true);
  assert.equal(ownerTestActive('pro'), false);
});

test('sign out ends the Owner test seat and does not leave a signed-out bar', () => {
  clearOwnerTestGrant();
  local.clear();
  session.clear();
  applyOwnerTestGrant({
    grants: ['white', 'student', 'coach', 'pro', 'seat'],
    expiresAt: '2999-01-01T00:00:00.000Z',
    tier: 'all',
  });
  assert.equal(readCurrentSeat()?.email, 'Owner test');
  assert.equal(ownerPassOutranksSeat(null), true);
  assert.doesNotThrow(() => signOutInstructorSeat());
  assert.equal(readCurrentSeat(), null);
  assert.equal(ownerTestActive('seat'), false);
  assert.equal(ownerTestActive('pro'), true);
  assert.equal(isProUnlocked(), true);
  assert.equal(readSignedOutToast(), true);
  assert.equal(session.getItem('matboard.pro.instructorSeatSignedOutToast.v1'), null);

  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /\.seat-session-dock \{\s*position: relative;/);
  assert.doesNotMatch(css, /\.seat-session-dock \{\s*position: sticky;/);
  assert.match(css, /\.seat-toast \{\s*position: relative;/);
  assert.doesNotMatch(css, /\.seat-toast \{\s*position: fixed;/);

  const unlimited = readFileSync(new URL('../pages/CoachUnlimited.tsx', import.meta.url), 'utf8');
  const coach = readFileSync(new URL('../pages/Coach.tsx', import.meta.url), 'utf8');
  assert.match(unlimited, /title="Instructor Edition"/);
  assert.match(coach, /title="Advantage - Coach"/);
  assert.doesNotMatch(unlimited, /Advantage - Coach Unlimited/);
});

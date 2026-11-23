import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  clearEntitlementToken,
  setEntitlementConfigForTests,
  setEntitlementReadyForTests,
} from './entitlement.ts';
import { hasSavedAdvantageAccess } from './homeLicenseRedirect.ts';
import { acceptInstructorInvite, issueInstructorInvite, signOutInstructorSeat } from './instructorSeats.ts';
import { clearOwnerTestGrant } from './ownerTestGrant.ts';
import { isPreviewWhiteUnlocked } from './previewWhiteBypass.ts';
import { PRODUCTS_PATH } from './productNames.ts';
import { STUDENT_CODE_KEY } from './studentDriveCopy.ts';
import { setStudentEditionUnlocked } from './studentUnlock.ts';
import { setWhiteUnlocked } from './whiteUnlock.ts';

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
    clear: () => {
      store.clear();
    },
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });

function reset(): void {
  localStorage.clear();
  sessionStorage.clear();
  clearEntitlementToken();
  clearOwnerTestGrant();
  signOutInstructorSeat();
  setEntitlementReadyForTests(true);
  setEntitlementConfigForTests({
    signing: false,
    keys: [],
    legacyAmnestyEndsAt: '2099-01-01T00:00:00.000Z',
  });
}

test('a device with nothing saved stays on the public homepage', () => {
  reset();
  assert.equal(hasSavedAdvantageAccess(), false);
});

test('a saved White license counts as Advantage access', () => {
  reset();
  setWhiteUnlocked(true);
  assert.equal(hasSavedAdvantageAccess(), true);
});

test('preview-bypass-only White is not saved access and must not redirect', () => {
  reset();
  assert.equal(hasSavedAdvantageAccess(), false);
  assert.equal(isPreviewWhiteUnlocked('3535ac47.matboard.pages.dev'), true);
  assert.equal(hasSavedAdvantageAccess(), false);
  const src = readFileSync(new URL('./homeLicenseRedirect.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from ['\"].*previewWhiteBypass/);
});

test('a Student Edition unlock, student code, or instructor seat counts as Advantage access', () => {
  reset();
  setStudentEditionUnlocked(true);
  assert.equal(hasSavedAdvantageAccess(), true);

  reset();
  localStorage.setItem(STUDENT_CODE_KEY, 'STU-14');
  assert.equal(hasSavedAdvantageAccess(), true);

  reset();
  const issued = issueInstructorInvite({
    email: 'coach@gym.test',
    origin: 'http://localhost',
    token: 'tok-redirect-seat',
    id: 'seat-redirect-1',
  });
  assert.equal(issued.ok, true);
  assert.equal(acceptInstructorInvite('tok-redirect-seat').ok, true);
  assert.equal(hasSavedAdvantageAccess(), true);
});

test('the products page must not send people back to the public homepage', () => {
  const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8');
  assert.match(home, /fallback=\{PRODUCTS_PATH\}/);
  assert.match(home, /<HomeMark to=\{PRODUCTS_PATH\}/);
  assert.doesNotMatch(home, /HistoryBackMark fallback="\/"/);
  assert.doesNotMatch(home, /<HomeMark to="\/"/);
  assert.equal(PRODUCTS_PATH, '/products');
});

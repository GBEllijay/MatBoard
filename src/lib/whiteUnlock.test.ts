import assert from 'node:assert/strict';
import test from 'node:test';
import { WHITE_BUY_PATH } from './whitePurchase.ts';
import { DRIVE_BINDING_KEY } from './googleDrive.ts';
import { setProUnlocked } from './proUnlock.ts';
import { STUDENT_EDITION_UNLOCK_STORAGE_KEY, isStudentEditionUnlocked } from './studentUnlock.ts';
import { STUDENT_PURCHASE_STORAGE_KEY } from './studentEdition.ts';
import {
  WHITE_UNLOCK_STORAGE_KEY,
  isWhiteRestoreEmail,
  isWhiteUnlocked,
  lockWhite,
  rememberWhitePurchase,
  restoreWhiteByEmail,
  setWhiteUnlocked,
  whiteEntryPath,
  whiteHubAllowed,
  whiteLiveToolsAllowed,
} from './whiteUnlock.ts';

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

test('White hub stays closed until this device stores an unlock', () => {
  setWhiteUnlocked(false);
  assert.equal(isWhiteUnlocked(), false);
  assert.equal(whiteHubAllowed(false), false);
  assert.equal(whiteEntryPath(false), WHITE_BUY_PATH);
  assert.equal(whiteEntryPath(false), '/buy');
  assert.equal(rememberWhitePurchase({ entitled: false }), false);
  assert.equal(isWhiteUnlocked(), false);
  assert.equal(rememberWhitePurchase({ entitled: true }), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(localStorage.getItem(WHITE_UNLOCK_STORAGE_KEY), '1');
  assert.equal(whiteHubAllowed(true), true);
  assert.equal(whiteEntryPath(true), '/white');
});

test('live scoreboard and timer stay open for White or an existing Coach or Pro door', () => {
  const closed = { whiteUnlocked: false, coachDoor: false, proDoor: false };
  assert.equal(whiteLiveToolsAllowed(closed), false);
  assert.equal(whiteLiveToolsAllowed({ ...closed, whiteUnlocked: true }), true);
  assert.equal(whiteLiveToolsAllowed({ ...closed, coachDoor: true }), true);
  assert.equal(whiteLiveToolsAllowed({ ...closed, proDoor: true }), true);
  assert.equal(whiteHubAllowed(false), false);
});

test('restore email matches the entitlement API check', () => {
  assert.equal(isWhiteRestoreEmail('justinguise@gmail.com'), true);
  assert.equal(isWhiteRestoreEmail('  Buyer@Gym.com '), true);
  assert.equal(isWhiteRestoreEmail(''), false);
  assert.equal(isWhiteRestoreEmail('not-an-email'), false);
  assert.equal(isWhiteRestoreEmail('has space@gym.com'), false);
  assert.equal(isWhiteRestoreEmail(`${'a'.repeat(320)}@x.com`), false);
});

test('an email does not unlock White or reveal a purchase', async () => {
  setWhiteUnlocked(false);
  const result = await restoreWhiteByEmail('  buyer@gym.com ');
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.error, /no longer unlocks/);
  assert.equal(isWhiteUnlocked(), false);

  setWhiteUnlocked(true);
  const still = await restoreWhiteByEmail('buyer@gym.com');
  assert.equal(still.ok, false);
  assert.equal(isWhiteUnlocked(), true);
});

test('lockWhite clears only this browser White flag and the code can open it again', () => {
  localStorage.setItem('advantage.proUnlocked', '1');
  localStorage.setItem('advantage.coachUnlocked', '1');
  localStorage.setItem(STUDENT_EDITION_UNLOCK_STORAGE_KEY, '1');
  localStorage.setItem(STUDENT_PURCHASE_STORAGE_KEY, '1');
  localStorage.setItem('matboard.studentEdition.v1', '{"journal":"keep","belt":"blue"}');
  localStorage.setItem('matboard.whiteRoster.v1', '{"names":["Keepsake"]}');
  localStorage.setItem(DRIVE_BINDING_KEY, '{"folderId":"keep-folder"}');
  setWhiteUnlocked(true);

  lockWhite();

  assert.equal(isWhiteUnlocked(), false);
  assert.equal(localStorage.getItem(WHITE_UNLOCK_STORAGE_KEY), null);
  assert.equal(whiteHubAllowed(isWhiteUnlocked()), false);
  assert.equal(whiteEntryPath(isWhiteUnlocked()), '/buy');
  assert.equal(localStorage.getItem('advantage.proUnlocked'), '1');
  assert.equal(localStorage.getItem('advantage.coachUnlocked'), '1');
  assert.equal(localStorage.getItem(STUDENT_EDITION_UNLOCK_STORAGE_KEY), '1');
  assert.equal(isStudentEditionUnlocked(), true);
  assert.equal(localStorage.getItem(STUDENT_PURCHASE_STORAGE_KEY), '1');
  assert.equal(localStorage.getItem('matboard.studentEdition.v1'), '{"journal":"keep","belt":"blue"}');
  assert.equal(localStorage.getItem('matboard.whiteRoster.v1'), '{"names":["Keepsake"]}');
  assert.equal(localStorage.getItem(DRIVE_BINDING_KEY), '{"folderId":"keep-folder"}');

  assert.equal(rememberWhitePurchase({ entitled: true }), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(whiteEntryPath(isWhiteUnlocked()), '/white');

  lockWhite();
  assert.equal(isWhiteUnlocked(), false);
  setProUnlocked(true);
  setWhiteUnlocked(true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(localStorage.getItem('matboard.studentEdition.v1'), '{"journal":"keep","belt":"blue"}');
  assert.equal(localStorage.getItem('matboard.whiteRoster.v1'), '{"names":["Keepsake"]}');
  assert.equal(localStorage.getItem(DRIVE_BINDING_KEY), '{"folderId":"keep-folder"}');
});

test('restore rejects a bad email before lookup and reports a failed lookup', async () => {
  setWhiteUnlocked(false);
  const invalid = await restoreWhiteByEmail('not-an-email');
  assert.deepEqual(invalid, { ok: false, error: 'Enter the email from your purchase.' });
  assert.equal(isWhiteUnlocked(), false);

  const lookup = await restoreWhiteByEmail('buyer@gym.com');
  assert.equal(lookup.ok, false);
  assert.equal(isWhiteUnlocked(), false);
});

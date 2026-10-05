import assert from 'node:assert/strict';
import test from 'node:test';
import { WHITE_BUY_PATH } from './whitePurchase.ts';
import {
  WHITE_UNLOCK_STORAGE_KEY,
  isWhiteRestoreEmail,
  isWhiteUnlocked,
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

test('entitled purchase email restores White on this device', async () => {
  setWhiteUnlocked(false);
  let seen = '';
  const result = await restoreWhiteByEmail('  JustInGuise@gmail.com ', async ({ email }) => {
    seen = email;
    return { entitled: true };
  });
  assert.equal(result.ok, true);
  assert.equal(seen, 'JustInGuise@gmail.com');
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(whiteHubAllowed(isWhiteUnlocked()), true);
  assert.equal(whiteEntryPath(isWhiteUnlocked()), '/white');
});

test('a non-entitled email does not unlock White or clear an existing unlock', async () => {
  setWhiteUnlocked(false);
  const denied = await restoreWhiteByEmail('gblajadvantage@gmail.com', async () => ({ entitled: false }));
  assert.deepEqual(denied, { ok: false, error: 'That email does not have Advantage White.' });
  assert.equal(isWhiteUnlocked(), false);

  setWhiteUnlocked(true);
  const still = await restoreWhiteByEmail('advantageappllc@gmail.com', async () => ({ entitled: false }));
  assert.equal(still.ok, false);
  assert.equal(isWhiteUnlocked(), true);
});

test('restore rejects a bad email before lookup and reports a failed lookup', async () => {
  setWhiteUnlocked(false);
  let calls = 0;
  const invalid = await restoreWhiteByEmail('not-an-email', async () => {
    calls += 1;
    return { entitled: true };
  });
  assert.deepEqual(invalid, { ok: false, error: 'Enter the email from your purchase.' });
  assert.equal(calls, 0);
  assert.equal(isWhiteUnlocked(), false);

  const offline = await restoreWhiteByEmail('buyer@gym.com', async () => {
    throw new Error('offline');
  });
  assert.deepEqual(offline, {
    ok: false,
    error: 'Could not check that email. Check your connection and try again.',
  });
  assert.equal(isWhiteUnlocked(), false);
});

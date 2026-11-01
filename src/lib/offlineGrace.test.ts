import assert from 'node:assert/strict';
import test from 'node:test';
import { filesForAllowedChunks, filesToKeepOffline, paidImportBlock } from './paidChunkAccess.ts';
import { TOKEN_AUD, TOKEN_ISS, TOKEN_VERSION, type EntitlementClaims } from './entitlementToken.ts';

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

const DAY = 24 * 60 * 60;
const ISSUED = Date.parse('2026-11-01T12:00:00.000Z');
const FILES = {
  'pro-console': ['/paid/pro.js'],
  'media-console': ['/paid/media.js'],
  'lesson-cloud': ['/paid/lesson.js'],
  'coach-unlimited': ['/paid/coach.js'],
};

/** Same lifetimes the server issues: Pro 7 days + 3 offline days. */
function pro(partial: Partial<EntitlementClaims> = {}): EntitlementClaims {
  const now = Math.floor(ISSUED / 1000);
  return {
    iss: TOKEN_ISS,
    aud: TOKEN_AUD,
    kid: 'k1',
    sub: 'lic',
    grants: ['student', 'coach', 'pro'],
    tier: 'pro',
    src: 'code',
    exp: now + 7 * DAY,
    iat: now,
    nbf: now,
    refresh_after: now + DAY,
    offline_grace: 3 * DAY,
    did: 'dev',
    v: TOKEN_VERSION,
    ...partial,
  };
}

const at = (days: number) => ISSUED + days * DAY * 1000;

test('a fresh pass keeps and downloads all its paid screens', () => {
  assert.equal(filesToKeepOffline(pro(), FILES, at(1)).length, 4);
  assert.equal(filesForAllowedChunks(pro(), FILES, at(1)).length, 4);
});

test('after exp, inside the 3 offline days: saved paid screens are kept, but not downloaded again', () => {
  // Before this fix the cache was purged here, so a gym offline past day 7 lost Pro Console.
  assert.equal(filesToKeepOffline(pro(), FILES, at(8)).length, 4);
  assert.equal(filesForAllowedChunks(pro(), FILES, at(8)).length, 0, 'server rule unchanged: expired token gets no new download');
});

test('past exp + offline grace the saved copies are dropped (limit unchanged)', () => {
  assert.deepEqual(filesToKeepOffline(pro(), FILES, at(10.01)), []);
});

test('a locked subscription keeps nothing', () => {
  assert.deepEqual(filesToKeepOffline(pro({ subs: { state: 'locked' } as EntitlementClaims['subs'] }), FILES, at(1)), []);
});

test('one-time pass keeps its screens until fail_open_until, then drops them', () => {
  const now = Math.floor(ISSUED / 1000);
  const onetime = pro({ grants: ['student', 'coach', 'pro'], tier: 'onetime' as EntitlementClaims['tier'], exp: now + 30 * DAY, fail_open_until: now + 120 * DAY, offline_grace: undefined });
  assert.equal(filesToKeepOffline(onetime, FILES, at(60)).length, 4);
  assert.deepEqual(filesToKeepOffline(onetime, FILES, at(121)), []);
});

test('keeping a copy does not open it: online after exp is still refused', () => {
  const base = { ready: true, claims: pro(), amnesty: false, token: 't', chunk: 'pro-console' as const };
  assert.equal(paidImportBlock({ ...base, nowMs: at(8), offline: false }), 'failed');
  assert.equal(paidImportBlock({ ...base, nowMs: at(8), offline: true }), null, 'offline grace opens the saved copy');
  assert.equal(paidImportBlock({ ...base, nowMs: at(10.5), offline: true }), 'failed', 'past grace stays shut');
});

test('a rolled-back clock never opens a paid screen', () => {
  const base = { ready: true, claims: pro(), amnesty: false, token: 't', chunk: 'pro-console' as const };
  assert.equal(paidImportBlock({ ...base, nowMs: at(1), offline: true, clockRolledBack: true }), 'failed');
  assert.equal(paidImportBlock({ ...base, nowMs: at(1), offline: false, clockRolledBack: true }), 'failed');
  assert.equal(paidImportBlock({ ...base, nowMs: at(1), offline: false, clockRolledBack: false }), null);
});

test('route guards wait only while a saved pass is being checked', async () => {
  const { entitlementSettled, setEntitlementReadyForTests, ENTITLEMENT_TOKEN_KEY } = await import('./entitlement.ts');
  local.clear();
  setEntitlementReadyForTests(false);
  assert.equal(entitlementSettled(), true, 'no saved pass: nothing to wait for, redirect as before');
  local.setItem(ENTITLEMENT_TOKEN_KEY, 'saved.pass.value');
  assert.equal(entitlementSettled(), false, 'saved pass not checked yet: wait');
  setEntitlementReadyForTests(true);
  assert.equal(entitlementSettled(), true);
  local.clear();
});

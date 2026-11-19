import assert from 'node:assert/strict';
import test from 'node:test';
import { browserFamily, detectPrivateBrowsing, privateBrowsingText, requestPersistentStorage, type PrivateProbeEnv } from './privateBrowsing.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const GB = 1024 ** 3;

function okStore() {
  const map = new Map<string, string>();
  return { setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
}

function idbOk(): PrivateProbeEnv['indexedDB'] {
  return {
    open: () => {
      const request: Record<string, unknown> = { result: { close() {} } };
      setTimeout(() => (request.onsuccess as () => void)?.(), 0);
      return request as unknown as IDBOpenDBRequest;
    },
  };
}

function idbFails(): PrivateProbeEnv['indexedDB'] {
  return {
    open: () => {
      const request: Record<string, unknown> = {};
      setTimeout(() => (request.onerror as () => void)?.(), 0);
      return request as unknown as IDBOpenDBRequest;
    },
  };
}

function storage(over: Partial<NonNullable<PrivateProbeEnv['storage']>> = {}): NonNullable<PrivateProbeEnv['storage']> {
  return {
    estimate: async () => ({ quota: 10 * GB, usage: 1000 }),
    persisted: async () => false,
    getDirectory: async () => ({}),
    ...over,
  };
}

test('normal browsers stay quiet', async () => {
  for (const env of [
    { userAgent: IPHONE, localStorage: okStore(), storage: storage(), indexedDB: idbOk(), hasServiceWorker: true },
    { userAgent: MAC_SAFARI, localStorage: okStore(), storage: storage(), indexedDB: idbOk(), hasServiceWorker: true },
    { userAgent: CHROME, localStorage: okStore(), storage: storage(), indexedDB: idbOk(), hasServiceWorker: true },
    { userAgent: FIREFOX, localStorage: okStore(), storage: storage(), indexedDB: idbOk(), hasServiceWorker: true },
    // Brave reports a fixed 2 GB quota, private or not.
    { userAgent: CHROME, isBrave: true, localStorage: okStore(), storage: storage({ estimate: async () => ({ quota: 2 * GB }) }), hasServiceWorker: true },
    // Brave with a small quota still says nothing: its quota is not a signal.
    { userAgent: CHROME, isBrave: true, localStorage: okStore(), storage: storage({ estimate: async () => ({ quota: 50 * 1024 * 1024 }) }) },
    // Missing APIs (older browsers) are not a signal.
    { userAgent: IPHONE },
  ] satisfies PrivateProbeEnv[]) {
    const verdict = await detectPrivateBrowsing(env);
    assert.equal(verdict.private, false, JSON.stringify({ ua: env.userAgent, brave: 'isBrave' in env }));
  }
});

test('Safari private: localStorage that throws on write', async () => {
  const throwing = { setItem: () => { throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }); }, removeItem: () => {} };
  const verdict = await detectPrivateBrowsing({ userAgent: IPHONE, localStorage: throwing, storage: storage() });
  assert.deepEqual(verdict, { private: true, reason: 'localStorage' });
  // Storage that cannot even be reached also cannot save.
  assert.equal((await detectPrivateBrowsing({ userAgent: CHROME, localStorage: null })).private, true);
});

test('Safari private: getDirectory rejects with the transient reason', async () => {
  const env: PrivateProbeEnv = {
    userAgent: IPHONE,
    localStorage: okStore(),
    storage: storage({ getDirectory: async () => { throw new Error('UnknownError: The operation failed for an unknown transient reason (e.g. out of memory).'); } }),
  };
  assert.deepEqual(await detectPrivateBrowsing(env), { private: true, reason: 'safari-opfs' });
  // Any other getDirectory failure is not proof.
  const other: PrivateProbeEnv = { ...env, storage: storage({ getDirectory: async () => { throw new Error('SecurityError'); } }) };
  assert.equal((await detectPrivateBrowsing(other)).private, false);
  // Chrome never uses the Safari signal.
  assert.equal((await detectPrivateBrowsing({ ...env, userAgent: CHROME })).private, false);
});

test('Firefox private: no service worker or IndexedDB will not open', async () => {
  assert.deepEqual(await detectPrivateBrowsing({ userAgent: FIREFOX, localStorage: okStore(), storage: storage(), hasServiceWorker: false }), {
    private: true,
    reason: 'firefox-sw',
  });
  assert.deepEqual(await detectPrivateBrowsing({ userAgent: FIREFOX, localStorage: okStore(), storage: storage(), indexedDB: idbFails(), hasServiceWorker: true }), {
    private: true,
    reason: 'firefox-idb',
  });
});

test('Chromium quota heuristic only fires on a tiny quota', async () => {
  const tiny = storage({ estimate: async () => ({ quota: 100 * 1024 * 1024 }) });
  assert.deepEqual(await detectPrivateBrowsing({ userAgent: CHROME, localStorage: okStore(), storage: tiny }), { private: true, reason: 'chromium-quota' });
  const zero = storage({ estimate: async () => ({ quota: 0 }) });
  assert.equal((await detectPrivateBrowsing({ userAgent: CHROME, localStorage: okStore(), storage: zero })).private, false);
  const broken = storage({ estimate: async () => { throw new Error('nope'); } });
  assert.equal((await detectPrivateBrowsing({ userAgent: CHROME, localStorage: okStore(), storage: broken })).private, false);
});

test('persisted storage always means a normal tab', async () => {
  const env: PrivateProbeEnv = {
    userAgent: CHROME,
    localStorage: okStore(),
    storage: storage({ persisted: async () => true, estimate: async () => ({ quota: 10 * 1024 * 1024 }) }),
  };
  assert.equal((await detectPrivateBrowsing(env)).private, false);
});

test('a hung check gives up quietly', async () => {
  const env: PrivateProbeEnv = {
    userAgent: IPHONE,
    localStorage: okStore(),
    storage: storage({ persisted: () => new Promise(() => {}), getDirectory: () => new Promise(() => {}) }),
    timeoutMs: 20,
  };
  assert.equal((await detectPrivateBrowsing(env)).private, false);
});

test('browser family and wording', () => {
  assert.equal(browserFamily(IPHONE), 'safari');
  assert.equal(browserFamily(IPHONE.replace('Version/18.1', 'CriOS/156.0')), 'safari');
  assert.equal(browserFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15'), 'safari');
  assert.equal(browserFamily(CHROME), 'chromium');
  assert.equal(browserFamily(CHROME, true), 'brave');
  assert.equal(browserFamily(FIREFOX), 'firefox');
  assert.match(privateBrowsingText(IPHONE), /private browsing\. Advantage can.t save your data here\. Open it in a normal Safari tab and add it to your Home Screen/);
  assert.match(privateBrowsingText(CHROME), /incognito/);
});

test('persist() is asked quietly, and never on Firefox where it prompts', async () => {
  let asked = 0;
  const s = { persisted: async () => false, persist: async () => { asked += 1; return true; } };
  assert.equal(await requestPersistentStorage({ userAgent: IPHONE, storage: s }), true);
  assert.equal(asked, 1);
  assert.equal(await requestPersistentStorage({ userAgent: FIREFOX, storage: s }), null);
  assert.equal(asked, 1);
  assert.equal(await requestPersistentStorage({ userAgent: CHROME, storage: { persisted: async () => true, persist: s.persist } }), true);
  assert.equal(asked, 1);
  assert.equal(await requestPersistentStorage({ userAgent: CHROME, storage: null }), null);
});

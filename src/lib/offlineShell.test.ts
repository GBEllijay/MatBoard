import assert from 'node:assert/strict';
import test from 'node:test';
import { appNavigationUsesShell, createAppShellHandler } from '../server/appShellSw.ts';
import { bindAppInstalledPersistence, isInstalledApp, requestPersistentStorage, setPlaybackAudioSession } from './offlineShell.ts';

const media = (modes: string[]) => (query: string) => ({ matches: modes.some((m) => query === `(display-mode: ${m})`) });

test('installed app is detected for fullscreen, standalone, and iOS home screen', () => {
  assert.equal(isInstalledApp({ matchMedia: media(['fullscreen']) }), true);
  assert.equal(isInstalledApp({ matchMedia: media(['standalone']) }), true);
  assert.equal(isInstalledApp({ matchMedia: media(['window-controls-overlay']) }), true);
  assert.equal(isInstalledApp({ matchMedia: media([]), navigator: { standalone: true } }), true);
  assert.equal(isInstalledApp({ matchMedia: media(['browser']) }), false);
  assert.equal(isInstalledApp(undefined), false);
});

test('persistent storage is asked only for an installed app', async () => {
  let asked = 0;
  const storage = { persisted: async () => false, persist: async () => { asked += 1; return true; } };
  assert.equal(await requestPersistentStorage(false, storage), 'skipped');
  assert.equal(asked, 0);
  assert.equal(await requestPersistentStorage(true, storage), 'granted');
  assert.equal(asked, 1);
});

test('persistent storage: already persisted, denied, missing API, or throwing API', async () => {
  assert.equal(await requestPersistentStorage(true, { persisted: async () => true, persist: async () => true }), 'already');
  assert.equal(await requestPersistentStorage(true, { persisted: async () => false, persist: async () => false }), 'denied');
  assert.equal(await requestPersistentStorage(true, undefined), 'unsupported');
  assert.equal(await requestPersistentStorage(true, {}), 'unsupported');
  assert.equal(await requestPersistentStorage(true, { persist: async () => { throw new Error('x'); } }), 'unsupported');
});

test('iOS audio session is set to playback so the silent switch does not mute cues', () => {
  const nav = { audioSession: { type: 'auto' } };
  assert.equal(setPlaybackAudioSession(nav), true);
  assert.equal(nav.audioSession.type, 'playback');
  assert.equal(setPlaybackAudioSession(nav), true);
});

test('browsers without navigator.audioSession are left alone', () => {
  assert.equal(setPlaybackAudioSession({}), false);
  assert.equal(setPlaybackAudioSession(undefined), false);
  const throwing = { audioSession: Object.defineProperty({} as { type?: string }, 'type', { get: () => 'auto', set: () => { throw new Error('no'); } }) };
  assert.equal(setPlaybackAudioSession(throwing), false);
});

test('installing the app asks for persistent storage again on this visit', () => {
  const calls: Array<boolean | undefined> = [];
  let installed: (() => void) | undefined;
  bindAppInstalledPersistence(
    (flag) => calls.push(flag),
    {
      addEventListener: (type, listener) => {
        if (type === 'appinstalled') installed = listener;
      },
    },
  );
  assert.deepEqual(calls, [undefined]);
  assert.equal(typeof installed, 'function');
  installed?.();
  assert.deepEqual(calls, [undefined, true]);
});

test('app routes use the cached shell; api, paid, and half-off do not', () => {
  for (const path of ['/', '/card', '/card/', '/card.html', '/match', '/training', '/tournament', '/suite', '/coach-unlimited', '/products', '/pro']) {
    assert.equal(appNavigationUsesShell(path), true, path);
  }
  for (const path of ['/api', '/api/config', '/paid', '/paid/pro.js', '/half-off', '/half-off.html', '/half-off/']) {
    assert.equal(appNavigationUsesShell(path), false, path);
  }
});

test('a dead or failing navigation falls back to the precached index, and a good response does not', async () => {
  const handler = createAppShellHandler();
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  let matched = 0;
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      match: async (url: string) => {
        matched += 1;
        assert.equal(url, '/index.html');
        return new Response('shell', { status: 200, headers: { 'content-type': 'text/html' } });
      },
    },
  });
  try {
    globalThis.fetch = async () => new Response('live', { status: 200 });
    const live = await handler({ request: new Request('https://gym.example/match') });
    assert.equal(await live.text(), 'live');
    assert.equal(matched, 0);

    globalThis.fetch = async () => new Response('down', { status: 502 });
    const failed = await handler({ request: new Request('https://gym.example/products') });
    assert.equal(await failed.text(), 'shell');
    assert.equal(matched, 1);

    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    const offline = await handler({ request: new Request('https://gym.example/training') });
    assert.equal(await offline.text(), 'shell');
    assert.equal(matched, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: originalCaches });
  }
});

test('navigations are fetched with no RequestInit, so Chrome does not reject deep links', async () => {
  const handler = createAppShellHandler();
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  let matched = 0;
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      match: async () => {
        matched += 1;
        return new Response('shell', { status: 200 });
      },
    },
  });
  try {
    // Chrome: a navigate-mode Request plus any init throws a TypeError.
    globalThis.fetch = async (_input: unknown, init?: unknown) => {
      if (init !== undefined) throw new TypeError("Cannot construct a Request with a Request whose mode is 'navigate' and a non-empty RequestInit.");
      return new Response('live deep link', { status: 200 });
    };
    for (const path of ['/pro', '/instructors', '/slideshow?folder=gallery', '/terms']) {
      const res = await handler({ request: new Request(`https://gym.example${path}`) });
      assert.equal(await res.text(), 'live deep link', path);
    }
    assert.equal(matched, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: originalCaches });
  }
});

test('a slow network still falls back to the shell after 4 seconds', async () => {
  const handler = createAppShellHandler();
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const originalSetTimeout = globalThis.setTimeout;
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { match: async () => new Response('shell', { status: 200 }) },
  });
  try {
    globalThis.setTimeout = ((fn: () => void) => originalSetTimeout(fn, 0)) as typeof setTimeout;
    globalThis.fetch = () => new Promise<Response>(() => {});
    const res = await handler({ request: new Request('https://gym.example/pro') });
    assert.equal(await res.text(), 'shell');
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: originalCaches });
  }
});

test('a shell cached through a redirect is served as a plain response', async () => {
  const handler = createAppShellHandler();
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const redirected = new Response('shell', { status: 200, headers: { 'content-type': 'text/html' } });
  Object.defineProperty(redirected, 'redirected', { value: true });
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { match: async () => redirected } });
  try {
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    const res = await handler({ request: new Request('https://gym.example/notes') });
    assert.equal(res.redirected, false);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'shell');
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: originalCaches });
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { isInstalledApp, requestPersistentStorage, setPlaybackAudioSession } from './offlineShell.ts';

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

import assert from 'node:assert/strict';
import test from 'node:test';
import { BRACKET_PHOTO_KEY } from './bracketPhoto.ts';
import { DRIVE_BINDING_KEY, GOOGLE_CLIENT_ID_KEY } from './googleDrive.ts';
import { GYM_LOGO_STORAGE_KEY } from './gymLogo.ts';
import {
  LEGACY_NOTICE_KEY,
  LEGACY_UNLOCK_KEYS,
  noteLegacyAccess,
  retireLegacyUnlockFlags,
} from './legacyUnlock.ts';
import { ONEDRIVE_BINDING_KEY } from './oneDrive.ts';
import { RANK_PHOTO_KEY } from './rankPhotos.ts';
import { STUDENT_EDITION_STORAGE_KEY } from './studentEdition.ts';

const DRIVE_TOKEN_KEY = 'matboard.pro.googleDriveToken';
const ROSTER_KEY = 'matboard.roster.v1';

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
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
    clear() {
      throw new Error('localStorage.clear must not run during entitlement migration');
    },
  };
}

const local = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });

test('amnesty migration leaves photos, logos, and Drive bindings untouched', () => {
  const calls: string[] = [];
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      open() {
        calls.push('open');
        throw new Error('migration must not open IndexedDB');
      },
      deleteDatabase() {
        calls.push('delete');
        throw new Error('migration must not delete IndexedDB');
      },
    },
  });

  const media: Record<string, string> = {
    [GYM_LOGO_STORAGE_KEY]: '{"version":1,"dataUrl":"data:image/png;base64,logo"}',
    [RANK_PHOTO_KEY]: '{"blue":"data:image/jpeg;base64,rank"}',
    [BRACKET_PHOTO_KEY]: '{"bout":"data:image/jpeg;base64,bracket"}',
    [ROSTER_KEY]: '{"competitors":[{"name":"Ada","photo":"data:image/jpeg;base64,face"}]}',
    [STUDENT_EDITION_STORAGE_KEY]: '{"journal":"keep","gallery":"keep"}',
    [DRIVE_BINDING_KEY]: '{"folderId":"drive-folder"}',
    [DRIVE_TOKEN_KEY]: '{"accessToken":"drive-session"}',
    [GOOGLE_CLIENT_ID_KEY]: 'google-client',
    [ONEDRIVE_BINDING_KEY]: '{"folderId":"onedrive-folder"}',
    'msal.interaction.status': 'none',
    'matboard.pro.microsoftClientId': 'ms-client',
    'matboard.whiteRoster.v1': '{"names":["Keepsake"]}',
  };
  for (const [key, value] of Object.entries(media)) local.setItem(key, value);
  local.setItem('advantage.proUnlocked', '1');
  local.setItem('advantage.whiteUnlocked', '1');
  local.setItem('advantage.coachUnlocked', '1');
  local.setItem('advantage.studentEditionUnlocked', '1');
  local.setItem('advantage.studentUnlocked', '1');
  local.setItem('advantage.whiteExpiresAt', '2026-11-01T00:00:00.000Z');
  local.setItem('advantage.studentEditionRelocked', '1');

  noteLegacyAccess();
  assert.equal(retireLegacyUnlockFlags(Date.parse('2026-11-01T00:00:00.000Z')).length, 0);
  for (const [key, value] of Object.entries(media)) assert.equal(local.getItem(key), value, key);
  assert.equal(local.getItem('advantage.proUnlocked'), '1');
  assert.equal(local.getItem(LEGACY_NOTICE_KEY), '1');
  assert.equal(calls.length, 0);

  const removed = retireLegacyUnlockFlags(Date.parse('2027-01-15T00:00:00.000Z'));
  assert.deepEqual([...removed].sort(), [...LEGACY_UNLOCK_KEYS].sort());
  for (const [key, value] of Object.entries(media)) assert.equal(local.getItem(key), value, key);
  for (const key of LEGACY_UNLOCK_KEYS) assert.equal(local.getItem(key), null, key);
  assert.equal(local.getItem('advantage.studentEditionRelocked'), '1');
  assert.equal(local.getItem(LEGACY_NOTICE_KEY), '1');
  assert.equal(calls.length, 0);
});

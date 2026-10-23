/**
 * Disconnect Google Drive on this device, and the folder list used by Change folder.
 * Sign-in itself stays in googleDrive.ts. This module only adds the exit paths.
 * Lesson plans, rosters, journals, OneDrive, and Google Photos are left in place.
 */

import {
  ACADEMY_BINDING_KEY,
  PERSONAL_DRIVE_KEY,
  clearStudentDriveLink,
  loadAcademyLink,
  loadPersonalDrive,
} from './academyPathway.ts';
import { DRIVE_BINDING_KEY, clearDriveSession, revokeDriveAccessToken } from './googleDrive.ts';

/** IndexedDB names that hold a cached Google Drive file list. Local media databases are not listed. */
export const DRIVE_FILE_LIST_DB_NAMES = [
  'matboard.googleDriveFiles',
  'matboard-drive-files',
  'matboard.pro.googleDriveFiles',
] as const;

const disconnectListeners = new Set<() => void>();

export function subscribeGoogleDriveDisconnect(listener: () => void): () => void {
  disconnectListeners.add(listener);
  return () => {
    disconnectListeners.delete(listener);
  };
}

/** A localStorage or sessionStorage key that only remembers a Drive file list. */
export function isDriveFileListStorageKey(key: string): boolean {
  return (
    key.startsWith('matboard.pro.googleDriveFiles') ||
    key.startsWith('matboard.pro.googleDriveFileList') ||
    key.startsWith('matboard.pro.driveFileList') ||
    key.startsWith('matboard.drive.cache.') ||
    key.startsWith('matboard.drive.files.')
  );
}

/** An IndexedDB database that only caches Drive file lists. */
export function isDriveFileListDatabase(name: string): boolean {
  if ((DRIVE_FILE_LIST_DB_NAMES as readonly string[]).includes(name)) return true;
  return /(?:^|[-.])google[-.]?drive[-.](?:files|file-list|cache)/i.test(name);
}

type KeyStore = {
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
};

function storageKeys(store: KeyStore): string[] {
  const keys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

/** Remove cached Drive file lists. Folder bindings and the token are cleared separately. */
export function clearDriveFileListStorage(): void {
  const stores: KeyStore[] = [];
  if (typeof localStorage !== 'undefined') stores.push(localStorage);
  if (typeof sessionStorage !== 'undefined') stores.push(sessionStorage);
  for (const store of stores) {
    try {
      for (const key of storageKeys(store)) {
        if (isDriveFileListStorageKey(key)) store.removeItem(key);
      }
    } catch {
      /* a blocked store still leaves the token and folder clear to run */
    }
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => resolve();
    try {
      const request = indexedDB.deleteDatabase(name);
      const timer = setTimeout(finish, 1500);
      request.onsuccess = () => {
        clearTimeout(timer);
        finish();
      };
      request.onerror = () => {
        clearTimeout(timer);
        finish();
      };
      request.onblocked = () => {
        clearTimeout(timer);
        finish();
      };
    } catch {
      finish();
    }
  });
}

/** Delete Drive file-list databases. Photo, clip, and film databases are not Drive file lists. */
export async function clearDriveIndexedFileLists(): Promise<void> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.deleteDatabase !== 'function') return;
  const names = new Set<string>(DRIVE_FILE_LIST_DB_NAMES);
  if (typeof indexedDB.databases === 'function') {
    try {
      const found = await indexedDB.databases();
      for (const db of found) {
        if (db.name && isDriveFileListDatabase(db.name)) names.add(db.name);
      }
    } catch {
      /* the known names are still deleted */
    }
  }
  await Promise.all([...names].map((name) => deleteDatabase(name)));
}

function clearGoogleStudentFolderLinks(): void {
  if (typeof localStorage === 'undefined') return;
  const academy = loadAcademyLink(localStorage);
  if (academy?.provider === 'googleDrive') clearStudentDriveLink(localStorage, 'academy');
  const personal = loadPersonalDrive(localStorage);
  if (personal?.provider === 'googleDrive') clearStudentDriveLink(localStorage, 'personal');
}

/**
 * Revoke the Google token when the browser can, then forget Drive folder ids
 * and cached Drive file lists. Other app data stays on the device.
 */
export async function disconnectGoogleDrive(): Promise<void> {
  await revokeDriveAccessToken();
  clearDriveSession();
  clearGoogleStudentFolderLinks();
  clearDriveFileListStorage();
  await clearDriveIndexedFileLists();
  disconnectListeners.forEach((listener) => listener());
}

export const DRIVE_FOLDER_BINDING_KEY = DRIVE_BINDING_KEY;
export const DRIVE_STUDENT_ACADEMY_KEY = ACADEMY_BINDING_KEY;
export const DRIVE_STUDENT_PERSONAL_KEY = PERSONAL_DRIVE_KEY;

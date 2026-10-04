/**
 * Older Competition Class clips saved before those videos moved into the
 * Daily Training Videos library. New clips are not written here. A read can
 * still find a clip that was saved in this browser so it can be copied over.
 */

import { VIDEO_ACCEPT, mimeFromFile } from './photoStore.ts';
import { assertOriginRoom, isStorageQuotaError, StorageQuotaError } from './storageQuota.ts';
import { isTechniqueVideoFile } from './techniqueLogic.ts';

const DB_NAME = 'matboard-curriculum-media';
const STORE = 'clips';
const DB_VERSION = 1;

export const CURRICULUM_VIDEO_ACCEPT = VIDEO_ACCEPT;

export type CurriculumClip = {
  id: string;
  name: string;
  mime: string;
  blob: Blob;
  addedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function readCurriculumClip(id: string): Promise<CurriculumClip | null> {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as CurriculumClip | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCurriculumClip(file: File): Promise<CurriculumClip | null> {
  if (!isTechniqueVideoFile(file)) return null;
  await assertOriginRoom(file.size);
  const row: CurriculumClip = {
    id: crypto.randomUUID(),
    name: (file.name || 'Clip').slice(0, 180),
    mime: mimeFromFile(file, { mimePrefix: 'video/' }),
    blob: file,
    addedAt: Date.now(),
  };
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    await txDone(tx);
  } catch (error) {
    if (error instanceof StorageQuotaError) throw error;
    if (isStorageQuotaError(error)) throw new StorageQuotaError(0);
    throw error;
  }
  return row;
}

export async function deleteCurriculumClip(id: string): Promise<void> {
  if (!id) return;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
}

const DB_NAME = 'matboard';
const STORE = 'photos';
const PREFS = 'prefs';
const DB_VERSION = 2;

export const MIN_INTERVAL_SEC = 1;
export const MAX_INTERVAL_SEC = 300;
export const DEFAULT_INTERVAL_SEC = 10;
export const INTERVAL_PRESETS_SEC = [5, 10, 30, 60] as const;

export type StoredPhoto = {
  id: string;
  mime: string;
  addedAt: number;
  blob: Blob;
  label: string;
};

export type SaverPrefs = {
  intervalSec: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PREFS)) {
        db.createObjectStore(PREFS);
      }
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

function normalizePhoto(row: StoredPhoto, index: number): StoredPhoto {
  return {
    ...row,
    label: typeof row.label === 'string' ? row.label : `Photo ${index + 1}`,
  };
}

export function clampIntervalSec(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_SEC;
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(n)));
}

export async function listPhotos(): Promise<StoredPhoto[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as StoredPhoto[]).sort((a, b) => a.addedAt - b.addedAt);
      resolve(rows.map(normalizePhoto));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function addPhotos(files: File[]): Promise<void> {
  const existing = await listPhotos();
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  let nextIndex = existing.length;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    nextIndex += 1;
    const photo: StoredPhoto = {
      id: crypto.randomUUID(),
      mime: file.type,
      addedAt: Date.now(),
      blob: file,
      label: `Photo ${nextIndex}`,
    };
    store.put(photo);
  }
  await txDone(tx);
}

export async function renamePhoto(id: string, label: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const current = await new Promise<StoredPhoto | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as StoredPhoto | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!current) return;
  store.put({ ...current, label });
  await txDone(tx);
}

export async function removePhoto(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
}

export async function clearPhotos(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await txDone(tx);
}

export async function getSaverPrefs(): Promise<SaverPrefs> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PREFS, 'readonly');
      const req = tx.objectStore(PREFS).get('intervalSec');
      req.onsuccess = () => {
        resolve({ intervalSec: clampIntervalSec(Number(req.result ?? DEFAULT_INTERVAL_SEC)) });
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return { intervalSec: DEFAULT_INTERVAL_SEC };
  }
}

export async function setSaverIntervalSec(intervalSec: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PREFS, 'readwrite');
  tx.objectStore(PREFS).put(clampIntervalSec(intervalSec), 'intervalSec');
  await txDone(tx);
}

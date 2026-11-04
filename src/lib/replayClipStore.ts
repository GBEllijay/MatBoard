/**
 * Video replay analysis clips on this device. The lesson plan keeps only a
 * reference (`ReplayClipRef.localId`); the bytes live here in IndexedDB so a
 * long sparring or tournament clip never goes into localStorage. A saved copy
 * can also go to Advantage Cloud, Google Drive, or OneDrive (replaySave.ts).
 */

const DB_NAME = 'matboard-replay-clips';
const STORE = 'clips';
const DB_VERSION = 1;

export type ReplayClipRecord = {
  id: string;
  name: string;
  mime: string;
  blob: Blob;
  addedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser cannot keep video on the device.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = work(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result as T);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? req.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error('Saving the clip was cancelled.'));
        };
      }),
  );
}

export function newReplayClipId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `rclip-${Date.now().toString(36)}-${rand}`;
}

export async function putReplayClip(record: ReplayClipRecord): Promise<void> {
  await run<IDBValidKey>('readwrite', (store) => store.put(record));
}

export async function readReplayClip(id: string): Promise<ReplayClipRecord | null> {
  if (!id) return null;
  const found = await run<ReplayClipRecord | undefined>('readonly', (store) => store.get(id));
  return found ?? null;
}

export async function deleteReplayClip(id: string): Promise<void> {
  if (!id) return;
  await run<undefined>('readwrite', (store) => store.delete(id));
}

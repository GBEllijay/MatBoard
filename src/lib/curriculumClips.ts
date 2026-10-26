/**
 * Older Competition Class clips saved before those videos moved into the
 * Daily Training Videos library. Nothing new is written here. A read can
 * still find a clip that was saved in this browser so it can be copied over.
 */

const DB_NAME = 'matboard-curriculum-media';
const STORE = 'clips';
const DB_VERSION = 1;

type CurriculumClip = {
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

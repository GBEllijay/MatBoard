const DB_NAME = 'matboard';
const STORE = 'photos';
const PREFS = 'prefs';
const DB_VERSION = 3;

export const MIN_INTERVAL_SEC = 1;
export const MAX_INTERVAL_SEC = 300;
export const DEFAULT_INTERVAL_SEC = 10;
export const INTERVAL_PRESETS_SEC = [5, 10, 30, 60] as const;

export const FOLDER_IDS = ['gallery', 'videos', 'shop', 'events'] as const;
export type FolderId = (typeof FOLDER_IDS)[number];

export const FOLDERS: readonly {
  id: FolderId;
  label: string;
  ready: boolean;
  comingSoon: string;
}[] = [
  { id: 'gallery', label: 'Gallery', ready: true, comingSoon: '' },
  {
    id: 'videos',
    label: 'Videos',
    ready: false,
    comingSoon: 'Coming soon. Gym videos will live in this folder.',
  },
  {
    id: 'shop',
    label: 'Pro Shop',
    ready: false,
    comingSoon: 'Coming soon. Pro Shop flyers and QR codes will live in this folder.',
  },
  {
    id: 'events',
    label: 'Events',
    ready: false,
    comingSoon: 'Coming soon. Tournament flyers and QR codes will live in this folder.',
  },
];

export const DEFAULT_FOLDER_PLAY: Record<FolderId, boolean> = {
  gallery: true,
  videos: true,
  shop: true,
  events: true,
};

export type StoredPhoto = {
  id: string;
  mime: string;
  addedAt: number;
  blob: Blob;
  label: string;
  folderId: FolderId;
};

export type SaverPrefs = {
  intervalSec: number;
  folderPlay: Record<FolderId, boolean>;
};

type PhotoRow = Omit<StoredPhoto, 'folderId'> & { folderId?: FolderId | string };

export function isFolderId(value: unknown): value is FolderId {
  return typeof value === 'string' && (FOLDER_IDS as readonly string[]).includes(value);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PREFS)) {
        db.createObjectStore(PREFS);
      }
      if (!tx) return;
      const store = tx.objectStore(STORE);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const row = cursor.value as PhotoRow;
        if (!isFolderId(row.folderId)) {
          cursor.update({ ...row, folderId: 'gallery' });
        }
        cursor.continue();
      };
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

function normalizePhoto(row: PhotoRow, index: number): StoredPhoto {
  return {
    ...row,
    label: typeof row.label === 'string' ? row.label : `Photo ${index + 1}`,
    folderId: isFolderId(row.folderId) ? row.folderId : 'gallery',
  };
}

function normalizeFolderPlay(raw: unknown): Record<FolderId, boolean> {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    gallery: obj.gallery !== false,
    videos: obj.videos !== false,
    shop: obj.shop !== false,
    events: obj.events !== false,
  };
}

export function clampIntervalSec(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_SEC;
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(n)));
}

/** Enabled folders play in Gallery → Videos → Pro Shop → Events order, upload order inside each. */
export function playablePhotos(
  photos: StoredPhoto[],
  folderPlay: Record<FolderId, boolean>,
): StoredPhoto[] {
  return FOLDER_IDS.flatMap((id) =>
    folderPlay[id] ? photos.filter((photo) => photo.folderId === id) : [],
  );
}

export async function listPhotos(folderId?: FolderId): Promise<StoredPhoto[]> {
  const db = await openDb();
  const raw = await new Promise<PhotoRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      resolve((req.result as PhotoRow[]).sort((a, b) => a.addedAt - b.addedAt));
    };
    req.onerror = () => reject(req.error);
  });
  if (raw.some((row) => !isFolderId(row.folderId))) {
    void persistLegacyGallery();
  }
  const rows = raw.map(normalizePhoto);
  return folderId ? rows.filter((photo) => photo.folderId === folderId) : rows;
}

async function persistLegacyGallery(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const req = store.getAll();
  req.onsuccess = () => {
    for (const row of req.result as PhotoRow[]) {
      if (!isFolderId(row.folderId)) {
        store.put(normalizePhoto(row, 0));
      }
    }
  };
  await txDone(tx);
}

export async function addPhotos(files: File[], folderId: FolderId = 'gallery'): Promise<void> {
  const existing = await listPhotos(folderId);
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
      folderId,
    };
    store.put(photo);
  }
  await txDone(tx);
}

export async function renamePhoto(id: string, label: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const current = await new Promise<PhotoRow | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as PhotoRow | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!current) return;
  store.put({ ...normalizePhoto(current, 0), label });
  await txDone(tx);
}

export async function removePhoto(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
}

export async function clearFolder(folderId: FolderId): Promise<void> {
  const rows = await listPhotos(folderId);
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const row of rows) store.delete(row.id);
  await txDone(tx);
}

export async function clearPhotos(): Promise<void> {
  await clearFolder('gallery');
}

export async function getSaverPrefs(): Promise<SaverPrefs> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PREFS, 'readonly');
      const store = tx.objectStore(PREFS);
      const intervalReq = store.get('intervalSec');
      const playReq = store.get('folderPlay');
      tx.oncomplete = () => {
        resolve({
          intervalSec: clampIntervalSec(Number(intervalReq.result ?? DEFAULT_INTERVAL_SEC)),
          folderPlay: normalizeFolderPlay(playReq.result),
        });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return { intervalSec: DEFAULT_INTERVAL_SEC, folderPlay: { ...DEFAULT_FOLDER_PLAY } };
  }
}

export async function setSaverIntervalSec(intervalSec: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PREFS, 'readwrite');
  tx.objectStore(PREFS).put(clampIntervalSec(intervalSec), 'intervalSec');
  await txDone(tx);
}

export async function setFolderPlay(folderId: FolderId, enabled: boolean): Promise<void> {
  const prefs = await getSaverPrefs();
  const db = await openDb();
  const tx = db.transaction(PREFS, 'readwrite');
  tx.objectStore(PREFS).put({ ...prefs.folderPlay, [folderId]: enabled }, 'folderPlay');
  await txDone(tx);
}

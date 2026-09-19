const DB_NAME = 'matboard';
const STORE = 'photos';
const PREFS = 'prefs';
const DB_VERSION = 3;

export const MIN_INTERVAL_SEC = 1;
export const MAX_INTERVAL_SEC = 300;
export const DEFAULT_INTERVAL_SEC = 10;
export const INTERVAL_PRESETS_SEC = [5, 10, 30, 60] as const;

export const FOLDERS = [
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
] as const;

export type FolderId = (typeof FOLDERS)[number]['id'];
export const FOLDER_IDS: readonly FolderId[] = FOLDERS.map((folder) => folder.id);

function folderFlagRecord(value: boolean | ((id: FolderId) => boolean)): Record<FolderId, boolean> {
  return Object.fromEntries(
    FOLDERS.map((folder) => [folder.id, typeof value === 'function' ? value(folder.id) : value]),
  ) as Record<FolderId, boolean>;
}

export const DEFAULT_FOLDER_PLAY = folderFlagRecord(true);

export function folderExpandedState(openId: FolderId | null): Record<FolderId, boolean> {
  return folderFlagRecord((id) => id === openId);
}

export type StoredPhoto = {
  id: string;
  mime: string;
  addedAt: number;
  blob: Blob;
  label: string;
  folderId: FolderId;
  /** List position within the folder. Legacy rows fall back to addedAt. */
  sortOrder: number;
};

export const DEFAULT_SHUFFLE = false;

export type SaverPrefs = {
  intervalSec: number;
  folderPlay: Record<FolderId, boolean>;
  shuffle: boolean;
};

type PhotoRow = Omit<StoredPhoto, 'folderId' | 'sortOrder'> & {
  folderId?: FolderId | string;
  sortOrder?: number;
};

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

function photoSortOrder(row: PhotoRow): number {
  return typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder)
    ? row.sortOrder
    : row.addedAt;
}

function normalizePhoto(row: PhotoRow, index: number): StoredPhoto {
  return {
    ...row,
    label: typeof row.label === 'string' ? row.label : `Photo ${index + 1}`,
    folderId: isFolderId(row.folderId) ? row.folderId : 'gallery',
    sortOrder: photoSortOrder(row),
  };
}

export function comparePhotos(a: StoredPhoto, b: StoredPhoto): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.addedAt !== b.addedAt) return a.addedAt - b.addedAt;
  return a.id.localeCompare(b.id);
}

export function movePhotoIds(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) {
    return ids;
  }
  const next = ids.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function withFolderOrder(
  photos: StoredPhoto[],
  folderId: FolderId,
  orderedIds: string[],
): StoredPhoto[] {
  const inFolder = photos.filter((photo) => photo.folderId === folderId);
  const byId = new Map(inFolder.map((photo) => [photo.id, photo]));
  const used = new Set<string>();
  const nextFolder: StoredPhoto[] = [];
  const push = (id: string) => {
    const photo = byId.get(id);
    if (!photo || used.has(id)) return;
    used.add(id);
    nextFolder.push({ ...photo, sortOrder: nextFolder.length });
  };
  for (const id of orderedIds) push(id);
  for (const photo of inFolder) push(photo.id);
  return FOLDER_IDS.flatMap((id) =>
    id === folderId ? nextFolder : photos.filter((photo) => photo.folderId === id).sort(comparePhotos),
  );
}

function normalizeFolderPlay(raw: unknown): Record<FolderId, boolean> {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return folderFlagRecord((id) => obj[id] !== false);
}

function normalizeShuffle(raw: unknown): boolean {
  return raw === true;
}

export function clampIntervalSec(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_SEC;
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(n)));
}

/** Enabled folders play in FOLDERS order, list order (sortOrder) inside each. */
export function playablePhotos(
  photos: StoredPhoto[],
  folderPlay: Record<FolderId, boolean>,
): StoredPhoto[] {
  return FOLDER_IDS.flatMap((id) =>
    folderPlay[id] ? photos.filter((photo) => photo.folderId === id).sort(comparePhotos) : [],
  );
}

export async function listPhotos(folderId?: FolderId): Promise<StoredPhoto[]> {
  const db = await openDb();
  const raw = await new Promise<PhotoRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as PhotoRow[]);
    req.onerror = () => reject(req.error);
  });
  if (raw.some((row) => !isFolderId(row.folderId))) {
    void persistLegacyGallery();
  }
  const rows = raw.map((row, index) => normalizePhoto(row, index)).sort(comparePhotos);
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
  let nextOrder = existing.reduce((max, photo) => Math.max(max, photo.sortOrder), -1);
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    nextIndex += 1;
    nextOrder += 1;
    const photo: StoredPhoto = {
      id: crypto.randomUUID(),
      mime: file.type,
      addedAt: Date.now(),
      blob: file,
      label: `Photo ${nextIndex}`,
      folderId,
      sortOrder: nextOrder,
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

export async function reorderPhotos(folderId: FolderId, orderedIds: string[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const rows = await new Promise<PhotoRow[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as PhotoRow[]);
    req.onerror = () => reject(req.error);
  });
  const inFolder = rows.filter((row) => normalizePhoto(row, 0).folderId === folderId);
  const byId = new Map(inFolder.map((row) => [row.id, row]));
  const used = new Set<string>();
  let index = 0;
  const putOrdered = (id: string) => {
    const row = byId.get(id);
    if (!row || used.has(id)) return;
    used.add(id);
    store.put({ ...normalizePhoto(row, index), sortOrder: index });
    index += 1;
  };
  for (const id of orderedIds) putOrdered(id);
  for (const row of inFolder) putOrdered(row.id);
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
      const shuffleReq = store.get('shuffle');
      tx.oncomplete = () => {
        resolve({
          intervalSec: clampIntervalSec(Number(intervalReq.result ?? DEFAULT_INTERVAL_SEC)),
          folderPlay: normalizeFolderPlay(playReq.result),
          shuffle: normalizeShuffle(shuffleReq.result),
        });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return {
      intervalSec: DEFAULT_INTERVAL_SEC,
      folderPlay: { ...DEFAULT_FOLDER_PLAY },
      shuffle: DEFAULT_SHUFFLE,
    };
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

export async function setSaverShuffle(shuffle: boolean): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PREFS, 'readwrite');
  tx.objectStore(PREFS).put(shuffle, 'shuffle');
  await txDone(tx);
}

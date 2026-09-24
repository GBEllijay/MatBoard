import { PHOTO_PICKER_ACCEPT, VIDEO_PICKER_ACCEPT } from './mediaPicker.ts';
import {
  buildPlayQueue,
  comparePlaylistItems,
  moveItemIds,
  withFolderOrder as applyFolderOrder,
  type PlaylistItem,
} from './playlist.ts';
import {
  buyLinkForQr,
  normalizeBuyUrl,
  normalizeShopCastMode,
  normalizeStartsSlide,
  shopSlotsLeft,
  type ShopCastMode,
} from './shopSlides.ts';

const DB_NAME = 'matboard';
const STORE = 'photos';
const PREFS = 'prefs';
const DB_VERSION = 3;

export const MIN_INTERVAL_SEC = 1;
export const MAX_INTERVAL_SEC = 300;
export const DEFAULT_INTERVAL_SEC = 10;
export const INTERVAL_PRESETS_SEC = [5, 10, 30, 60] as const;

/**
 * Phone/PC picker token. Library uses `video/*` with no capture. Record uses
 * a separate input with `accept="video/*"` and `capture="environment"` so
 * Android Chrome opens the camera instead of Google Photos. Gallery photos use
 * `image/*` the same way: Take photo has capture, Pick from gallery does not.
 * Extra extensions (`.mp4,.mov,…`) force a documents picker on some phones.
 * Gym-TV types are still accepted after pick — see VIDEO_EXTENSIONS /
 * isAcceptedVideoFile. Media stays on this device.
 */
export const VIDEO_ACCEPT = VIDEO_PICKER_ACCEPT;
const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.webm', '.mov', '.ogg', '.ogv'] as const;

export const FOLDERS = [
  {
    id: 'gallery',
    label: 'Gallery',
    ready: true,
    comingSoon: '',
    itemNoun: 'item',
    itemNounPlural: 'items',
    addLabel: 'Add photos',
    videoAddLabel: 'Add videos',
    accept: PHOTO_PICKER_ACCEPT,
    mimePrefix: 'image/',
    labelPrefix: 'Photo',
    emptyCopy:
      'No media yet. Add photos opens Take photo or Pick from gallery. Add videos opens Record or Pick from gallery. Photos and clips stay on this device, nothing is uploaded. Tap the left preview to include or skip an item. Hold the grip, then drag — or tap Up / Down.',
    orderHint:
      'Tap the left preview to play or skip that photo or video. Checked / bright = On. Top item plays first when In order is on. Hold the grip, then drag — or tap Up / Down. Videos play all the way through; photos use the slide interval. Clips are muted by default so gym music can keep playing.',
  },
  {
    id: 'shop',
    label: 'Pro Shop',
    ready: true,
    comingSoon: '',
    itemNoun: 'card',
    itemNounPlural: 'cards',
    addLabel: 'Add cards',
    videoAddLabel: '',
    accept: 'image/*',
    mimePrefix: 'image/',
    labelPrefix: 'Card',
    emptyCopy:
      'No Pro Shop cards yet. Add a product photo, name it, and paste a buy link. The TV makes a QR for each card on a slide. This device keeps 40 cards.',
    orderHint:
      'Top card shows first when In order is on. Hold the grip, then drag — or tap Up / Down. Same slide puts the next card on that TV page. Each card still gets its own QR. This device keeps 40 cards.',
  },
  {
    id: 'events',
    label: 'Events',
    ready: false,
    comingSoon: 'Coming soon. Event flyers will use this same list: name, thumbnail, Up / Down, and drag.',
    itemNoun: 'flyer',
    itemNounPlural: 'flyers',
    addLabel: 'Add flyers',
    videoAddLabel: '',
    accept: 'image/*',
    mimePrefix: 'image/',
    labelPrefix: 'Flyer',
    emptyCopy:
      'No event flyers yet. Tournament flyers will reorder with the same Up / Down and drag controls as Gallery.',
    orderHint: 'Top flyer shows first when In order is on. Hold the grip, then drag — or tap Up / Down.',
  },
] as const;

export type FolderId = (typeof FOLDERS)[number]['id'];
export type FolderConfig = (typeof FOLDERS)[number];
export const FOLDER_IDS: readonly FolderId[] = FOLDERS.map((folder) => folder.id);

/** Old Console Videos folder. Rows are copied into Gallery once, after existing Gallery items. */
export const LEGACY_VIDEOS_FOLDER = 'videos';

export function folderById(id: FolderId): FolderConfig {
  return FOLDERS.find((folder) => folder.id === id) ?? FOLDERS[0];
}

function folderFlagRecord(value: boolean | ((id: FolderId) => boolean)): Record<FolderId, boolean> {
  return Object.fromEntries(
    FOLDERS.map((folder) => [folder.id, typeof value === 'function' ? value(folder.id) : value]),
  ) as Record<FolderId, boolean>;
}

export const DEFAULT_FOLDER_PLAY = folderFlagRecord(true);

export function folderExpandedState(openId: FolderId | null): Record<FolderId, boolean> {
  return folderFlagRecord((id) => id === openId);
}

export type StoredPhoto = PlaylistItem & {
  mime: string;
  blob: Blob;
  folderId: FolderId;
  /** Pro Shop buy link. Empty on Gallery and Events. */
  buyUrl: string;
  /** False puts this Pro Shop card on the previous card’s TV page. */
  startsSlide: boolean;
};

export const DEFAULT_SHUFFLE = false;
/** Clips start silent so gym-floor music in another tab can keep playing. */
export const DEFAULT_MUTE_VIDEO = true;

export type SaverPrefs = {
  intervalSec: number;
  folderPlay: Record<FolderId, boolean>;
  shuffle: boolean;
  muteVideo: boolean;
  shopCastMode: ShopCastMode;
};

export type PhotoRow = Omit<StoredPhoto, 'folderId' | 'sortOrder' | 'playEnabled' | 'buyUrl' | 'startsSlide'> & {
  folderId?: FolderId | string;
  sortOrder?: number;
  playEnabled?: boolean;
  buyUrl?: string;
  startsSlide?: boolean;
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
  const legacyVideo = row.folderId === LEGACY_VIDEOS_FOLDER;
  return {
    ...row,
    label: typeof row.label === 'string' ? row.label : `Photo ${index + 1}`,
    folderId: isFolderId(row.folderId) && !legacyVideo ? row.folderId : 'gallery',
    sortOrder: photoSortOrder(row),
    playEnabled: row.playEnabled !== false,
    buyUrl: normalizeBuyUrl(row.buyUrl),
    startsSlide: normalizeStartsSlide(row.startsSlide),
  };
}

/**
 * Move the retired Videos folder into Gallery, appended after the current Gallery
 * list so the old Gallery-then-Videos play order stays. Unknown folder ids also
 * land in Gallery. Safe to run more than once.
 */
export function migrateLegacyVideoFolder(rows: PhotoRow[]): { rows: PhotoRow[]; changed: PhotoRow[] } {
  const legacy = rows.filter((row) => row.folderId === LEGACY_VIDEOS_FOLDER);
  const unknown = rows.filter(
    (row) => row.folderId !== LEGACY_VIDEOS_FOLDER && !isFolderId(row.folderId),
  );
  if (!legacy.length && !unknown.length) return { rows, changed: [] };

  let nextOrder = rows
    .filter((row) => row.folderId === 'gallery')
    .reduce((max, row) => Math.max(max, photoSortOrder(row)), -1);
  const patch = new Map<string, PhotoRow>();
  const orderedLegacy = [...legacy].sort((a, b) => {
    const order = photoSortOrder(a) - photoSortOrder(b);
    if (order !== 0) return order;
    return String(a.id).localeCompare(String(b.id));
  });
  for (const row of orderedLegacy) {
    nextOrder += 1;
    patch.set(row.id, { ...row, folderId: 'gallery', sortOrder: nextOrder });
  }
  for (const row of unknown) {
    patch.set(row.id, { ...row, folderId: 'gallery' });
  }
  return {
    rows: rows.map((row) => patch.get(row.id) ?? row),
    changed: [...patch.values()],
  };
}

export const comparePhotos = comparePlaylistItems;
export const movePhotoIds = moveItemIds;

export function withFolderOrder(
  photos: StoredPhoto[],
  folderId: FolderId,
  orderedIds: string[],
): StoredPhoto[] {
  return applyFolderOrder(photos, folderId, orderedIds, FOLDER_IDS);
}

export function isImageItem(item: StoredPhoto): boolean {
  return item.mime.startsWith('image/');
}

export function isVideoItem(item: StoredPhoto): boolean {
  return item.mime.startsWith('video/');
}

export function isPlayableItem(item: StoredPhoto): boolean {
  return isImageItem(item) || isVideoItem(item);
}

export function mediaKind(item: StoredPhoto): 'image' | 'video' | null {
  if (isImageItem(item)) return 'image';
  if (isVideoItem(item)) return 'video';
  return null;
}

function fileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

export function isAcceptedVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) return true;
  return (VIDEO_EXTENSIONS as readonly string[]).includes(fileExtension(file.name));
}

export function fileMatchesFolder(file: File, folder: { id: string; mimePrefix: string }): boolean {
  if (folder.id === 'gallery' && isAcceptedVideoFile(file)) return true;
  if (file.type && file.type.startsWith(folder.mimePrefix)) return true;
  if (folder.mimePrefix === 'video/') return isAcceptedVideoFile(file);
  return false;
}

export function mimeFromFile(file: File, folder: { mimePrefix: string }): string {
  if (file.type) return file.type;
  const ext = fileExtension(file.name);
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.ogg' || ext === '.ogv') return 'video/ogg';
  return folder.mimePrefix === 'video/' ? 'video/mp4' : 'image/jpeg';
}

function normalizeFolderPlay(raw: unknown): Record<FolderId, boolean> {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return folderFlagRecord((id) => obj[id] !== false);
}

function normalizeShuffle(raw: unknown): boolean {
  return raw === true;
}

/** Missing key means muted (default). Only an explicit false plays clip audio. */
export function normalizeMuteVideo(raw: unknown): boolean {
  return raw !== false;
}

export function clampIntervalSec(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_SEC;
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(n)));
}

/**
 * Enabled folders play in FOLDERS order (Gallery, then Pro Shop, then Events),
 * list order (sortOrder) inside each. Gallery holds photos and videos. Items
 * with Play Off stay in the folder list but skip the TV queue.
 */
export function playableItems(
  items: StoredPhoto[],
  folderPlay: Record<FolderId, boolean>,
  storyIds?: readonly string[] | null,
): StoredPhoto[] {
  return buildPlayQueue(items, {
    folderIds: FOLDER_IDS,
    folderEnabled: folderPlay,
    isPlayable: isPlayableItem,
    storyIds,
  });
}

export const playablePhotos = playableItems;

export async function listPhotos(folderId?: FolderId): Promise<StoredPhoto[]> {
  const db = await openDb();
  const raw = await new Promise<PhotoRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as PhotoRow[]);
    req.onerror = () => reject(req.error);
  });
  const migrated = migrateLegacyVideoFolder(raw);
  if (migrated.changed.length) {
    await persistMediaRows(migrated.changed);
  }
  const rows = migrated.rows.map((row, index) => normalizePhoto(row, index)).sort(comparePhotos);
  return folderId ? rows.filter((photo) => photo.folderId === folderId) : rows;
}

async function persistMediaRows(rows: PhotoRow[]): Promise<void> {
  if (!rows.length) return;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const [index, row] of rows.entries()) {
    store.put(normalizePhoto(row, index));
  }
  await txDone(tx);
}

export async function addFolderFiles(files: File[], folderId: FolderId): Promise<number> {
  const folder = folderById(folderId);
  const existing = await listPhotos(folderId);
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  let photoCount = existing.filter((photo) => !isVideoItem(photo)).length;
  let videoCount = existing.filter((photo) => isVideoItem(photo)).length;
  let nextOrder = existing.reduce((max, photo) => Math.max(max, photo.sortOrder), -1);
  let added = 0;
  let room = folderId === 'shop' ? shopSlotsLeft(existing.length) : Number.POSITIVE_INFINITY;
  for (const file of files) {
    if (!fileMatchesFolder(file, folder)) continue;
    if (room <= 0) break;
    room -= 1;
    nextOrder += 1;
    added += 1;
    const video = folder.id === 'gallery' && isAcceptedVideoFile(file);
    if (video) videoCount += 1;
    else photoCount += 1;
    const photo: StoredPhoto = {
      id: crypto.randomUUID(),
      mime: mimeFromFile(file, folder),
      addedAt: Date.now(),
      blob: file,
      label: `${video ? 'Video' : folder.labelPrefix} ${video ? videoCount : photoCount}`,
      folderId,
      sortOrder: nextOrder,
      playEnabled: true,
      buyUrl: '',
      startsSlide: true,
    };
    store.put(photo);
  }
  await txDone(tx);
  return added;
}

export async function addPhotos(files: File[], folderId: FolderId = 'gallery'): Promise<void> {
  await addFolderFiles(files, folderId);
}

export async function setItemPlay(id: string, enabled: boolean): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const current = await new Promise<PhotoRow | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as PhotoRow | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!current) return;
  store.put({ ...normalizePhoto(current, 0), playEnabled: enabled });
  await txDone(tx);
}

export async function setItemBuyUrl(id: string, buyUrl: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const current = await new Promise<PhotoRow | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as PhotoRow | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!current) return;
  store.put({ ...normalizePhoto(current, 0), buyUrl: buyLinkForQr(buyUrl) });
  await txDone(tx);
}

export async function setItemStartsSlide(id: string, startsSlide: boolean): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const current = await new Promise<PhotoRow | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as PhotoRow | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!current) return;
  store.put({ ...normalizePhoto(current, 0), startsSlide: Boolean(startsSlide) });
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

export async function reorderFolderItems(folderId: FolderId, orderedIds: string[]): Promise<void> {
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

export async function reorderPhotos(folderId: FolderId, orderedIds: string[]): Promise<void> {
  await reorderFolderItems(folderId, orderedIds);
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
      const muteVideoReq = store.get('muteVideo');
      const shopCastReq = store.get('shopCastMode');
      tx.oncomplete = () => {
        resolve({
          intervalSec: clampIntervalSec(Number(intervalReq.result ?? DEFAULT_INTERVAL_SEC)),
          folderPlay: normalizeFolderPlay(playReq.result),
          shuffle: normalizeShuffle(shuffleReq.result),
          muteVideo: normalizeMuteVideo(muteVideoReq.result),
          shopCastMode: normalizeShopCastMode(shopCastReq.result),
        });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return {
      intervalSec: DEFAULT_INTERVAL_SEC,
      folderPlay: { ...DEFAULT_FOLDER_PLAY },
      shuffle: DEFAULT_SHUFFLE,
      muteVideo: DEFAULT_MUTE_VIDEO,
      shopCastMode: normalizeShopCastMode(undefined),
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

export async function setSaverMuteVideo(muteVideo: boolean): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PREFS, 'readwrite');
  tx.objectStore(PREFS).put(Boolean(muteVideo), 'muteVideo');
  await txDone(tx);
}

export async function setShopCastMode(mode: ShopCastMode): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PREFS, 'readwrite');
  tx.objectStore(PREFS).put(normalizeShopCastMode(mode), 'shopCastMode');
  await txDone(tx);
}

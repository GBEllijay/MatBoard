import {
  clampDrillSec,
  clipSlotsLeft,
  DEFAULT_DRILL_SEC,
  pickAddableVideos,
  resolveSelectedId,
} from './techniqueLogic';
import {
  comparePlaylistItems,
  withFolderOrder as applyFolderOrder,
  type PlaylistItem,
} from './playlist';
import { mimeFromFile, VIDEO_ACCEPT } from './photoStore';

export {
  clipSlotsLeft,
  DEFAULT_DRILL_SEC,
  MAX_TECHNIQUE_CLIPS,
  pickAddableVideos,
  resolveSelectedId,
} from './techniqueLogic';

const DB_NAME = 'matboard-techniques';
const CLIPS = 'clips';
const PREFS = 'prefs';
const DB_VERSION = 1;

export const TECHNIQUE_FOLDER_ID = 'techniques';

export const TECHNIQUE_FOLDER = {
  id: TECHNIQUE_FOLDER_ID,
  label: 'Daily Training Videos',
  ready: true,
  comingSoon: '',
  itemNoun: 'clip',
  itemNounPlural: 'clips',
  addLabel: 'Add clips',
  accept: VIDEO_ACCEPT,
  mimePrefix: 'video/',
  labelPrefix: 'Clip',
  emptyCopy: 'No clips yet. Film a technique or pick a clip — up to 10 on this device.',
  orderHint: 'Tap Play to select a clip. Hold the grip, then drag — or tap Up / Down.',
} as const;

export type TechniqueClip = PlaylistItem & {
  mime: string;
  blob: Blob;
  folderId: typeof TECHNIQUE_FOLDER_ID;
};

type ClipRow = Omit<TechniqueClip, 'folderId' | 'sortOrder'> & {
  folderId?: string;
  sortOrder?: number;
};

export type TechniquePrefs = {
  selectedId: string | null;
  drillSec: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CLIPS)) {
        db.createObjectStore(CLIPS, { keyPath: 'id' });
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

function clipSortOrder(row: ClipRow): number {
  return typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder)
    ? row.sortOrder
    : row.addedAt;
}

function normalizeClip(row: ClipRow, index: number): TechniqueClip {
  return {
    ...row,
    label: typeof row.label === 'string' ? row.label : `${TECHNIQUE_FOLDER.labelPrefix} ${index + 1}`,
    folderId: TECHNIQUE_FOLDER_ID,
    sortOrder: clipSortOrder(row),
  };
}

export function withTechniqueOrder(clips: TechniqueClip[], orderedIds: string[]): TechniqueClip[] {
  return applyFolderOrder(clips, TECHNIQUE_FOLDER_ID, orderedIds, [TECHNIQUE_FOLDER_ID]);
}

export async function listTechniqueClips(): Promise<TechniqueClip[]> {
  const db = await openDb();
  const raw = await new Promise<ClipRow[]>((resolve, reject) => {
    const tx = db.transaction(CLIPS, 'readonly');
    const req = tx.objectStore(CLIPS).getAll();
    req.onsuccess = () => resolve(req.result as ClipRow[]);
    req.onerror = () => reject(req.error);
  });
  return raw.map((row, index) => normalizeClip(row, index)).sort(comparePlaylistItems);
}

export async function addTechniqueFiles(files: File[]): Promise<{ added: number; atCap: boolean }> {
  const existing = await listTechniqueClips();
  const picked = pickAddableVideos(files, clipSlotsLeft(existing.length));
  if (!picked.length) {
    return { added: 0, atCap: clipSlotsLeft(existing.length) === 0 };
  }
  const db = await openDb();
  const tx = db.transaction(CLIPS, 'readwrite');
  const store = tx.objectStore(CLIPS);
  let nextIndex = existing.length;
  let nextOrder = existing.reduce((max, clip) => Math.max(max, clip.sortOrder), -1);
  for (const file of picked) {
    nextIndex += 1;
    nextOrder += 1;
    const clip: TechniqueClip = {
      id: crypto.randomUUID(),
      mime: mimeFromFile(file, TECHNIQUE_FOLDER),
      addedAt: Date.now(),
      blob: file,
      label: `${TECHNIQUE_FOLDER.labelPrefix} ${nextIndex}`,
      folderId: TECHNIQUE_FOLDER_ID,
      sortOrder: nextOrder,
    };
    store.put(clip);
  }
  await txDone(tx);
  const after = existing.length + picked.length;
  return { added: picked.length, atCap: clipSlotsLeft(after) === 0 };
}

export async function renameTechniqueClip(id: string, label: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CLIPS, 'readwrite');
  const store = tx.objectStore(CLIPS);
  const current = await new Promise<ClipRow | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as ClipRow | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!current) return;
  store.put({ ...normalizeClip(current, 0), label });
  await txDone(tx);
}

export async function removeTechniqueClip(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CLIPS, 'readwrite');
  tx.objectStore(CLIPS).delete(id);
  await txDone(tx);
  const prefs = await getTechniquePrefs();
  if (prefs.selectedId === id) {
    const remaining = await listTechniqueClips();
    await setTechniqueSelectedId(resolveSelectedId(null, remaining.map((clip) => clip.id)));
  }
}

export async function reorderTechniqueClips(orderedIds: string[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CLIPS, 'readwrite');
  const store = tx.objectStore(CLIPS);
  const rows = await new Promise<ClipRow[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as ClipRow[]);
    req.onerror = () => reject(req.error);
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const used = new Set<string>();
  let index = 0;
  const putOrdered = (id: string) => {
    const row = byId.get(id);
    if (!row || used.has(id)) return;
    used.add(id);
    store.put({ ...normalizeClip(row, index), sortOrder: index });
    index += 1;
  };
  for (const id of orderedIds) putOrdered(id);
  for (const row of rows) putOrdered(row.id);
  await txDone(tx);
}

export async function clearTechniqueClips(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([CLIPS, PREFS], 'readwrite');
  tx.objectStore(CLIPS).clear();
  tx.objectStore(PREFS).put(null, 'selectedId');
  await txDone(tx);
}

export async function getTechniquePrefs(): Promise<TechniquePrefs> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PREFS, 'readonly');
      const selectedReq = tx.objectStore(PREFS).get('selectedId');
      const drillReq = tx.objectStore(PREFS).get('drillSec');
      tx.oncomplete = () => {
        resolve({
          selectedId: typeof selectedReq.result === 'string' ? selectedReq.result : null,
          drillSec: clampDrillSec(Number(drillReq.result ?? DEFAULT_DRILL_SEC)),
        });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return { selectedId: null, drillSec: DEFAULT_DRILL_SEC };
  }
}

export async function setTechniqueSelectedId(selectedId: string | null): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PREFS, 'readwrite');
  tx.objectStore(PREFS).put(selectedId, 'selectedId');
  await txDone(tx);
}

export async function setTechniqueDrillSec(drillSec: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PREFS, 'readwrite');
  tx.objectStore(PREFS).put(clampDrillSec(drillSec), 'drillSec');
  await txDone(tx);
}

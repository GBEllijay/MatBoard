import {
  assignOrphanClips,
  canAssignClip,
  clampDrillSec,
  clampDriveFileId,
  DEFAULT_DRILL_SEC,
  pickAddableVideos,
  planFromFlatClips,
  sanitizeVideoPlan,
  selectSlot,
  setSlotClip,
  slotTitle,
  techniqueIndex,
  type VideoPlan,
} from './techniqueLogic';
import { comparePlaylistItems, type PlaylistItem } from './playlist';
import { mimeFromFile, VIDEO_ACCEPT } from './photoStore';
import { assertOriginRoom, isStorageQuotaError, StorageQuotaError } from './storageQuota.ts';
import { readCurriculumClip } from './curriculumClips.ts';
import { curriculumReferencedClipIds, loadCurriculumArchive } from './competitionCurriculum.ts';

export {
  canAssignClip,
  clipCount,
  DEFAULT_DRILL_SEC,
  pickAddableVideos,
  resolveSelectedId,
} from './techniqueLogic';

const DB_NAME = 'matboard-techniques';
const CLIPS = 'clips';
const PREFS = 'prefs';
const DB_VERSION = 1;
const PLAN_KEY = 'plan';

export const TECHNIQUE_FOLDER_ID = 'techniques';

export const TECHNIQUE_FOLDER = {
  id: TECHNIQUE_FOLDER_ID,
  label: 'Daily Training Videos',
  ready: true,
  comingSoon: '',
  itemNoun: 'clip',
  itemNounPlural: 'clips',
  addLabel: 'Add video',
  accept: VIDEO_ACCEPT,
  mimePrefix: 'video/',
  labelPrefix: 'Clip',
  emptyCopy:
    'Add video opens Record or Pick from gallery — one clip per card. Clips stay on this device until Google Drive is connected.',
  orderHint: 'Tap a card to select it. Start loops that clip.',
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

export type SlotWriteStatus = 'added' | 'replaced' | 'removed' | 'invalid' | 'missing' | 'empty';

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
  return typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder) ? row.sortOrder : row.addedAt;
}

function normalizeClip(row: ClipRow, index: number): TechniqueClip {
  return {
    ...row,
    label: typeof row.label === 'string' ? row.label : `${TECHNIQUE_FOLDER.labelPrefix} ${index + 1}`,
    folderId: TECHNIQUE_FOLDER_ID,
    sortOrder: clipSortOrder(row),
  };
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

async function readPrefs(): Promise<{ plan: unknown; selectedId: unknown; drillSec: unknown }> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PREFS, 'readonly');
      const store = tx.objectStore(PREFS);
      const planReq = store.get(PLAN_KEY);
      const selectedReq = store.get('selectedId');
      const drillReq = store.get('drillSec');
      tx.oncomplete = () => {
        resolve({
          plan: planReq.result,
          selectedId: selectedReq.result,
          drillSec: drillReq.result,
        });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return { plan: undefined, selectedId: undefined, drillSec: undefined };
  }
}

export async function saveTechniquePlan(plan: VideoPlan): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PREFS, 'readwrite');
  tx.objectStore(PREFS).put(plan, PLAN_KEY);
  await txDone(tx);
}

/**
 * Load clips plus the slot plan.
 * A missing plan (the old flat list) is copied onto Technique / Drill cards in list order.
 * Warm-up and Cool down start empty. The previous global drill length is copied onto each technique.
 */
export async function loadTechniqueBoard(): Promise<{ clips: TechniqueClip[]; plan: VideoPlan }> {
  const clips = await listTechniqueClips();
  const clipIds = clips.map((clip) => clip.id);
  const prefs = await readPrefs();
  const rawPlan = prefs.plan;
  const version =
    rawPlan && typeof rawPlan === 'object' && !Array.isArray(rawPlan)
      ? (rawPlan as { version?: unknown }).version
      : null;

  let plan: VideoPlan;
  let changed: boolean;
  const reserved = reservedCurriculumClipIds();
  if (version === 2) {
    const sanitized = sanitizeVideoPlan(rawPlan, clipIds);
    const placed = assignOrphanClips(sanitized.plan, clipIds, reserved);
    plan = placed.plan;
    changed = sanitized.changed || placed.changed;
  } else {
    const migrated = planFromFlatClips({
      clipIds,
      selectedClipId: typeof prefs.selectedId === 'string' ? prefs.selectedId : null,
      drillSec: clampDrillSec(Number(prefs.drillSec ?? DEFAULT_DRILL_SEC)),
    });
    const placed = assignOrphanClips(migrated, clipIds, reserved);
    plan = placed.plan;
    changed = true;
  }
  if (changed) await saveTechniquePlan(plan);
  return { clips, plan };
}

function reservedCurriculumClipIds(): Set<string> {
  try {
    return new Set(curriculumReferencedClipIds(loadCurriculumArchive()));
  } catch {
    return new Set();
  }
}

function rawPlanClipIds(plan: unknown): Set<string> {
  const slots =
    plan && typeof plan === 'object' && !Array.isArray(plan) ? (plan as { slots?: unknown }).slots : null;
  const ids = new Set<string>();
  if (!Array.isArray(slots)) return ids;
  for (const slot of slots) {
    if (!slot || typeof slot !== 'object') continue;
    const clipId = (slot as { clipId?: unknown }).clipId;
    if (typeof clipId === 'string' && clipId) ids.add(clipId);
  }
  return ids;
}

async function putClip(row: TechniqueClip): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CLIPS, 'readwrite');
  tx.objectStore(CLIPS).put(row);
  await txDone(tx);
}

export async function readTrainingClip(id: string): Promise<TechniqueClip | null> {
  if (!id) return null;
  const db = await openDb();
  const row = await new Promise<ClipRow | undefined>((resolve, reject) => {
    const tx = db.transaction(CLIPS, 'readonly');
    const req = tx.objectStore(CLIPS).get(id);
    req.onsuccess = () => resolve(req.result as ClipRow | undefined);
    req.onerror = () => reject(req.error);
  });
  return row ? normalizeClip(row, 0) : null;
}

/** Save a clip in the Daily Training library without placing it on a lesson card. */
export async function saveTrainingClip(file: File, label: string): Promise<TechniqueClip | null> {
  const [picked] = pickAddableVideos([file], 1);
  if (!picked) return null;
  const clips = await listTechniqueClips();
  const nextOrder = clips.reduce((max, clip) => Math.max(max, clip.sortOrder), -1) + 1;
  const row: TechniqueClip = {
    id: crypto.randomUUID(),
    mime: mimeFromFile(picked, TECHNIQUE_FOLDER),
    addedAt: Date.now(),
    blob: picked,
    label: label.trim().slice(0, 180) || TECHNIQUE_FOLDER.labelPrefix,
    folderId: TECHNIQUE_FOLDER_ID,
    sortOrder: nextOrder,
  };
  await assertOriginRoom(picked.size);
  try {
    await putClip(row);
  } catch (error) {
    if (error instanceof StorageQuotaError) throw error;
    if (isStorageQuotaError(error)) throw new StorageQuotaError(0);
    throw error;
  }
  return row;
}

/**
 * Find a clip in the Daily Training library. An older curriculum-only copy is
 * moved into that library so the shared window can play it.
 */
export async function readTrainingClipBlob(id: string): Promise<Blob | null> {
  const current = await readTrainingClip(id);
  if (current?.blob) return current.blob;
  const legacy = await readCurriculumClip(id);
  if (!legacy?.blob) return null;
  const clips = await listTechniqueClips();
  const nextOrder = clips.reduce((max, clip) => Math.max(max, clip.sortOrder), -1) + 1;
  await putClip({
    id: legacy.id,
    mime: legacy.mime,
    addedAt: legacy.addedAt,
    blob: legacy.blob,
    label: legacy.name,
    folderId: TECHNIQUE_FOLDER_ID,
    sortOrder: nextOrder,
  });
  return legacy.blob;
}

/** Remove a clip that is not sitting on a Daily Training card. */
export async function deleteUnusedTrainingClip(id: string): Promise<void> {
  if (!id) return;
  const prefs = await readPrefs();
  if (rawPlanClipIds(prefs.plan).has(id)) return;
  const db = await openDb();
  const tx = db.transaction(CLIPS, 'readwrite');
  tx.objectStore(CLIPS).delete(id);
  await txDone(tx);
}

function slotClipLabel(plan: VideoPlan, slotId: string): string {
  const slot = plan.slots.find((item) => item.slotId === slotId);
  if (!slot) return TECHNIQUE_FOLDER.labelPrefix;
  const index = techniqueIndex(plan, slotId);
  return slotTitle(slot, index < 0 ? 0 : index);
}

export async function attachClipToSlot(
  plan: VideoPlan,
  slotId: string,
  file: File,
): Promise<{ plan: VideoPlan; clips: TechniqueClip[]; status: SlotWriteStatus }> {
  const slot = plan.slots.find((item) => item.slotId === slotId);
  const clips = await listTechniqueClips();
  if (!slot) return { plan, clips, status: 'missing' };
  const [picked] = pickAddableVideos([file], 1);
  if (!picked) return { plan, clips, status: 'invalid' };
  if (!canAssignClip(plan, slotId)) return { plan, clips, status: 'missing' };

  const replacing = Boolean(slot.clipId);
  const clipId = crypto.randomUUID();
  const nextOrder = clips.reduce((max, clip) => Math.max(max, clip.sortOrder), -1) + 1;
  const row: TechniqueClip = {
    id: clipId,
    mime: mimeFromFile(picked, TECHNIQUE_FOLDER),
    addedAt: Date.now(),
    blob: picked,
    label: slotClipLabel(plan, slotId),
    folderId: TECHNIQUE_FOLDER_ID,
    sortOrder: nextOrder,
  };
  await assertOriginRoom(picked.size);
  try {
    const db = await openDb();
    const tx = db.transaction(CLIPS, 'readwrite');
    const store = tx.objectStore(CLIPS);
    if (slot.clipId) store.delete(slot.clipId);
    store.put(row);
    await txDone(tx);
  } catch (error) {
    if (error instanceof StorageQuotaError) throw error;
    if (isStorageQuotaError(error)) throw new StorageQuotaError(0);
    throw error;
  }

  // The blob stays in this device's clip store as the offline cache.
  // A Pro save copies the bytes into the gym Drive folder and then fills driveFileId.
  // Nothing is uploaded to an Advantage server. The blob is not deleted after upload.
  const next = selectSlot(
    setSlotClip(plan, slotId, clipId, {
      driveFileId: null,
      mediaName: picked.name || row.label,
      mediaMime: row.mime,
    }),
    slotId,
  );
  await saveTechniquePlan(next);
  return {
    plan: next,
    clips: await listTechniqueClips(),
    status: replacing ? 'replaced' : 'added',
  };
}

export async function clearSlotClip(
  plan: VideoPlan,
  slotId: string,
): Promise<{ plan: VideoPlan; clips: TechniqueClip[]; status: SlotWriteStatus }> {
  const slot = plan.slots.find((item) => item.slotId === slotId);
  if (!slot) {
    const clips = await listTechniqueClips();
    return { plan, clips, status: 'missing' };
  }
  if (!slot.clipId) {
    const clips = await listTechniqueClips();
    return { plan, clips, status: 'empty' };
  }
  const db = await openDb();
  const tx = db.transaction(CLIPS, 'readwrite');
  tx.objectStore(CLIPS).delete(slot.clipId);
  await txDone(tx);
  const next = setSlotClip(plan, slotId, null);
  await saveTechniquePlan(next);
  return { plan: next, clips: await listTechniqueClips(), status: 'removed' };
}

/**
 * Keep a Drive training video on this phone. An existing clip with the same
 * Drive file id is reused, so opening the day again does not download twice.
 * Pass a null blob to ask for that reuse only.
 */
export async function storeRestoredDriveClip(input: {
  driveFileId: string;
  blob: Blob | null;
  mime: string;
  label: string;
}): Promise<string | null> {
  const driveFileId = clampDriveFileId(input.driveFileId);
  if (!driveFileId) return null;
  const board = await loadTechniqueBoard();
  const kept = board.plan.slots.find(
    (slot) => slot.driveFileId === driveFileId && slot.clipId && board.clips.some((clip) => clip.id === slot.clipId),
  );
  if (kept?.clipId) return kept.clipId;
  if (!input.blob || input.blob.size <= 0) return null;
  const clipId = crypto.randomUUID();
  const nextOrder = board.clips.reduce((max, clip) => Math.max(max, clip.sortOrder), -1) + 1;
  const mime = input.mime.toLowerCase().startsWith('video/') ? input.mime.toLowerCase() : 'video/mp4';
  const row: TechniqueClip = {
    id: clipId,
    mime,
    addedAt: Date.now(),
    blob: input.blob,
    label: input.label.trim().slice(0, 180) || TECHNIQUE_FOLDER.labelPrefix,
    folderId: TECHNIQUE_FOLDER_ID,
    sortOrder: nextOrder,
  };
  await assertOriginRoom(input.blob.size);
  try {
    const db = await openDb();
    const tx = db.transaction(CLIPS, 'readwrite');
    tx.objectStore(CLIPS).put(row);
    await txDone(tx);
  } catch (error) {
    if (error instanceof StorageQuotaError) throw error;
    if (isStorageQuotaError(error)) throw new StorageQuotaError(0);
    throw error;
  }
  return clipId;
}

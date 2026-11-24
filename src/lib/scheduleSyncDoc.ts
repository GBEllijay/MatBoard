/**
 * The owner's Class Schedule on every signed-in device. The schedule editor
 * saves to localStorage on one device; this document carries that board,
 * belt levels included, through /api/login/sync to the owner's other devices
 * (phone, computer, gym TV). Last write wins by updatedAt, like the academy
 * profile. Logo and QR pictures stay on each device. "On the TV" stays on
 * each device too, so a phone does not switch the gym TV cast.
 *
 * Safe to import from the server: no DOM, and stores are passed in.
 */
import { normalizeGymCalendar, type GymCalendarState } from './gymCalendar.ts';
import { pickWinningDoc, type DocPick } from './signedInSyncDocs.ts';

export const SCHEDULE_STORAGE_KEY = 'matboard.schedule.v1';
export const SCHEDULE_SYNC_META_KEY = 'matboard.schedule.sync.v1';
/** This device's own board, kept once before a Cloud copy first replaces a board that was never synced. */
export const SCHEDULE_BEFORE_SYNC_KEY = 'matboard.schedule.v1.beforeSync';
export const SCHEDULE_SYNC_MAX_BYTES = 200_000;

export type ScheduleSyncDoc = {
  v: 1;
  updatedAt: number;
  schedule: GymCalendarState;
};

export type ScheduleSyncMeta = {
  v: 1;
  /** Last local edit (or the Cloud copy this device applied). 0 means never stamped. */
  updatedAt: number;
  syncedAt: number | null;
};

type ReadStore = { getItem: (key: string) => string | null };
type WriteStore = ReadStore & { setItem: (key: string, value: string) => void };

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function readScheduleSyncMeta(store: ReadStore | null): ScheduleSyncMeta {
  try {
    const raw = store?.getItem(SCHEDULE_SYNC_META_KEY);
    if (!raw) return { v: 1, updatedAt: 0, syncedAt: null };
    const parsed = JSON.parse(raw) as Partial<ScheduleSyncMeta>;
    const syncedAt = finite(parsed.syncedAt);
    return { v: 1, updatedAt: finite(parsed.updatedAt), syncedAt: syncedAt || null };
  } catch {
    return { v: 1, updatedAt: 0, syncedAt: null };
  }
}

export function writeScheduleSyncMeta(store: WriteStore | null, meta: ScheduleSyncMeta): void {
  try {
    store?.setItem(SCHEDULE_SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    /* private mode or full; the board itself is what matters */
  }
}

export function scheduleIsEmpty(schedule: GymCalendarState | null | undefined): boolean {
  if (!schedule) return true;
  return !schedule.classes.length && !schedule.specials.length && !schedule.title.trim() && !schedule.notes.trim();
}

export function scheduleSyncDocIsEmpty(doc: ScheduleSyncDoc | null | undefined): boolean {
  return !doc || scheduleIsEmpty(doc.schedule);
}

/** Same check on both ends. Every class keeps its level; unknown levels read as No level. */
export function sanitizeScheduleSyncDoc(raw: unknown): ScheduleSyncDoc | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as { updatedAt?: unknown; schedule?: unknown };
  if (!row.schedule || typeof row.schedule !== 'object') return null;
  return { v: 1, updatedAt: finite(row.updatedAt), schedule: normalizeGymCalendar(row.schedule) };
}

export function readStoredSchedule(store: ReadStore | null): GymCalendarState | null {
  try {
    const raw = store?.getItem(SCHEDULE_STORAGE_KEY);
    return raw ? normalizeGymCalendar(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function collectScheduleDoc(store: ReadStore | null): ScheduleSyncDoc | null {
  const schedule = readStoredSchedule(store);
  if (!schedule) return null;
  return { v: 1, updatedAt: readScheduleSyncMeta(store).updatedAt, schedule };
}

/**
 * Last write wins. A board this device never stamped (saved before sync
 * existed) has updatedAt 0, so a board another device already uploaded wins
 * over it; the replaced board is kept under SCHEDULE_BEFORE_SYNC_KEY.
 */
export function mergeScheduleDocs(local: ScheduleSyncDoc | null, remote: ScheduleSyncDoc | null): DocPick<ScheduleSyncDoc> {
  return pickWinningDoc(local, remote, scheduleSyncDocIsEmpty, (doc) => doc.updatedAt);
}

function sameBoard(a: GymCalendarState, b: GymCalendarState): boolean {
  const strip = (state: GymCalendarState) => JSON.stringify({ ...state, castEnabled: true });
  return strip(a) === strip(b);
}

/**
 * Write a Cloud board into this device's storage. "On the TV" stays as this
 * device had it. Returns true when the stored board changed.
 */
export function applyScheduleDocToStore(doc: ScheduleSyncDoc, store: WriteStore | null): boolean {
  if (!store) return false;
  const current = readStoredSchedule(store);
  const meta = readScheduleSyncMeta(store);
  const incoming = normalizeGymCalendar(doc.schedule);
  const next: GymCalendarState = { ...incoming, castEnabled: current ? current.castEnabled : incoming.castEnabled };
  const changed = !current || !sameBoard(current, next);
  if (changed && current && !scheduleIsEmpty(current) && !meta.syncedAt && !store.getItem(SCHEDULE_BEFORE_SYNC_KEY)) {
    try {
      store.setItem(SCHEDULE_BEFORE_SYNC_KEY, JSON.stringify({ savedAt: Date.now(), schedule: current }));
    } catch {
      /* no room for a second copy; Export still works */
    }
  }
  if (changed) store.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(next));
  writeScheduleSyncMeta(store, { v: 1, updatedAt: doc.updatedAt, syncedAt: doc.updatedAt });
  return changed;
}

export function readScheduleBeforeSync(store: ReadStore | null): { savedAt: number; schedule: GymCalendarState } | null {
  try {
    const raw = store?.getItem(SCHEDULE_BEFORE_SYNC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; schedule?: unknown };
    const schedule = normalizeGymCalendar(parsed.schedule);
    return scheduleIsEmpty(schedule) ? null : { savedAt: finite(parsed.savedAt), schedule };
  } catch {
    return null;
  }
}

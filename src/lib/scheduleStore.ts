/** Class Schedule persistence. Calendar item shapes live in gymCalendar for Events later. */

import {
  coerceClassLevel,
  createClassId,
  createSpecialId,
  defaultGymCalendar,
  isScheduleTemplate,
  isWeekday,
  type ClassLevel,
  normalizeGymCalendar,
  SAMPLE_WEEK_NOTES,
  SAMPLE_WEEK_QR,
  SAMPLE_WEEK_TITLE,
  sampleWeekClasses,
  sampleWeekSpecials,
  sortClasses,
  sortSpecials,
  suggestNextMat,
  type GymCalendarState,
  type ScheduleTemplate,
  type SpecialDate,
  type Weekday,
  type WeeklyClassSlot,
} from './gymCalendar.ts';
import { shrinkImageFile } from './imageShrink.ts';
import {
  readScheduleBeforeSync,
  readScheduleSyncMeta,
  SCHEDULE_BEFORE_SYNC_KEY,
  SCHEDULE_SYNC_META_KEY,
  writeScheduleSyncMeta,
} from './scheduleSyncDoc.ts';
import { noteLocalScheduleChange } from './syncTrigger.ts';
import { assertOriginRoom, isStorageQuotaError, StorageQuotaError } from './storageQuota.ts';

export {
  WEEKDAYS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  SCHEDULE_TEMPLATES,
  SCHEDULE_TEMPLATE_HINTS,
  SCHEDULE_TEMPLATE_LABELS,
  DEFAULT_SCHEDULE_TEMPLATE,
  displayTemplate,
  monthWeeks,
  boardWeekdays,
  classesOnDay,
  compareClasses,
  DEFAULT_MATS,
  formatBoardStamp,
  formatClassTime,
  formatSpecialDate,
  formatTimeGroupLine,
  classesAt,
  classesInHour,
  CLASS_LEVELS,
  CLASS_LEVEL_META,
  CLASS_LEVEL_ORDER,
  classLevelCounts,
  groupClassesByTime,
  coerceClassLevel,
  isClassLevel,
  isScheduleTemplate,
  isWeekday,
  normalizeQrUrl,
  noticeLines,
  SPECIAL_EVENT_DWELL_MS,
  specialEventCount,
  specialEventLine,
  specialEventSlides,
  specialsOnStrip,
  specialsThisMonth,
  parseTimeMinutes,
  SAMPLE_WEEK_NOTES,
  SAMPLE_WEEK_QR,
  SAMPLE_WEEK_SLOTS,
  SAMPLE_WEEK_TITLE,
  sortClasses,
  specialsThisWeek,
  suggestNextMat,
  todayWeekday,
  weekHourLanes,
  weekTimeRows,
  weekdayFromJsDay,
  type ClassLevel,
  type ClassTimeGroup,
  type GymCalendarState,
  type MonthDay,
  type ScheduleTemplate,
  type SpecialDate,
  type SpecialEventSlide,
  type Weekday,
  type WeeklyClassSlot,
} from './gymCalendar.ts';

export const STORAGE_KEY = 'matboard.schedule.v1';
const ASSET_DB = 'matboard-schedule';
const ASSET_STORE = 'assets';
const ASSET_DB_VERSION = 1;

export type ScheduleState = GymCalendarState;

export type ScheduleAssets = {
  logo: Blob | null;
  qrImage: Blob | null;
  revision: number;
};

const listeners = new Set<() => void>();
const assetListeners = new Set<() => void>();

/** Shown in the editor when this device could not keep the last change. */
export const SCHEDULE_SAVE_FAILED =
  'This change is showing but was not saved on this device. The browser storage is full or blocked. Export a backup, free up space, then make the change again.';

/** The exact JSON this module last read or wrote. Anything else in storage came from another tab or a sync. */
let lastRaw: string | null = readStorage();
let saveError: string | null = null;
let state: ScheduleState = loadState();
let assets: ScheduleAssets = { logo: null, qrImage: null, revision: 0 };

export function defaultSchedule(): ScheduleState {
  return defaultGymCalendar();
}

export function normalizeSchedule(raw: unknown): ScheduleState {
  return normalizeGymCalendar(raw);
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readStorage(): string | null {
  try {
    return browserStorage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function loadState(): ScheduleState {
  try {
    const raw = readStorage();
    lastRaw = raw;
    if (!raw) return defaultSchedule();
    return normalizeSchedule(JSON.parse(raw));
  } catch {
    return defaultSchedule();
  }
}

/**
 * Another tab, the gym TV window, or a Cloud pull may have saved a newer
 * board since this copy was read. Start every edit from what is saved, so an
 * older copy in memory never writes over a level picked somewhere else.
 */
function freshen(): void {
  const raw = readStorage();
  if (raw === null || raw === lastRaw) return;
  try {
    state = normalizeSchedule(JSON.parse(raw));
    lastRaw = raw;
  } catch {
    /* unreadable copy; keep the one in memory */
  }
}

/** Write and read back. A write the browser refused is reported, not swallowed. */
function writeStorage(raw: string): boolean {
  const storage = browserStorage();
  if (!storage) return true;
  try {
    storage.setItem(STORAGE_KEY, raw);
    return storage.getItem(STORAGE_KEY) === raw;
  } catch {
    return false;
  }
}

function persist(next: ScheduleState, options: { localEdit?: boolean } = {}): void {
  state = next;
  const raw = JSON.stringify(state);
  if (writeStorage(raw)) {
    lastRaw = raw;
    saveError = null;
    if (options.localEdit !== false) {
      const storage = browserStorage();
      const meta = readScheduleSyncMeta(storage);
      writeScheduleSyncMeta(storage, { ...meta, updatedAt: Date.now() });
      noteLocalScheduleChange();
    }
  } else {
    saveError = SCHEDULE_SAVE_FAILED;
  }
  listeners.forEach((fn) => fn());
}

/** Callers run freshen() before they read `state` to build `partial`. */
function patch(partial: Partial<Omit<ScheduleState, 'version'>>): void {
  persist({ ...state, ...partial, version: 1 });
}

/** Null when the last change was saved on this device. */
export function getScheduleSaveError(): string | null {
  return saveError;
}

/** Re-read the saved board after another tab or Cloud sync wrote it. */
export function reloadScheduleFromStorage(): void {
  const raw = readStorage();
  if (raw === lastRaw) return;
  state = loadState();
  listeners.forEach((fn) => fn());
}

/** The board this device had before a Cloud copy first replaced it, if one was kept. */
export function getScheduleBeforeSync(): { savedAt: number; schedule: ScheduleState } | null {
  return readScheduleBeforeSync(browserStorage());
}

export function clearScheduleBeforeSync(): void {
  try {
    browserStorage()?.removeItem(SCHEDULE_BEFORE_SYNC_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
}

export { SCHEDULE_SYNC_META_KEY };

export function setScheduleTemplate(template: ScheduleTemplate): void {
  freshen();
  if (!isScheduleTemplate(template)) return;
  patch({ template: template === 'week-grid' ? 'week' : template });
}

export function setScheduleCastEnabled(enabled: boolean): void {
  freshen();
  patch({ castEnabled: enabled });
}

/** Fields left `null` stay as they are. An empty specials array clears specials. */
export type ScheduleImportPayload = {
  classes: WeeklyClassSlot[];
  specials: SpecialDate[] | null;
  title: string | null;
  qrUrl: string | null;
  notes: string | null;
  template: ScheduleTemplate | null;
  castEnabled: boolean | null;
};

export function applyScheduleImport(payload: ScheduleImportPayload): void {
  freshen();
  patch({
    classes: sortClasses(payload.classes),
    specials: payload.specials == null ? state.specials : sortSpecials(payload.specials),
    title: payload.title == null ? state.title : payload.title,
    qrUrl: payload.qrUrl == null ? state.qrUrl : payload.qrUrl,
    notes: payload.notes == null ? state.notes : payload.notes,
    template: payload.template == null ? state.template : payload.template === 'week-grid' ? 'week' : payload.template,
    castEnabled: payload.castEnabled == null ? state.castEnabled : payload.castEnabled,
  });
}

export function getSchedule(): ScheduleState {
  return state;
}

export function subscribeSchedule(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getScheduleAssets(): ScheduleAssets {
  return assets;
}

export function subscribeScheduleAssets(fn: () => void): () => void {
  assetListeners.add(fn);
  return () => {
    assetListeners.delete(fn);
  };
}

function setAssets(next: Omit<ScheduleAssets, 'revision'>): void {
  assets = { ...next, revision: assets.revision + 1 };
  assetListeners.forEach((fn) => fn());
}

export function setBoardTitle(title: string): void {
  freshen();
  patch({ title });
}

export function setScheduleNotes(notes: string): void {
  freshen();
  patch({ notes });
}

export function setQrUrl(qrUrl: string): void {
  freshen();
  patch({ qrUrl });
}

export function addClass(
  day: Weekday,
  time: string,
  title: string,
  location = '',
  subtitle = '',
  level: ClassLevel = 'none',
): WeeklyClassSlot | null {
  freshen();
  const next: WeeklyClassSlot = {
    id: createClassId(),
    kind: 'class',
    day,
    time: time.trim(),
    title: title.trim(),
    location: location.trim(),
    subtitle: subtitle.trim(),
    level: coerceClassLevel(level) ?? 'none',
  };
  if (!next.time && !next.title) return null;
  patch({ classes: sortClasses([...state.classes, next]) });
  return next;
}

/** Same day + time on the next free mat (MAT 1 → MAT 2). Title is filled in Edit. */
export function addParallelClass(id: string): WeeklyClassSlot | null {
  freshen();
  const source = state.classes.find((row) => row.id === id);
  if (!source || !source.time) return null;
  const used = state.classes
    .filter((row) => row.day === source.day && row.time === source.time)
    .map((row) => row.location);
  return addClass(source.day, source.time, '', suggestNextMat(used));
}

export function updateClass(
  id: string,
  partial: Partial<Pick<WeeklyClassSlot, 'day' | 'time' | 'title' | 'location' | 'subtitle' | 'level'>>,
): void {
  freshen();
  patch({
    classes: sortClasses(
      state.classes.map((row) => {
        if (row.id !== id) return row;
        return {
          ...row,
          kind: 'class',
          day: partial.day && isWeekday(partial.day) ? partial.day : row.day,
          time: typeof partial.time === 'string' ? partial.time : row.time,
          title: typeof partial.title === 'string' ? partial.title : row.title,
          location: typeof partial.location === 'string' ? partial.location : row.location,
          subtitle: typeof partial.subtitle === 'string' ? partial.subtitle : row.subtitle,
          level:
            partial.level === undefined
              ? (coerceClassLevel(row.level) ?? 'none')
              : (coerceClassLevel(partial.level) ?? coerceClassLevel(row.level) ?? 'none'),
        };
      }),
    ),
  });
}

/** Replaces weekly classes with a flyer-shaped sample week for TV preview. */
export function loadSampleWeek(): void {
  freshen();
  patch({
    title: state.title.trim() || SAMPLE_WEEK_TITLE,
    notes: state.notes.trim() || SAMPLE_WEEK_NOTES,
    qrUrl: state.qrUrl.trim() || SAMPLE_WEEK_QR,
    classes: sortClasses(sampleWeekClasses()),
    specials: state.specials.length ? state.specials : sampleWeekSpecials(),
  });
}

export function removeClass(id: string): void {
  freshen();
  patch({ classes: state.classes.filter((row) => row.id !== id) });
}

export function addSpecial(date: string, title: string, body = ''): SpecialDate | null {
  freshen();
  const next: SpecialDate = {
    id: createSpecialId(),
    kind: 'special',
    date: date.trim(),
    title: title.trim(),
    body: body.trim(),
    flyerId: null,
  };
  if (!next.date && !next.title && !next.body) return null;
  patch({ specials: sortSpecials([...state.specials, next]) });
  return next;
}

export function updateSpecial(
  id: string,
  partial: Partial<Pick<SpecialDate, 'date' | 'title' | 'body' | 'flyerId'>>,
): void {
  freshen();
  patch({
    specials: sortSpecials(
      state.specials.map((row) => {
        if (row.id !== id) return row;
        return {
          ...row,
          kind: 'special',
          date: typeof partial.date === 'string' ? partial.date : row.date,
          title: typeof partial.title === 'string' ? partial.title : row.title,
          body: typeof partial.body === 'string' ? partial.body : row.body,
          flyerId: partial.flyerId === undefined ? row.flyerId : partial.flyerId,
        };
      }),
    ),
  });
}

export function removeSpecial(id: string): void {
  freshen();
  patch({ specials: state.specials.filter((row) => row.id !== id) });
}

function openAssetDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ASSET_DB, ASSET_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        db.createObjectStore(ASSET_STORE);
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

async function putAsset(key: 'logo' | 'qrImage', blob: Blob | null): Promise<void> {
  if (blob) await assertOriginRoom(blob.size);
  try {
    const db = await openAssetDb();
    const tx = db.transaction(ASSET_STORE, 'readwrite');
    const store = tx.objectStore(ASSET_STORE);
    if (blob) store.put(blob, key);
    else store.delete(key);
    await txDone(tx);
  } catch (error) {
    if (error instanceof StorageQuotaError) throw error;
    if (isStorageQuotaError(error)) throw new StorageQuotaError(0);
    throw error;
  }
}

async function loadAssetsFromDb(): Promise<Pick<ScheduleAssets, 'logo' | 'qrImage'>> {
  try {
    const db = await openAssetDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, 'readonly');
      const store = tx.objectStore(ASSET_STORE);
      const logoReq = store.get('logo');
      const qrReq = store.get('qrImage');
      tx.oncomplete = () => {
        resolve({
          logo: logoReq.result instanceof Blob ? logoReq.result : null,
          qrImage: qrReq.result instanceof Blob ? qrReq.result : null,
        });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return { logo: null, qrImage: null };
  }
}

export async function setLogoBlob(blob: Blob | null): Promise<void> {
  await putAsset('logo', blob);
  setAssets({ logo: blob, qrImage: assets.qrImage });
}

export async function setQrImageBlob(blob: Blob | null): Promise<void> {
  await putAsset('qrImage', blob);
  setAssets({ logo: assets.logo, qrImage: blob });
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}

/** Shrink a schedule logo or QR photo before IndexedDB. Same helper as Gallery and Pro Shop. */
export async function readPickedImage(file: File, maxEdge = 1280): Promise<Blob> {
  if (!isImageFile(file)) {
    throw new Error('not-image');
  }
  return shrinkImageFile(file, {
    maxEdge,
    quality: 0.86,
    passthroughBytes: 900_000,
    mimeFor: (source) =>
      source.type === 'image/png' || source.type === 'image/webp' ? source.type : 'image/jpeg',
  });
}

export async function initScheduleSync(): Promise<void> {
  // Listen before the IndexedDB read, so a slow or blocked picture store never
  // leaves this tab holding an old board that the next edit would save back.
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    reloadScheduleFromStorage();
  });
  const loaded = await loadAssetsFromDb();
  setAssets(loaded);
}

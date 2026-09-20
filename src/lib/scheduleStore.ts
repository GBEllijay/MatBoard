/** Class Schedule persistence. Calendar item shapes live in gymCalendar for Events later. */

import {
  createClassId,
  createSpecialId,
  defaultGymCalendar,
  isWeekday,
  normalizeGymCalendar,
  sortClasses,
  sortSpecials,
  type GymCalendarState,
  type SpecialDate,
  type Weekday,
  type WeeklyClassSlot,
} from './gymCalendar';

export {
  WEEKDAYS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  classesOnDay,
  compareClasses,
  formatClassTime,
  formatSpecialDate,
  isWeekday,
  normalizeQrUrl,
  noticeLines,
  parseTimeMinutes,
  sortClasses,
  specialsThisWeek,
  todayWeekday,
  weekdayFromJsDay,
  type GymCalendarState,
  type SpecialDate,
  type Weekday,
  type WeeklyClassSlot,
} from './gymCalendar';

export const STORAGE_KEY = 'matboard.schedule.v1';
const ASSET_DB = 'matboard-schedule';
const ASSET_STORE = 'assets';
const ASSET_DB_VERSION = 1;

export type ScheduleState = GymCalendarState;
export type ScheduleClass = WeeklyClassSlot;

export type ScheduleAssets = {
  logo: Blob | null;
  qrImage: Blob | null;
  revision: number;
};

const listeners = new Set<() => void>();
const assetListeners = new Set<() => void>();

let state: ScheduleState = loadState();
let assets: ScheduleAssets = { logo: null, qrImage: null, revision: 0 };

export function defaultSchedule(): ScheduleState {
  return defaultGymCalendar();
}

export function normalizeSchedule(raw: unknown): ScheduleState {
  return normalizeGymCalendar(raw);
}

function readStorage(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function loadState(): ScheduleState {
  try {
    const raw = readStorage();
    if (!raw) return defaultSchedule();
    return normalizeSchedule(JSON.parse(raw));
  } catch {
    return defaultSchedule();
  }
}

function persist(next: ScheduleState): void {
  state = next;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

function patch(partial: Partial<Omit<ScheduleState, 'version'>>): void {
  persist({ ...state, ...partial, version: 1 });
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
  patch({ title });
}

export function setScheduleNotes(notes: string): void {
  patch({ notes });
}

export function setQrUrl(qrUrl: string): void {
  patch({ qrUrl });
}

export function addClass(day: Weekday, time: string, title: string): WeeklyClassSlot | null {
  const next: WeeklyClassSlot = {
    id: createClassId(),
    kind: 'class',
    day,
    time: time.trim(),
    title: title.trim(),
  };
  if (!next.time && !next.title) return null;
  patch({ classes: sortClasses([...state.classes, next]) });
  return next;
}

export function updateClass(
  id: string,
  partial: Partial<Pick<WeeklyClassSlot, 'day' | 'time' | 'title'>>,
): void {
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
        };
      }),
    ),
  });
}

export function removeClass(id: string): void {
  patch({ classes: state.classes.filter((row) => row.id !== id) });
}

export function addSpecial(date: string, title: string, body = ''): SpecialDate | null {
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
  patch({ specials: state.specials.filter((row) => row.id !== id) });
}

export function clearClasses(): void {
  patch({ classes: [] });
}

export function resetSchedule(): void {
  persist(defaultSchedule());
  void clearScheduleAssets();
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
  const db = await openAssetDb();
  const tx = db.transaction(ASSET_STORE, 'readwrite');
  const store = tx.objectStore(ASSET_STORE);
  if (blob) store.put(blob, key);
  else store.delete(key);
  await txDone(tx);
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

export async function clearScheduleAssets(): Promise<void> {
  await Promise.all([putAsset('logo', null), putAsset('qrImage', null)]);
  setAssets({ logo: null, qrImage: null });
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}

/** Shrink gym photos so a logo stays on-device without filling the disk. */
export async function readPickedImage(file: File, maxEdge = 1280): Promise<Blob> {
  if (!isImageFile(file)) {
    throw new Error('not-image');
  }
  if (typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 900_000) {
    bitmap.close();
    return file;
  }
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const mime = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.86));
  return blob ?? file;
}

export async function initScheduleSync(): Promise<void> {
  const loaded = await loadAssetsFromDb();
  setAssets(loaded);
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = loadState();
    listeners.forEach((fn) => fn());
  });
}

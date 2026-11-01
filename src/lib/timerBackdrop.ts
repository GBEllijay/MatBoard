import { shrinkImageFile, STORED_PHOTO_MAX_EDGE, STORED_PHOTO_QUALITY } from './imageShrink.ts';

/**
 * Round timer custom background and gym-logo corner.
 *
 * Everything stays on this device. Advantage does not host gym pictures.
 * - Small prefs (logo toggle, dim level, background stamp) live in localStorage
 *   under `TIMER_BACKDROP_KEY`, so a second tab, the Rounds TV popup, or the
 *   controller on this device hears the change through the `storage` event.
 * - The background picture itself is a Blob in its own IndexedDB database
 *   (`TIMER_BACKDROP_DB`). A separate database keeps the shared `matboard`
 *   photo DB version untouched.
 * - The logo is the gym logo already saved in Media Console
 *   (`matboard.gymLogo.v1`, see gymLogo.ts). It is never copied here.
 *
 * Layers on /training (bottom → top): page skin colour (Classic / Advantage /
 * future data-skin) → `.training__backdrop` picture → `.training__scrim` →
 * clock, round line, corner marks, sheets. A skin only paints `main.training`,
 * so a custom picture sits over any skin and under every control.
 */

export const TIMER_BACKDROP_KEY = 'matboard.timerBackdrop.v1';
export const TIMER_BACKDROP_DB = 'matboard-timer-backdrop';
const DB_STORE = 'assets';
const BACKGROUND_ID = 'background';

export type TimerScrim = 'light' | 'medium' | 'strong';
export const TIMER_SCRIMS: readonly { id: TimerScrim; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'medium', label: 'Medium' },
  { id: 'strong', label: 'Strong' },
];

export type TimerBackdropPrefs = {
  version: 1;
  /** Bumped on every background save. null = default skin background. */
  backgroundStamp: number | null;
  /** Gym logo in the top-right corner. Off by default. */
  showGymLogo: boolean;
  /** How much the picture is dimmed behind the digits. */
  scrim: TimerScrim;
};

export const DEFAULT_TIMER_BACKDROP: TimerBackdropPrefs = {
  version: 1,
  backgroundStamp: null,
  showGymLogo: false,
  scrim: 'medium',
};

/** Background is scaled to a TV edge and saved as JPEG (WebP if JPEG encode is missing). */
export const TIMER_BACKGROUND_MAX_EDGE = STORED_PHOTO_MAX_EDGE;

function isScrim(value: unknown): value is TimerScrim {
  return value === 'light' || value === 'medium' || value === 'strong';
}

export function normalizeTimerBackdrop(raw: unknown): TimerBackdropPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TIMER_BACKDROP };
  const value = raw as Partial<TimerBackdropPrefs>;
  const stamp = value.backgroundStamp;
  return {
    version: 1,
    backgroundStamp: typeof stamp === 'number' && Number.isFinite(stamp) && stamp > 0 ? stamp : null,
    showGymLogo: value.showGymLogo === true,
    scrim: isScrim(value.scrim) ? value.scrim : DEFAULT_TIMER_BACKDROP.scrim,
  };
}

let cached: TimerBackdropPrefs | null = null;
let cachedRaw: string | null | undefined;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(TIMER_BACKDROP_KEY);
  } catch {
    return null;
  }
}

/** Stable snapshot for useSyncExternalStore. */
export function getTimerBackdrop(): TimerBackdropPrefs {
  const raw = readRaw();
  if (cached && raw === cachedRaw) return cached;
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  cached = normalizeTimerBackdrop(parsed);
  cachedRaw = raw;
  return cached;
}

function emit(): void {
  listeners.forEach((fn) => fn());
}

function writePrefs(next: TimerBackdropPrefs): void {
  try {
    localStorage.setItem(TIMER_BACKDROP_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota: keep the in-memory value for this tab */
    cached = next;
    cachedRaw = readRaw();
  }
  emit();
}

export function patchTimerBackdrop(patch: Partial<Omit<TimerBackdropPrefs, 'version'>>): void {
  writePrefs(normalizeTimerBackdrop({ ...getTimerBackdrop(), ...patch }));
}

export function setTimerShowGymLogo(on: boolean): void {
  patchTimerBackdrop({ showGymLogo: on });
}

export function setTimerScrim(scrim: TimerScrim): void {
  patchTimerBackdrop({ scrim });
}

export function subscribeTimerBackdrop(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === TIMER_BACKDROP_KEY || event.key === null) emit();
  });
}

/** The corner logo shows only when the toggle is on and a gym logo is saved. */
export function timerGymLogoSrc(prefs: TimerBackdropPrefs, gymLogo: string | null | undefined): string | null {
  if (!prefs.showGymLogo) return null;
  const logo = gymLogo?.trim() ?? '';
  return logo.startsWith('data:image/') || logo.startsWith('blob:') || logo.startsWith('/') ? logo : null;
}

/** Extra classes on `main.training`. Empty when nothing custom is set. */
export function timerBackdropClasses(hasBackground: boolean, prefs: TimerBackdropPrefs, logoShown: boolean): string {
  const out: string[] = [];
  if (hasBackground) out.push('training--custom-bg', `training--scrim-${prefs.scrim}`);
  if (logoShown) out.push('training--gym-logo');
  return out.join(' ');
}

/* ---------- IndexedDB (background picture) ---------- */

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(TIMER_BACKDROP_DB, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

export function timerBackgroundStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function readTimerBackground(): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<Blob | null>((resolve) => {
      try {
        const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(BACKGROUND_ID);
        req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } finally {
    db.close();
  }
}

async function putBackground(blob: Blob | null): Promise<void> {
  const db = await openDb();
  if (!db) throw new Error('no-storage');
  try {
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        if (blob) store.put(blob, BACKGROUND_ID);
        else store.delete(BACKGROUND_ID);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('write-failed'));
        tx.onabort = () => reject(tx.error ?? new Error('write-failed'));
      } catch (error) {
        reject(error);
      }
    });
  } finally {
    db.close();
  }
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|heic|heif|avif)$/i.test(file.name);
}

/** Scale a picked photo to a TV-sized JPEG. Keeps a small already-sized file as picked. */
export async function shrinkTimerBackground(file: File): Promise<Blob> {
  const safe = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp';
  return shrinkImageFile(file, {
    maxEdge: TIMER_BACKGROUND_MAX_EDGE,
    quality: STORED_PHOTO_QUALITY,
    passthroughBytes: safe ? 750_000 : 0,
    mimeFor: () => 'image/jpeg',
    fallbackMimes: ['image/webp'],
    opaqueBackground: '#000000',
    orient: true,
    smooth: true,
  });
}

/** Save a picked photo as the round timer background on this device. */
export async function saveTimerBackgroundFile(file: File): Promise<void> {
  if (!isImageFile(file)) throw new Error('not-image');
  const blob = await shrinkTimerBackground(file);
  await putBackground(blob);
  patchTimerBackdrop({ backgroundStamp: Date.now() });
}

/** Back to the skin's own background. */
export async function clearTimerBackground(): Promise<void> {
  try {
    await putBackground(null);
  } catch {
    /* nothing saved or storage blocked: still drop the stamp */
  }
  patchTimerBackdrop({ backgroundStamp: null });
}

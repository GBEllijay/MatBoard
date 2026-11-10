/**
 * Optional profile photo. It stays on this phone: localStorage, and IndexedDB
 * when the browser has it. Nothing here calls the network.
 * The picture is downscaled and center-cropped. The profile draws it as a circle.
 * A normal camera photo is shrunk until it fits. The stored cap does not change.
 */

import { canvasBlob, openStill, type StillSource } from './phoneStill.ts';
import { DEFAULT_STUDENT_PROFILE_ID, readActiveStudentProfileId } from './studentProfiles.ts';
import { assertOriginRoom, isStorageQuotaError, StorageQuotaError } from './storageQuota.ts';

const PORTRAIT_KEY = 'matboard.studentPortrait.v1';
const DB_NAME = 'matboard.studentPortrait';
const DB_STORE = 'portrait';

/** The original selfie record stays the default profile. Other profiles use their own id. */
export function portraitMirrorId(profileId = readActiveStudentProfileId()): string {
  if (!profileId || profileId === DEFAULT_STUDENT_PROFILE_ID) return 'selfie';
  return `selfie:${profileId}`;
}

export const PORTRAIT_MAX_EDGE = 320;
export const PORTRAIT_MAX_CHARS = 70_000;

/**
 * First entry is the stored size for a photo that fits.
 * Later entries are only used when that JPEG is still over {@link PORTRAIT_MAX_CHARS}.
 */
export const PORTRAIT_ENCODE_STEPS = [
  { edge: PORTRAIT_MAX_EDGE, quality: 0.72 },
  { edge: PORTRAIT_MAX_EDGE, quality: 0.56 },
  { edge: PORTRAIT_MAX_EDGE, quality: 0.42 },
  { edge: 256, quality: 0.5 },
  { edge: 192, quality: 0.42 },
] as const;

const PORTRAIT_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/;

type PortraitRecord = { version: 1; dataUrl: string };

type Store = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

/** Optional second copy. Production uses IndexedDB. Tests can pass a fake. */
export type PortraitMirror = {
  put(value: string): Promise<void>;
  delete(): Promise<void>;
};

function defaultStorage(): Store | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function portraitFits(value: string): boolean {
  return value.length <= PORTRAIT_MAX_CHARS && PORTRAIT_RE.test(value);
}

export function readProfilePortrait(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PORTRAIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PortraitRecord>;
    if (parsed.version !== 1 || typeof parsed.dataUrl !== 'string' || !portraitFits(parsed.dataUrl)) return null;
    return parsed.dataUrl;
  } catch {
    return null;
  }
}

export function writeProfilePortraitSync(dataUrl: string, storage: Store | null = defaultStorage()): void {
  if (!portraitFits(dataUrl)) throw new Error('too-large');
  if (!storage) return;
  const record: PortraitRecord = { version: 1, dataUrl };
  try {
    storage.setItem(PORTRAIT_KEY, JSON.stringify(record));
  } catch (error) {
    if (isStorageQuotaError(error)) throw new StorageQuotaError(0);
    throw error;
  }
}

export async function saveProfilePortrait(
  dataUrl: string,
  storage: Store | null = defaultStorage(),
  mirror: PortraitMirror | null = idbMirror(),
): Promise<void> {
  if (!portraitFits(dataUrl)) throw new Error('too-large');
  const record: PortraitRecord = { version: 1, dataUrl };
  await assertOriginRoom(JSON.stringify(record).length);
  writeProfilePortraitSync(dataUrl, storage);
  if (mirror) await mirror.put(dataUrl);
}

export async function clearProfilePortrait(
  storage: Store | null = defaultStorage(),
  mirror: PortraitMirror | null = idbMirror(),
): Promise<void> {
  try {
    if (storage?.removeItem) storage.removeItem(PORTRAIT_KEY);
    else storage?.setItem(PORTRAIT_KEY, '');
  } catch {
    /* private mode */
  }
  if (mirror) await mirror.delete();
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(file.name);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  const mime = blob.type === 'image/png' || blob.type === 'image/webp' ? blob.type : 'image/jpeg';
  return `data:${mime};base64,${btoa(binary)}`;
}

function drawPortrait(still: StillSource, edge: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const side = Math.min(still.width, still.height);
  const sx = Math.floor((still.width - side) / 2);
  const sy = Math.floor((still.height - side) / 2);
  ctx.fillStyle = '#1c1c1e';
  ctx.fillRect(0, 0, edge, edge);
  ctx.save();
  ctx.beginPath();
  ctx.arc(edge / 2, edge / 2, edge / 2, 0, Math.PI * 2);
  ctx.clip();
  still.draw(ctx, sx, sy, side, side, 0, 0, edge, edge);
  ctx.restore();
  return canvas;
}

/**
 * Center-crop a camera or gallery still and keep it small.
 * Corners outside the circle are filled so a round frame shows the face.
 * Throws `not-image`, `undecodable`, `unencoded`, or `too-large`.
 * Does not upload the file and does not replace a photo already stored.
 */
export async function portraitFromFile(file: File): Promise<string> {
  if (!isImageFile(file)) throw new Error('not-image');
  const still = await openStill(file);
  try {
    let produced = false;
    for (const step of PORTRAIT_ENCODE_STEPS) {
      const canvas = drawPortrait(still, step.edge);
      if (!canvas) throw new Error('unencoded');
      for (const mime of ['image/jpeg', 'image/webp'] as const) {
        const blob = await canvasBlob(canvas, mime, step.quality);
        if (!blob) continue;
        produced = true;
        const dataUrl = await blobToDataUrl(blob);
        if (portraitFits(dataUrl)) return dataUrl;
      }
    }
    throw new Error(produced ? 'too-large' : 'unencoded');
  } finally {
    still.close();
  }
}

function idbMirror(): PortraitMirror | null {
  if (typeof indexedDB === 'undefined') return null;
  return {
    put: (value) => idbPut(value),
    delete: () => idbDelete(),
  };
}

function idbOpen(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
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
  });
}

async function idbPut(value: string): Promise<void> {
  const db = await idbOpen();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, portraitMirrorId());
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

async function idbDelete(): Promise<void> {
  const db = await idbOpen();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(portraitMirrorId());
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/** Remove one profile's IndexedDB copy. The default profile's selfie record stays unless that id is passed. */
export async function forgetProfilePortraitMirror(profileId: string): Promise<void> {
  const db = await idbOpen();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(portraitMirrorId(profileId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

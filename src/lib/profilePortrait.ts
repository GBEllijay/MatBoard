/**
 * Optional profile photo. It stays on this phone: localStorage, and IndexedDB
 * when the browser has it. Nothing here calls the network.
 * The picture is downscaled and center-cropped. The profile draws it as a circle.
 */

const PORTRAIT_KEY = 'matboard.studentPortrait.v1';
const DB_NAME = 'matboard.studentPortrait';
const DB_STORE = 'portrait';
const DB_ID = 'selfie';

export const PORTRAIT_MAX_EDGE = 320;
export const PORTRAIT_MAX_CHARS = 70_000;

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
  storage.setItem(PORTRAIT_KEY, JSON.stringify(record));
}

export async function saveProfilePortrait(
  dataUrl: string,
  storage: Store | null = defaultStorage(),
  mirror: PortraitMirror | null = idbMirror(),
): Promise<void> {
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

/**
 * Center-crop a camera or gallery still and keep it small.
 * Corners outside the circle are filled so a round frame shows the face.
 * Throws `not-image` or `too-large`. Does not upload the file.
 */
export async function portraitFromFile(file: File): Promise<string> {
  if (!isImageFile(file)) throw new Error('not-image');
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    const dataUrl = await blobToDataUrl(file);
    if (!portraitFits(dataUrl)) throw new Error('too-large');
    return dataUrl;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file);
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.floor((bitmap.width - side) / 2);
  const sy = Math.floor((bitmap.height - side) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = PORTRAIT_MAX_EDGE;
  canvas.height = PORTRAIT_MAX_EDGE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    throw new Error('too-large');
  }
  ctx.fillStyle = '#1c1c1e';
  ctx.fillRect(0, 0, PORTRAIT_MAX_EDGE, PORTRAIT_MAX_EDGE);
  ctx.save();
  ctx.beginPath();
  ctx.arc(PORTRAIT_MAX_EDGE / 2, PORTRAIT_MAX_EDGE / 2, PORTRAIT_MAX_EDGE / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, PORTRAIT_MAX_EDGE, PORTRAIT_MAX_EDGE);
  ctx.restore();
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
  if (!blob) throw new Error('too-large');
  const dataUrl = await blobToDataUrl(blob);
  if (!portraitFits(dataUrl)) throw new Error('too-large');
  return dataUrl;
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
      tx.objectStore(DB_STORE).put(value, DB_ID);
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
      tx.objectStore(DB_STORE).delete(DB_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

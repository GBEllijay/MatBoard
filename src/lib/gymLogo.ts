import { shrinkImageFile } from './imageShrink.ts';

/**
 * Default gym logo for Advantage Pro. Saved on this device only.
 * Pro Shop cast reads `GYM_LOGO_STORAGE_KEY` through `readGymLogo()`.
 * Do not copy the bytes into another key.
 */

export const GYM_LOGO_STORAGE_KEY = 'matboard.gymLogo.v1';
/** Advantage mark when the gym has not saved a custom logo. */
export const ADVANTAGE_MARK_SRC = '/advantage-icon.png';
const GYM_LOGO_EVENT = 'matboard-gym-logo';

const MAX_EDGE = 512;
const MAX_DATA_URL_CHARS = 350_000;

type GymLogoRecord = {
  version: 1;
  dataUrl: string;
};

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(file.name);
}

function readRecord(): GymLogoRecord | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(GYM_LOGO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GymLogoRecord>;
    if (parsed.version !== 1 || typeof parsed.dataUrl !== 'string') return null;
    if (!parsed.dataUrl.startsWith('data:image/')) return null;
    return { version: 1, dataUrl: parsed.dataUrl };
  } catch {
    return null;
  }
}

function emitGymLogo(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(GYM_LOGO_EVENT));
}

/** Data URL of the gym’s default logo, or null when none is saved. */
export function readGymLogo(): string | null {
  return readRecord()?.dataUrl ?? null;
}

/**
 * Class Schedule header logo.
 * Media Console custom logo wins. A picture picked on the schedule is next.
 * Otherwise the Advantage mark.
 */
export function resolveScheduleLogo(
  gymLogo: string | null | undefined,
  boardLogo: string | null | undefined,
): string {
  const gym = gymLogo?.trim() ?? '';
  if (gym) return gym;
  const board = boardLogo?.trim() ?? '';
  if (board) return board;
  return ADVANTAGE_MARK_SRC;
}

export function subscribeGymLogo(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === GYM_LOGO_STORAGE_KEY) fn();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(GYM_LOGO_EVENT, fn);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(GYM_LOGO_EVENT, fn);
  };
}

export function writeGymLogo(dataUrl: string): void {
  if (!dataUrl.startsWith('data:image/')) throw new Error('not-image');
  if (dataUrl.length > MAX_DATA_URL_CHARS) throw new Error('too-large');
  const record: GymLogoRecord = { version: 1, dataUrl };
  localStorage.setItem(GYM_LOGO_STORAGE_KEY, JSON.stringify(record));
  emitGymLogo();
}

export function clearGymLogo(): void {
  try {
    localStorage.removeItem(GYM_LOGO_STORAGE_KEY);
  } catch {
    /* private mode */
  }
  emitGymLogo();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const mime = blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Keep a logo small enough for localStorage. Falls back to the original file. */
async function shrinkLogo(file: File): Promise<Blob> {
  return shrinkImageFile(file, {
    maxEdge: MAX_EDGE,
    quality: 0.86,
    passthroughBytes: 180_000,
    mimeFor: (source) =>
      source.type === 'image/png' || source.type === 'image/webp' ? source.type : 'image/jpeg',
  });
}

/** Save a picked photo as the default gym logo. Returns the stored data URL. */
export async function saveGymLogoFile(file: File): Promise<string> {
  if (!isImageFile(file)) throw new Error('not-image');
  const dataUrl = await blobToDataUrl(await shrinkLogo(file));
  writeGymLogo(dataUrl);
  return dataUrl;
}

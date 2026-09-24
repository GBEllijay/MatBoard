/**
 * Default gym logo for Advantage Pro. Saved on this device only.
 * Pro Shop cast reads `GYM_LOGO_STORAGE_KEY` through `readGymLogo()`.
 * Do not copy the bytes into another key.
 */

export const GYM_LOGO_STORAGE_KEY = 'matboard.gymLogo.v1';

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

/** Data URL of the gym’s default logo, or null when none is saved. */
export function readGymLogo(): string | null {
  return readRecord()?.dataUrl ?? null;
}

export function writeGymLogo(dataUrl: string): void {
  if (!dataUrl.startsWith('data:image/')) throw new Error('not-image');
  if (dataUrl.length > MAX_DATA_URL_CHARS) throw new Error('too-large');
  const record: GymLogoRecord = { version: 1, dataUrl };
  localStorage.setItem(GYM_LOGO_STORAGE_KEY, JSON.stringify(record));
}

export function clearGymLogo(): void {
  try {
    localStorage.removeItem(GYM_LOGO_STORAGE_KEY);
  } catch {
    /* private mode */
  }
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
  if (typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 180_000) {
      bitmap.close?.();
      return file;
    }
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const mime = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.86));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Save a picked photo as the default gym logo. Returns the stored data URL. */
export async function saveGymLogoFile(file: File): Promise<string> {
  if (!isImageFile(file)) throw new Error('not-image');
  const dataUrl = await blobToDataUrl(await shrinkLogo(file));
  writeGymLogo(dataUrl);
  return dataUrl;
}

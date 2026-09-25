/**
 * Shrink stills before they land in on-device storage.
 * Gym logos use a small edge for localStorage. Gallery, Pro Shop, and Events
 * use a TV-sized edge so a phone photo does not fill this site's storage quota.
 * Videos are not re-encoded here.
 */

import { StorageQuotaError } from './storageQuota.ts';

export const STORED_PHOTO_MAX_EDGE = 1920;
/** JPEG / WebP encode quality. Enough for a product photo on a gym TV. */
export const STORED_PHOTO_QUALITY = 0.82;
/**
 * JPEG, PNG, and WebP already under the max edge and this size stay as picked
 * so a second save does not soften them.
 */
export const STORED_PHOTO_PASSTHROUGH_BYTES = 750_000;

const DISPLAY_SAFE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type ShrinkImageOptions = {
  maxEdge: number;
  quality: number;
  /** Keep the original when it already fits inside the edge and is under this size. */
  passthroughBytes: number;
  mimeFor: (file: File) => string;
  /** Tried in order when the first `toBlob` type is unavailable. */
  fallbackMimes?: readonly string[];
  /** Drawn under the image. JPEG has no alpha; product photos use white. */
  opaqueBackground?: string;
  /** Phone photos are often sideways. Off for the gym-logo path, which already decoded this way. */
  orient?: boolean;
  smooth?: boolean;
  /**
   * Large camera shots skip a full-sensor decode. An unresized 12–48MP bitmap
   * can reload the tab, which looks like a jump back to the top of Media Console.
   */
  avoidFullDecode?: boolean;
};

export function fitWithinEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number; scale: number } {
  const longest = Math.max(width, height);
  const scale = longest > 0 ? Math.min(1, maxEdge / longest) : 1;
  return {
    scale,
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type ImageBounds = { width: number; height: number; orientation: number };

const JPEG_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function readU16(bytes: Uint8Array, offset: number, little: boolean): number {
  if (little) return bytes[offset]! | (bytes[offset + 1]! << 8);
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readU32(bytes: Uint8Array, offset: number, little: boolean): number {
  if (little) {
    return (
      (bytes[offset]! |
        (bytes[offset + 1]! << 8) |
        (bytes[offset + 2]! << 16) |
        (bytes[offset + 3]! << 24)) >>>
      0
    );
  }
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
  );
}

function readExifOrientation(payload: Uint8Array): number | null {
  if (payload.length < 16) return null;
  if (payload[0] !== 0x45 || payload[1] !== 0x78 || payload[2] !== 0x69 || payload[3] !== 0x66) return null;
  const tiff = 6;
  const little = payload[tiff] === 0x49 && payload[tiff + 1] === 0x49;
  const big = payload[tiff] === 0x4d && payload[tiff + 1] === 0x4d;
  if (!little && !big) return null;
  if (readU16(payload, tiff + 2, little) !== 42) return null;
  let ifd = tiff + readU32(payload, tiff + 4, little);
  if (ifd + 2 > payload.length) return null;
  const count = readU16(payload, ifd, little);
  ifd += 2;
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + index * 12;
    if (entry + 12 > payload.length) return null;
    if (readU16(payload, entry, little) !== 0x0112) continue;
    return readU16(payload, entry + 8, little);
  }
  return null;
}

/** JPEG / PNG pixel size from the file header. Avoids decoding a camera sensor image. */
export function imageBoundsFromBytes(bytes: Uint8Array): ImageBounds | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = readU32(bytes, 16, false);
    const height = readU32(bytes, 20, false);
    return width > 0 && height > 0 ? { width, height, orientation: 1 } : null;
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let orientation = 1;
  let width = 0;
  let height = 0;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    if (marker === 0xd8) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe1) {
      const next = readExifOrientation(bytes.subarray(offset + 4, offset + 2 + length));
      if (next) orientation = next;
    }
    if (JPEG_SOF.has(marker) && length >= 7) {
      height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
    }
    offset += 2 + length;
  }
  if (width <= 0 || height <= 0) return null;
  return { width, height, orientation };
}

export async function readImageBounds(file: Blob): Promise<ImageBounds | null> {
  try {
    const bytes = new Uint8Array(await file.slice(0, 262144).arrayBuffer());
    return imageBoundsFromBytes(bytes);
  } catch {
    return null;
  }
}

/** EXIF 5–8 swaps the sensor width and height once the pixels are turned upright. */
export function boundsForDecode(bounds: ImageBounds, orient: boolean): { width: number; height: number } {
  if (orient && bounds.orientation >= 5 && bounds.orientation <= 8) {
    return { width: bounds.height, height: bounds.width };
  }
  return { width: bounds.width, height: bounds.height };
}

function downscaleOptions(bounds: ImageBounds | null, orient: boolean, maxEdge: number): ImageBitmapOptions | null {
  if (!bounds) return null;
  const size = boundsForDecode(bounds, orient);
  const fitted = fitWithinEdge(size.width, size.height, maxEdge);
  if (fitted.scale >= 1) return null;
  if (fitted.width >= fitted.height) return { resizeWidth: fitted.width, resizeQuality: 'high' };
  return { resizeHeight: fitted.height, resizeQuality: 'high' };
}

/**
 * Decode a still. A camera JPEG is scaled on the long edge during decode so a
 * 12–48MP shot does not expand into a full-size bitmap (that reload drops the
 * new Pro Shop card and lands on the top of Media Console). A large file with
 * no readable header — typical camera HEIC — is decoded with `resizeWidth`
 * only. Falling back to a full-sensor decode can kill the tab.
 */
async function decodeImage(
  file: File,
  orient: boolean,
  maxEdge: number,
  avoidFullDecode: boolean,
): Promise<ImageBitmap> {
  const bounds = await readImageBounds(file);
  const resize = downscaleOptions(bounds, orient, maxEdge);
  const attempts: Array<ImageBitmapOptions | undefined> = [];
  let allowFull = true;
  if (orient && resize) attempts.push({ imageOrientation: 'from-image', ...resize });
  else if (resize) attempts.push(resize);
  else if (avoidFullDecode && !bounds) {
    const forced: ImageBitmapOptions = { resizeWidth: maxEdge, resizeQuality: 'high' };
    attempts.push(orient ? { imageOrientation: 'from-image', ...forced } : forced);
    allowFull = false;
  } else if (orient) attempts.push({ imageOrientation: 'from-image' });
  if (avoidFullDecode && resize) allowFull = false;
  if (allowFull) attempts.push(undefined);
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return attempt ? await createImageBitmap(file, attempt) : await createImageBitmap(file);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not decode image');
}

function withType(blob: Blob, mime: string): Blob {
  if (blob.type) return blob;
  return new Blob([blob], { type: mime });
}

/** Scale and lossy-encode a still. Returns the original file when encoding is unavailable. */
export async function shrinkImageFile(file: File, options: ShrinkImageOptions): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file;
  if (typeof document === 'undefined') return file;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decodeImage(file, options.orient === true, options.maxEdge, options.avoidFullDecode === true);
    const fitted = fitWithinEdge(bitmap.width, bitmap.height, options.maxEdge);
    if (fitted.scale === 1 && file.size < options.passthroughBytes) return file;
    const canvas = document.createElement('canvas');
    canvas.width = fitted.width;
    canvas.height = fitted.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    if (options.opaqueBackground) {
      ctx.fillStyle = options.opaqueBackground;
      ctx.fillRect(0, 0, fitted.width, fitted.height);
    }
    if (options.smooth) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
    ctx.drawImage(bitmap, 0, 0, fitted.width, fitted.height);
    bitmap.close?.();
    bitmap = null;
    const mimes = [options.mimeFor(file), ...(options.fallbackMimes ?? [])];
    for (const mime of mimes) {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), mime, options.quality);
      });
      if (blob && blob.size > 0) return withType(blob, mime);
    }
    return file;
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}

const PHOTO_SHRINK_EDGES = [STORED_PHOTO_MAX_EDGE, 1280, 960] as const;

/**
 * Gallery, Pro Shop, and Events stills. Keeps a small already-sized JPEG/PNG/WebP.
 * A typical phone photo — including a full-size camera JPEG or HEIC — is scaled
 * during decode and encoded as JPEG (WebP if JPEG encode is missing) before it
 * is stored. A large camera file that cannot be compressed is refused so the
 * original multi-megabyte shot is not written into IndexedDB. GIFs and videos
 * are unchanged.
 */
export async function shrinkPhotoForStore(file: File): Promise<Blob> {
  if (file.type.startsWith('video/') || file.type === 'image/gif') return file;
  const large = file.size > STORED_PHOTO_PASSTHROUGH_BYTES;
  const edges = large ? PHOTO_SHRINK_EDGES : [STORED_PHOTO_MAX_EDGE];
  for (const maxEdge of edges) {
    const shrunk = await shrinkImageFile(file, {
      maxEdge,
      quality: STORED_PHOTO_QUALITY,
      passthroughBytes: DISPLAY_SAFE.has(file.type) ? STORED_PHOTO_PASSTHROUGH_BYTES : 0,
      mimeFor: () => 'image/jpeg',
      fallbackMimes: ['image/webp'],
      opaqueBackground: '#ffffff',
      orient: true,
      smooth: true,
      avoidFullDecode: large,
    });
    if (shrunk !== file && shrunk.size > 0) {
      if (DISPLAY_SAFE.has(file.type) && shrunk.size >= file.size) return file;
      return shrunk;
    }
  }
  if (large && !DISPLAY_SAFE.has(file.type)) throw new StorageQuotaError(0);
  return file;
}

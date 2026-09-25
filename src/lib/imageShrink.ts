/**
 * Shrink stills before they land in on-device storage.
 * Gym logos use a small edge for localStorage. Gallery and Pro Shop use a
 * TV-sized edge so a phone photo does not fill this site's storage quota.
 * Videos are not re-encoded here.
 */

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

async function decodeImage(file: File, orient: boolean): Promise<ImageBitmap> {
  if (!orient) return createImageBitmap(file);
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return createImageBitmap(file);
  }
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
    bitmap = await decodeImage(file, options.orient === true);
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

/**
 * Gallery and Pro Shop stills. Keeps a small already-sized JPEG/PNG/WebP.
 * A typical phone photo is scaled to {@link STORED_PHOTO_MAX_EDGE} and encoded
 * as JPEG (WebP if JPEG encode is missing). GIFs and videos are unchanged.
 */
export async function shrinkPhotoForStore(file: File): Promise<Blob> {
  if (file.type.startsWith('video/') || file.type === 'image/gif') return file;
  const shrunk = await shrinkImageFile(file, {
    maxEdge: STORED_PHOTO_MAX_EDGE,
    quality: STORED_PHOTO_QUALITY,
    passthroughBytes: DISPLAY_SAFE.has(file.type) ? STORED_PHOTO_PASSTHROUGH_BYTES : 0,
    mimeFor: () => 'image/jpeg',
    fallbackMimes: ['image/webp'],
    opaqueBackground: '#ffffff',
    orient: true,
    smooth: true,
  });
  if (shrunk === file) return file;
  if (DISPLAY_SAFE.has(file.type) && shrunk.size >= file.size) return file;
  return shrunk;
}

/**
 * Face photo on a bout competitor. Stored on the roster record as a compact
 * JPEG (or WebP) data URL in the same on-device roster save as the other
 * fields. Nothing is uploaded. CSV does not include the bytes.
 *
 * Gallery stills use a TV-sized edge in IndexedDB. A roster face is only a
 * thumbnail, so this path stays much smaller and checks the same quota helper
 * before the data URL is returned.
 */

import { shrinkImageFile } from './imageShrink.ts';
import { assertOriginRoom } from './storageQuota.ts';

/** Longest edge of the stored face. List and edit thumbs are smaller than this. */
export const COMPETITOR_PHOTO_MAX_EDGE = 256;
export const COMPETITOR_PHOTO_QUALITY = 0.72;
/**
 * Data URL cap, prefix included. About 30KB of image data so a full roster
 * does not fill this site's localStorage by itself.
 */
export const COMPETITOR_PHOTO_MAX_CHARS = 40_000;
/** Binary size that still fits under {@link COMPETITOR_PHOTO_MAX_CHARS} after base64. */
const COMPETITOR_PHOTO_MAX_BYTES = 28_000;

const STEPS = [
  { maxEdge: COMPETITOR_PHOTO_MAX_EDGE, quality: COMPETITOR_PHOTO_QUALITY },
  { maxEdge: 192, quality: 0.64 },
  { maxEdge: 128, quality: 0.58 },
] as const;

const KEPT_PHOTO = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+={0,2}$/i;

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(file.name);
}

/** Keep a stored face, or blank when the value is missing, huge, or not a still. */
export function clipCompetitorPhoto(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > COMPETITOR_PHOTO_MAX_CHARS) return '';
  return KEPT_PHOTO.test(trimmed) ? trimmed : '';
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const mime = blob.type === 'image/webp' || blob.type === 'image/png' ? blob.type : 'image/jpeg';
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * Shrink a camera or library still into a face data URL.
 * Throws `not-image` for other files, `too-large` when it cannot fit the cap,
 * and `StorageQuotaError` when this site's storage reports no room.
 */
export async function competitorPhotoFromFile(file: File): Promise<string> {
  if (!isImageFile(file)) throw new Error('not-image');
  const passthrough =
    file.type === 'image/jpeg' || file.type === 'image/webp' ? COMPETITOR_PHOTO_MAX_BYTES : 0;
  for (const [index, step] of STEPS.entries()) {
    const blob = await shrinkImageFile(file, {
      maxEdge: step.maxEdge,
      quality: step.quality,
      passthroughBytes: index === 0 ? passthrough : 0,
      mimeFor: () => 'image/jpeg',
      fallbackMimes: ['image/webp'],
      opaqueBackground: '#ffffff',
      orient: true,
      smooth: true,
    });
    if (blob.size > COMPETITOR_PHOTO_MAX_BYTES) continue;
    const dataUrl = await blobToDataUrl(blob);
    if (!clipCompetitorPhoto(dataUrl)) continue;
    await assertOriginRoom(dataUrl.length);
    return dataUrl;
  }
  throw new Error('too-large');
}

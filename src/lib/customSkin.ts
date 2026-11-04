/**
 * Uploaded skins are a background picture only.
 * One picture is one skin. The scoreboard paints it behind the Mock-Tournament
 * board, and the round timer paints the same picture behind the Classic clock.
 * Advantage's live text and controls stay the basic-skin controls.
 *
 * Where the bytes live:
 * - Always on this device (IndexedDB), so a later class still has them.
 * - Pro Plus Cloud with GYM_MEDIA bound: also `groups/<license>/skins/<id>` in
 *   Advantage Cloud, counted against the existing bucket cap. Ten skins, a few
 *   hundred KB each, stay inside R2's free tier.
 * - A gym on its own Google Drive or OneDrive: the same folder the gym already
 *   connected, when that session can save bytes. Otherwise the skin stays on
 *   the device.
 * - Cloudflare previews have no GYM_MEDIA binding, so Advantage Cloud sync does
 *   not run there.
 */

import { shrinkImageFile, STORED_PHOTO_QUALITY } from './imageShrink.ts';

export const CUSTOM_SKIN_CAP = 10;
export const CUSTOM_SKIN_MAX_EDGE = 1920;
export const CUSTOM_SKIN_TARGET_BYTES = 380_000;
export const CUSTOM_SKIN_THUMB_EDGE = 320;
export const CUSTOM_SKIN_DELETE_FIRST = 'Delete one first';
export const CUSTOM_SKIN_TYPE_MESSAGE = 'Use a JPG, PNG, or WebP.';

const SKIN_ID = /^[a-z0-9]{8,40}$/;
const CUSTOM_VALUE = /^custom:[a-z0-9]{8,40}$/;
const ACCEPT = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type CustomSkinHome = 'advantage-cloud' | 'google-drive' | 'onedrive' | 'device';

export function isCustomSkinRecordId(value: unknown): value is string {
  return typeof value === 'string' && SKIN_ID.test(value);
}

export function isCustomSkinId(value: unknown): value is `custom:${string}` {
  return typeof value === 'string' && CUSTOM_VALUE.test(value);
}

export function customSkinRecordId(value: unknown): string | null {
  if (!isCustomSkinId(value)) return null;
  return value.slice('custom:'.length);
}

export function customSkinValue(id: string): `custom:${string}` | null {
  if (!isCustomSkinRecordId(id)) return null;
  return `custom:${id}`;
}

export function newCustomSkinId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return `skin${hex}`;
}

export function customSkinsAtCap(count: number): boolean {
  return count >= CUSTOM_SKIN_CAP;
}

/** Plus Cloud wins when the bucket is bound. A preview is unbound, so it cannot use Advantage Cloud. */
export function chooseCustomSkinHome(input: {
  plusCloud: boolean;
  cloudBound: boolean;
  driveConnected: boolean;
  oneDriveConnected: boolean;
}): CustomSkinHome {
  if (input.plusCloud && input.cloudBound) return 'advantage-cloud';
  if (input.driveConnected) return 'google-drive';
  if (input.oneDriveConnected) return 'onedrive';
  return 'device';
}

export function customSkinMime(file: { type: string; name: string }): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const type = file.type.split(';')[0]?.trim().toLowerCase() ?? '';
  if (type === 'image/jpg') return 'image/jpeg';
  if (ACCEPT.has(type)) return type as 'image/jpeg' | 'image/png' | 'image/webp';
  if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg';
  if (/\.png$/i.test(file.name)) return 'image/png';
  if (/\.webp$/i.test(file.name)) return 'image/webp';
  return null;
}

export function customSkinNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const clean = base.replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 40).trim();
  return clean || 'My skin';
}

export function cleanCustomSkinName(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim().slice(0, 40);
  return clean || 'My skin';
}

async function encodeEdge(file: File, maxEdge: number, quality: number): Promise<Blob> {
  return shrinkImageFile(file, {
    maxEdge,
    quality,
    passthroughBytes: maxEdge === CUSTOM_SKIN_MAX_EDGE ? CUSTOM_SKIN_TARGET_BYTES : 0,
    mimeFor: () => 'image/jpeg',
    fallbackMimes: ['image/webp'],
    opaqueBackground: '#10141c',
    orient: true,
    smooth: true,
  });
}

/** Scale the long edge to about 1920px and keep the file to a few hundred KB. Also builds the thumb. */
export async function prepareCustomSkinFile(file: File): Promise<{ image: Blob; thumb: Blob; mime: string } | { error: string }> {
  const mime = customSkinMime(file);
  if (!mime) return { error: CUSTOM_SKIN_TYPE_MESSAGE };
  let image = await encodeEdge(file, CUSTOM_SKIN_MAX_EDGE, STORED_PHOTO_QUALITY);
  if (image.size > CUSTOM_SKIN_TARGET_BYTES + 80_000) image = await encodeEdge(file, 1600, 0.72);
  if (image.size > CUSTOM_SKIN_TARGET_BYTES + 80_000) image = await encodeEdge(file, 1280, 0.62);
  const thumbSource = new File([image], 'skin.jpg', { type: image.type || 'image/jpeg' });
  const thumb = await shrinkImageFile(thumbSource, {
    maxEdge: CUSTOM_SKIN_THUMB_EDGE,
    quality: 0.72,
    passthroughBytes: 0,
    mimeFor: () => 'image/jpeg',
    fallbackMimes: ['image/webp'],
    opaqueBackground: '#10141c',
    orient: false,
    smooth: true,
  });
  return { image, thumb, mime: image.type || 'image/jpeg' };
}

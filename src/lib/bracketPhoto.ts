/**
 * A personal bracket photo on this phone.
 * The progress file only records that a photo exists. The image is not exported.
 */

import { shrinkImageFile } from './imageShrink.ts';
import { assertOriginRoom } from './storageQuota.ts';

export const BRACKET_PHOTO_KEY = 'matboard.studentEdition.bracketPhotos.v1';

const MAX_EDGE = 1280;
const MAX_CHARS = 180_000;

function isImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(file.name);
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

export async function bracketPhotoFromFile(file: File): Promise<string> {
  if (!isImage(file)) throw new Error('Choose a photo.');
  const blob = await shrinkImageFile(file, {
    maxEdge: MAX_EDGE,
    quality: 0.72,
    passthroughBytes: 0,
    mimeFor: () => 'image/jpeg',
    fallbackMimes: ['image/webp'],
    opaqueBackground: '#ffffff',
    orient: true,
    smooth: true,
  });
  const dataUrl = await blobToDataUrl(blob);
  if (!dataUrl.startsWith('data:image/') || dataUrl.length > MAX_CHARS) {
    throw new Error('That photo is too large for this phone.');
  }
  await assertOriginRoom(dataUrl.length);
  return dataUrl;
}

function readStore(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BRACKET_PHOTO_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const store: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.startsWith('data:image/') && value.length <= MAX_CHARS) store[id] = value;
    }
    return store;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string>): void {
  localStorage.setItem(BRACKET_PHOTO_KEY, JSON.stringify(store));
}

export function loadBracketPhotos(): Record<string, string> {
  return readStore();
}

export function replaceBracketPhotos(next: Record<string, string>): void {
  const clean: Record<string, string> = {};
  for (const [id, value] of Object.entries(next)) {
    if (typeof value === 'string' && value.startsWith('data:image/') && value.length <= MAX_CHARS) clean[id] = value;
  }
  writeStore(clean);
}

export function loadBracketPhoto(id: string): string {
  return readStore()[id] ?? '';
}

export function writeBracketPhoto(id: string, dataUrl: string): void {
  const store = readStore();
  store[id] = dataUrl;
  writeStore(store);
}

export function deleteBracketPhoto(id: string): void {
  const store = readStore();
  if (!store[id]) return;
  delete store[id];
  writeStore(store);
}

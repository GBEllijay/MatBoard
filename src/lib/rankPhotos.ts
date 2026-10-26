/**
 * Promotion photos live on this phone.
 * Send to coach copies them into the progress file when they fit.
 * A photo that does not fit stays here, and the file says so.
 * Stripe dates are not stored here. They live on the progress file as tapeDates.
 * A saved photo with no date is the normal record and must keep loading.
 */

import { shrinkImageFile } from './imageShrink.ts';
import { BLACK_DEGREE_MAX, RANK_BELTS, RANK_PHOTO_MAX_CHARS, RANK_TAPE_MAX, type RankBelt, type RankPicture } from './progress/types.ts';
import { assertOriginRoom } from './storageQuota.ts';

export const RANK_PHOTO_KEY = 'matboard.studentEdition.rankPhotos.v1';

const MAX_EDGE = 960;
const PER_BELT = 8;
const PER_TAPE = 4;

export type RankPhotoStore = {
  belts: Partial<Record<RankBelt, string[]>>;
  tapes: Partial<Record<RankBelt, string[][]>>;
  /** Kids belt photos. Kept apart from adult belt keys so White does not share a picture. */
  kidsBelts?: Record<string, string[]>;
};

const KIDS_BELT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

function slotsFor(belt: RankBelt): number {
  return belt === 'black' ? BLACK_DEGREE_MAX : RANK_TAPE_MAX;
}

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

export function emptyRankPhotoStore(): RankPhotoStore {
  return { belts: {}, tapes: {} };
}

export async function rankPhotoFromFile(file: File): Promise<string> {
  if (!isImage(file)) throw new Error('Choose a photo.');
  const blob = await shrinkImageFile(file, {
    maxEdge: MAX_EDGE,
    quality: 0.62,
    passthroughBytes: 0,
    mimeFor: () => 'image/jpeg',
    fallbackMimes: ['image/webp'],
    opaqueBackground: '#ffffff',
    orient: true,
    smooth: true,
  });
  const image = await blobToDataUrl(blob);
  if (!image.startsWith('data:image/') || image.length > RANK_PHOTO_MAX_CHARS) {
    throw new Error('That photo is too large for this phone.');
  }
  await assertOriginRoom(image.length);
  return image;
}

export function replaceRankPhotoStore(value: unknown): RankPhotoStore {
  const store = normalizeStore(value);
  writeStore(store);
  return store;
}

export function loadRankPictures(): RankPhotoStore {
  try {
    const raw = localStorage.getItem(RANK_PHOTO_KEY);
    if (!raw) return emptyRankPhotoStore();
    return normalizeStore(JSON.parse(raw) as unknown);
  } catch {
    return emptyRankPhotoStore();
  }
}

export function beltPhotos(store: RankPhotoStore, belt: RankBelt): string[] {
  return store.belts[belt] ?? [];
}

export function tapePhotos(store: RankPhotoStore, belt: RankBelt, tapeIndex: number): string[] {
  return store.tapes[belt]?.[tapeIndex] ?? [];
}

export function addBeltPhoto(store: RankPhotoStore, belt: RankBelt, image: string): RankPhotoStore {
  const current = beltPhotos(store, belt);
  if (current.length >= PER_BELT) throw new Error('That belt already has 8 photos.');
  const next = structuredClone(store);
  next.belts[belt] = [...current, image];
  writeStore(next);
  return next;
}

export function addTapePhoto(store: RankPhotoStore, belt: RankBelt, tapeIndex: number, image: string): RankPhotoStore {
  const slots = slotsFor(belt);
  if (!Number.isInteger(tapeIndex) || tapeIndex < 0 || tapeIndex >= slots) {
    throw new Error(belt === 'black' ? 'Degrees are 0 to 6.' : 'Stripes are 0 to 4.');
  }
  const current = tapePhotos(store, belt, tapeIndex);
  if (current.length >= PER_TAPE) throw new Error('That stripe already has 4 photos.');
  const next = structuredClone(store);
  const row = tapeRow(next, belt);
  row[tapeIndex] = [...current, image];
  next.tapes[belt] = row;
  writeStore(next);
  return next;
}

export function removeBeltPhoto(store: RankPhotoStore, belt: RankBelt, index: number): RankPhotoStore {
  const current = beltPhotos(store, belt);
  if (!current[index]) return store;
  const next = structuredClone(store);
  next.belts[belt] = current.filter((_, slot) => slot !== index);
  writeStore(next);
  return next;
}

export function kidsBeltPhotos(store: RankPhotoStore, beltId: string): string[] {
  return store.kidsBelts?.[beltId] ?? [];
}

export function addKidsBeltPhoto(store: RankPhotoStore, beltId: string, image: string): RankPhotoStore {
  if (!KIDS_BELT_ID.test(beltId)) throw new Error('That belt is not on this list.');
  const current = kidsBeltPhotos(store, beltId);
  if (current.length >= PER_BELT) throw new Error('That belt already has 8 photos.');
  const next = structuredClone(store);
  next.kidsBelts = { ...next.kidsBelts, [beltId]: [...current, image] };
  writeStore(next);
  return next;
}

export function removeKidsBeltPhoto(store: RankPhotoStore, beltId: string, index: number): RankPhotoStore {
  const current = kidsBeltPhotos(store, beltId);
  if (!current[index]) return store;
  const next = structuredClone(store);
  const list = current.filter((_, slot) => slot !== index);
  const kidsBelts = { ...next.kidsBelts };
  if (list.length) kidsBelts[beltId] = list;
  else delete kidsBelts[beltId];
  if (Object.keys(kidsBelts).length) next.kidsBelts = kidsBelts;
  else delete next.kidsBelts;
  writeStore(next);
  return next;
}

export function removeTapePhoto(store: RankPhotoStore, belt: RankBelt, tapeIndex: number, index: number): RankPhotoStore {
  const current = tapePhotos(store, belt, tapeIndex);
  if (!current[index]) return store;
  const next = structuredClone(store);
  const row = tapeRow(next, belt);
  row[tapeIndex] = current.filter((_, slot) => slot !== index);
  next.tapes[belt] = row;
  writeStore(next);
  return next;
}

/** Stable order: each belt, then that belt's stripes, white through black. */
export function picturesFromStore(store: RankPhotoStore): RankPicture[] {
  const pictures: RankPicture[] = [];
  for (const belt of RANK_BELTS) {
    for (const image of beltPhotos(store, belt)) pictures.push({ belt, image });
    for (let tapeIndex = 0; tapeIndex < slotsFor(belt); tapeIndex += 1) {
      for (const image of tapePhotos(store, belt, tapeIndex)) pictures.push({ belt, tapeIndex, image });
    }
  }
  return pictures;
}

function tapeRow(store: RankPhotoStore, belt: RankBelt): string[][] {
  const current = store.tapes[belt];
  const slots = slotsFor(belt);
  const row: string[][] = [];
  for (let index = 0; index < slots; index += 1) row.push([...(current?.[index] ?? [])]);
  return row;
}

function writeStore(store: RankPhotoStore): void {
  localStorage.setItem(RANK_PHOTO_KEY, JSON.stringify(store));
}

function normalizeStore(value: unknown): RankPhotoStore {
  const store = emptyRankPhotoStore();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return store;
  const record = value as { belts?: unknown; tapes?: unknown; kidsBelts?: unknown };
  const belts = record.belts;
  const tapes = record.tapes;
  if (belts && typeof belts === 'object' && !Array.isArray(belts)) {
    for (const belt of RANK_BELTS) {
      const list = (belts as Record<string, unknown>)[belt];
      const images = cleanList(list).slice(0, PER_BELT);
      if (images.length) store.belts[belt] = images;
    }
  }
  if (tapes && typeof tapes === 'object' && !Array.isArray(tapes)) {
    for (const belt of RANK_BELTS) {
      const row = (tapes as Record<string, unknown>)[belt];
      if (!Array.isArray(row)) continue;
      const tapesForBelt: string[][] = [];
      for (let index = 0; index < slotsFor(belt); index += 1) {
        tapesForBelt[index] = cleanList(row[index]).slice(0, PER_TAPE);
      }
      if (tapesForBelt.some((list) => list.length)) store.tapes[belt] = tapesForBelt;
    }
  }
  const kidsBelts = record.kidsBelts;
  if (kidsBelts && typeof kidsBelts === 'object' && !Array.isArray(kidsBelts)) {
    const kept: Record<string, string[]> = {};
    for (const [beltId, list] of Object.entries(kidsBelts as Record<string, unknown>)) {
      if (!KIDS_BELT_ID.test(beltId)) continue;
      const images = cleanList(list).slice(0, PER_BELT);
      if (images.length) kept[beltId] = images;
    }
    if (Object.keys(kept).length) store.kidsBelts = kept;
  }
  return store;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && item.startsWith('data:image/') && item.length <= RANK_PHOTO_MAX_CHARS,
  );
}

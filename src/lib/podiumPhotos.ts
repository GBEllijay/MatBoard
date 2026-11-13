/**
 * Podium pictures for one competition result, on this phone only.
 *
 * Keyed by the student file id and the result id, so a new result, a reordered
 * list, or another student does not pick up someone else's pictures.
 * Same shrink as a belt photo: longest edge 960, JPEG quality 0.62, at most
 * 48,000 characters. At most 8 pictures on one result, the same cap as photos
 * on one belt. They are not written into the progress file or the coach file.
 * A student packet includes them when they are saved on this phone.
 */

import { localPhotoError } from './localPhotoError.ts';
import { RANK_PHOTO_MAX_CHARS } from './progress/types.ts';
import { rankPhotoFromFile } from './rankPhotos.ts';

export const PODIUM_PHOTO_KEY = 'matboard.studentEdition.podiumPhotos.v1';
/** Same number as belt promotion photos. */
export const PODIUM_PHOTO_MAX = 8;
const ID_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,96}$/;

export type PodiumPhotoStore = {
  byStudent: Record<string, Record<string, string[]>>;
};

const listeners = new Set<() => void>();

export function subscribePodiumPhotos(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function podiumStudentKey(studentId: string): string {
  const id = studentId.trim();
  if (!ID_OK.test(id)) throw new Error('That student file cannot keep photos.');
  return id;
}

export async function podiumPhotoFromFile(file: File): Promise<string> {
  return rankPhotoFromFile(file);
}

/** Slot limits stay their own sentences. Shrink failures use the shared photo words. */
export function podiumPhotoError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;
    if (
      message === 'Choose a photo.' ||
      message.startsWith('That result') ||
      message.startsWith('That student') ||
      message.startsWith('That photo')
    ) {
      return message;
    }
  }
  return localPhotoError(error, 'photo');
}

export function emptyPodiumPhotoStore(): PodiumPhotoStore {
  return { byStudent: {} };
}

export function loadPodiumPhotoStore(): PodiumPhotoStore {
  try {
    const raw = localStorage.getItem(PODIUM_PHOTO_KEY);
    if (!raw) return emptyPodiumPhotoStore();
    return normalizeStore(JSON.parse(raw) as unknown);
  } catch {
    return emptyPodiumPhotoStore();
  }
}

export function podiumPhotos(studentId: string, resultId: string): string[] {
  if (!ID_OK.test(studentId.trim()) || !ID_OK.test(resultId)) return [];
  return loadPodiumPhotoStore().byStudent[studentId.trim()]?.[resultId] ?? [];
}

export function addPodiumPhoto(studentId: string, resultId: string, image: string): string[] {
  const student = podiumStudentKey(studentId);
  if (!ID_OK.test(resultId)) throw new Error('That result cannot keep photos.');
  if (!image.startsWith('data:image/') || image.length > RANK_PHOTO_MAX_CHARS) {
    throw new Error('That photo is too large for this phone.');
  }
  const store = loadPodiumPhotoStore();
  const current = store.byStudent[student]?.[resultId] ?? [];
  if (current.length >= PODIUM_PHOTO_MAX) throw new Error('That result already has 8 photos.');
  const next = [...current, image];
  writeResult(store, student, resultId, next);
  return next;
}

export function removePodiumPhoto(studentId: string, resultId: string, index: number): string[] {
  const student = podiumStudentKey(studentId);
  if (!ID_OK.test(resultId)) return [];
  const store = loadPodiumPhotoStore();
  const current = store.byStudent[student]?.[resultId] ?? [];
  if (!current[index]) return current;
  const next = current.filter((_, slot) => slot !== index);
  writeResult(store, student, resultId, next);
  return next;
}

/** Drop pictures when that result is removed. Other results stay. */
export function forgetPodiumPhotos(studentId: string, resultId: string): void {
  if (!ID_OK.test(studentId.trim()) || !ID_OK.test(resultId)) return;
  const store = loadPodiumPhotoStore();
  const student = studentId.trim();
  if (!store.byStudent[student]?.[resultId]) return;
  writeResult(store, student, resultId, []);
}

function writeResult(store: PodiumPhotoStore, student: string, resultId: string, photos: string[]): void {
  const results = { ...store.byStudent[student] };
  if (photos.length) results[resultId] = photos;
  else delete results[resultId];
  if (Object.keys(results).length) store.byStudent[student] = results;
  else delete store.byStudent[student];
  localStorage.setItem(PODIUM_PHOTO_KEY, JSON.stringify(store));
  emit();
}

function normalizeStore(value: unknown): PodiumPhotoStore {
  const store = emptyPodiumPhotoStore();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return store;
  const byStudent = (value as { byStudent?: unknown }).byStudent;
  if (!byStudent || typeof byStudent !== 'object' || Array.isArray(byStudent)) return store;
  for (const [studentId, results] of Object.entries(byStudent as Record<string, unknown>)) {
    if (!ID_OK.test(studentId) || !results || typeof results !== 'object' || Array.isArray(results)) continue;
    const kept: Record<string, string[]> = {};
    for (const [resultId, list] of Object.entries(results as Record<string, unknown>)) {
      if (!ID_OK.test(resultId)) continue;
      const images = cleanList(list);
      if (images.length) kept[resultId] = images;
    }
    if (Object.keys(kept).length) store.byStudent[studentId] = kept;
  }
  return store;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.startsWith('data:image/') && item.length <= RANK_PHOTO_MAX_CHARS)
    .slice(0, PODIUM_PHOTO_MAX);
}

/**
 * Gym logo on the student's phone.
 * Separate from the Media Console logo so a student can replace or remove
 * a logo they received without changing the coach's saved mark.
 */

import { shrinkImageFile } from './imageShrink.ts';
import { coachGymLogoFits } from './coachGymFit.ts';
import { isStorageQuotaError, StorageQuotaError } from './storageQuota.ts';

export const STUDENT_GYM_LOGO_KEY = 'matboard.studentGymLogo.v1';

const MAX_EDGE = 512;

type GymLogoRecord = { version: 1; dataUrl: string };

type Store = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

function defaultStorage(): Store | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readRecord(storage: Pick<Storage, 'getItem'> | null): GymLogoRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STUDENT_GYM_LOGO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GymLogoRecord>;
    if (parsed.version !== 1 || typeof parsed.dataUrl !== 'string' || !coachGymLogoFits(parsed.dataUrl)) return null;
    return { version: 1, dataUrl: parsed.dataUrl };
  } catch {
    return null;
  }
}

export function readStudentGymLogo(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): string | null {
  return readRecord(storage)?.dataUrl ?? null;
}

export function writeStudentGymLogo(dataUrl: string, storage: Store | null = defaultStorage()): void {
  if (!coachGymLogoFits(dataUrl)) throw new Error('too-large');
  if (!storage) return;
  const record: GymLogoRecord = { version: 1, dataUrl };
  try {
    storage.setItem(STUDENT_GYM_LOGO_KEY, JSON.stringify(record));
  } catch (error) {
    if (isStorageQuotaError(error)) throw new StorageQuotaError(0);
    throw error;
  }
}

export function clearStudentGymLogo(storage: Store | null = defaultStorage()): void {
  try {
    if (storage?.removeItem) storage.removeItem(STUDENT_GYM_LOGO_KEY);
    else storage?.setItem(STUDENT_GYM_LOGO_KEY, '');
  } catch {
    /* private mode */
  }
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

async function shrinkLogo(file: File): Promise<Blob> {
  return shrinkImageFile(file, {
    maxEdge: MAX_EDGE,
    quality: 0.86,
    passthroughBytes: 180_000,
    mimeFor: (source) => (source.type === 'image/png' || source.type === 'image/webp' ? source.type : 'image/jpeg'),
  });
}

/** Save a picked photo as the student's gym logo. Returns the stored data URL. */
export async function saveStudentGymLogoFile(file: File, storage: Store | null = defaultStorage()): Promise<string> {
  if (!isImageFile(file)) throw new Error('not-image');
  const dataUrl = await blobToDataUrl(await shrinkLogo(file));
  if (!coachGymLogoFits(dataUrl)) throw new Error('too-large');
  writeStudentGymLogo(dataUrl, storage);
  return dataUrl;
}

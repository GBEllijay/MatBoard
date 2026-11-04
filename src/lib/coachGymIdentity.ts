/**
 * The ids a coach phone signs coach → student packets with, so a student who
 * left this gym can refuse them. License id first, then the gym's own
 * Google Drive / OneDrive folders. Reads only; nothing is changed.
 */

import { readGymIds } from './coachGymFit.ts';
import { licenseIdFromStoredToken } from './studentInboxClient.ts';
import type { CoachGymBrand } from './progress/types.ts';

const GOOGLE_BINDING_KEY = 'matboard.pro.googleDriveFolder.v1';
const ONEDRIVE_BINDING_KEY = 'matboard.pro.oneDriveFolder.v1';

type Reader = Pick<Storage, 'getItem'>;

function folderOf(storage: Reader, key: string): string {
  try {
    const raw = storage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as { folderId?: unknown }) : null;
    return typeof parsed?.folderId === 'string' ? `folder:${parsed.folderId}` : '';
  } catch {
    return '';
  }
}

function defaultStorage(): Reader | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function coachGymIds(storage: Reader | null = defaultStorage()): string[] {
  if (!storage) return [];
  let license = '';
  try {
    license = licenseIdFromStoredToken(storage) ?? '';
  } catch {
    license = '';
  }
  return readGymIds([license, folderOf(storage, GOOGLE_BINDING_KEY), folderOf(storage, ONEDRIVE_BINDING_KEY)]);
}

/** Copy of the packet with the coach gym's ids on `gym`. No ids, no change. */
export function stampGymIds<T extends { gym?: CoachGymBrand }>(packet: T, ids: readonly string[] = coachGymIds()): T {
  const clean = readGymIds([...ids]);
  if (!clean.length) return packet;
  const gym: CoachGymBrand = packet.gym ? { ...packet.gym, ids: clean } : { name: '', ids: clean };
  return { ...packet, gym };
}

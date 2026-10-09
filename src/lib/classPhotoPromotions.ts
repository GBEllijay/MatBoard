/**
 * Today's class photo / promotions on Advantage Coach Unlimited
 * (Daily Lesson Plan, below Upload for instructor distribution).
 *
 * Local key: IndexedDB database `matboard-class-photo-promotions`,
 * object store `items`. One row is one photo or video for a lesson date.
 * The phone copy stays so the section can preview it offline.
 *
 * Drive folder: `{connected root}/{YYYY-MM-DD}/class-photos/`
 * (`CLASS_PHOTOS_FOLDER`). That date bucket already exists for class history.
 * File names start with `advantage-class-photo-promotions-`.
 * `appProperties.advantage` is `class-photo-promotions`
 * (`CLASS_PHOTO_PROMOTIONS_ROLE`).
 * Bytes go to the gym's Google Drive, not to an Advantage server.
 *
 * Capture reuses Gallery / Daily Training inputs: Take photo
 * (`image/*` + capture), Record (`video/*` + capture), and Pick from gallery
 * (`image/*,video/*`, no capture).
 */

import { shrinkPhotoForStore } from './imageShrink.ts';
import {
  CLASS_PHOTO_PROMOTIONS_ROLE,
  publishClassPhotoPromotions,
  type ClassPhotoPromotionUpload,
} from './googleDrive.ts';
import { isAcceptedVideoFile } from './photoStore.ts';
import { assertOriginRoom, isStorageQuotaError, StorageQuotaError } from './storageQuota.ts';

export const CLASS_PHOTO_PROMOTIONS_DB = 'matboard-class-photo-promotions';
export const CLASS_PHOTO_PROMOTIONS_STORE = 'items';

export const CLASS_PHOTO_PROMOTIONS_LABEL = "Today's class photo / promotions";
export const CLASS_PHOTO_PROMOTIONS_ADD = 'Add photo or video';
export const CLASS_PHOTO_PROMOTIONS_LEAD =
  'A class photo or a short clip. Take photo, Record, or Pick from gallery.';
export const CLASS_PHOTO_PROMOTIONS_STAY =
  "Photos and clips stay on this phone. When the gym Google Drive folder is connected, a copy goes in today's class-photos folder. Advantage does not host them.";
export const CLASS_PHOTO_PROMOTIONS_SAVED_DRIVE =
  "Saved in today's class-photos folder on Google Drive. A copy stays on this phone.";
export const CLASS_PHOTO_PROMOTIONS_SAVED_PHONE =
  "Saved on this phone. Connect the gym Google Drive folder to copy it into today's class-photos folder.";
export const CLASS_PHOTO_PROMOTIONS_FAILED =
  'Saved on this phone. Google Drive could not take this file.';
export const CLASS_PHOTO_PROMOTIONS_SKIPPED =
  'That file is not a photo or video. Take photo, Record, or pick a photo or video from the gallery.';

const DB_VERSION = 1;

export type ClassPhotoPromotionKind = 'photo' | 'video';

export type ClassPhotoPromotionItem = {
  id: string;
  dateKey: string;
  name: string;
  mime: string;
  kind: ClassPhotoPromotionKind;
  blob: Blob;
  addedAt: number;
  driveFileId: string | null;
};

export type AddClassPhotoPromotionsResult = {
  saved: number;
  uploaded: number;
  failed: number;
  skipped: number;
  needsDrive: boolean;
};

export function classPhotoPromotionKind(file: File): ClassPhotoPromotionKind | null {
  if (isAcceptedVideoFile(file)) return 'video';
  if (file.type.startsWith('image/')) return 'photo';
  if (/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) return 'photo';
  return null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This phone cannot store that file.'));
      return;
    }
    const req = indexedDB.open(CLASS_PHOTO_PROMOTIONS_DB, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CLASS_PHOTO_PROMOTIONS_STORE)) {
        db.createObjectStore(CLASS_PHOTO_PROMOTIONS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function isItem(value: unknown): value is ClassPhotoPromotionItem {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<ClassPhotoPromotionItem>;
  return (
    typeof row.id === 'string' &&
    typeof row.dateKey === 'string' &&
    typeof row.name === 'string' &&
    typeof row.mime === 'string' &&
    (row.kind === 'photo' || row.kind === 'video') &&
    row.blob instanceof Blob &&
    typeof row.addedAt === 'number'
  );
}

export async function getClassPhotoPromotion(id: string): Promise<ClassPhotoPromotionItem | null> {
  if (!id) return null;
  const db = await openDb();
  const row = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(CLASS_PHOTO_PROMOTIONS_STORE, 'readonly');
    const req = tx.objectStore(CLASS_PHOTO_PROMOTIONS_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return isItem(row) ? row : null;
}

export async function listClassPhotoPromotions(dateKey: string): Promise<ClassPhotoPromotionItem[]> {
  const db = await openDb();
  const raw = await new Promise<unknown[]>((resolve, reject) => {
    const tx = db.transaction(CLASS_PHOTO_PROMOTIONS_STORE, 'readonly');
    const req = tx.objectStore(CLASS_PHOTO_PROMOTIONS_STORE).getAll();
    req.onsuccess = () => resolve((req.result as unknown[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  return raw
    .filter(isItem)
    .filter((item) => item.dateKey === dateKey)
    .sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id));
}

async function putItem(item: ClassPhotoPromotionItem): Promise<void> {
  await assertOriginRoom(item.blob.size);
  try {
    const db = await openDb();
    const tx = db.transaction(CLASS_PHOTO_PROMOTIONS_STORE, 'readwrite');
    tx.objectStore(CLASS_PHOTO_PROMOTIONS_STORE).put(item);
    await txDone(tx);
  } catch (error) {
    if (error instanceof StorageQuotaError) throw error;
    if (isStorageQuotaError(error)) throw new StorageQuotaError(0);
    throw error;
  }
}

async function setDriveFileId(id: string, driveFileId: string): Promise<void> {
  const db = await openDb();
  const existing = await new Promise<ClassPhotoPromotionItem | undefined>((resolve, reject) => {
    const tx = db.transaction(CLASS_PHOTO_PROMOTIONS_STORE, 'readonly');
    const req = tx.objectStore(CLASS_PHOTO_PROMOTIONS_STORE).get(id);
    req.onsuccess = () => resolve(req.result as ClassPhotoPromotionItem | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!existing) return;
  existing.driveFileId = driveFileId;
  const tx = db.transaction(CLASS_PHOTO_PROMOTIONS_STORE, 'readwrite');
  tx.objectStore(CLASS_PHOTO_PROMOTIONS_STORE).put(existing);
  await txDone(tx);
}

/**
 * Keep each photo or video on this phone, then copy it into
 * `{date}/class-photos/` when Drive is connected.
 */
export async function addClassPhotoPromotionFiles(
  dateKey: string,
  files: readonly File[],
): Promise<AddClassPhotoPromotionsResult> {
  const saved: ClassPhotoPromotionItem[] = [];
  let skipped = 0;
  for (const file of files) {
    const kind = classPhotoPromotionKind(file);
    if (!kind || file.size <= 0) {
      skipped += 1;
      continue;
    }
    const bytes = kind === 'photo' ? await shrinkPhotoForStore(file) : file;
    const mime = bytes.type || file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg');
    const item: ClassPhotoPromotionItem = {
      id: crypto.randomUUID(),
      dateKey,
      name: file.name.trim() || (kind === 'video' ? 'Class clip' : 'Class photo'),
      mime,
      kind,
      blob: bytes,
      addedAt: Date.now(),
      driveFileId: null,
    };
    await putItem(item);
    saved.push(item);
  }
  if (!saved.length) {
    return { saved: 0, uploaded: 0, failed: 0, skipped, needsDrive: false };
  }
  const uploads: ClassPhotoPromotionUpload[] = saved.map((item) => ({
    localId: item.id,
    name: item.name,
    mime: item.mime,
    bytes: item.blob,
    kind: item.kind,
  }));
  const results = await publishClassPhotoPromotions({ dateKey, items: uploads });
  if (!results) {
    return { saved: saved.length, uploaded: 0, failed: 0, skipped, needsDrive: true };
  }
  let uploaded = 0;
  let failed = 0;
  for (const result of results) {
    if (result.failed || !result.driveFileId) {
      failed += 1;
      continue;
    }
    uploaded += 1;
    await setDriveFileId(result.localId, result.driveFileId);
  }
  return { saved: saved.length, uploaded, failed, skipped, needsDrive: false };
}

export { CLASS_PHOTO_PROMOTIONS_ROLE };

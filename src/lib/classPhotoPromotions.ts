/**
 * Today's class photo / promotions on Advantage Coach Unlimited
 * (Daily Lesson Plan, below Upload for instructor distribution).
 *
 * Local key: IndexedDB database `matboard-class-photo-promotions`,
 * object store `items`. One row is one photo or video for a lesson date.
 * The phone copy stays so the section can preview it offline.
 *
 * Shared copy: `gallery/approved/{date}/` when approval is off, or
 * `gallery/pending/{date}/` when approval is on. A short video uses that
 * same gallery path. It does not go in `videos/daily` or `class-photos`.
 * The phone keeps a copy. An approved item is also added to the local Gallery
 * so the slideshow can play it. Advantage does not host the bytes here.
 *
 * Capture reuses Gallery / Daily Training inputs: Take photo
 * (`image/*` + capture), Record (`video/*` + capture), and Pick from gallery
 * (`image/*,video/*`, no capture).
 */

import { shrinkPhotoForStore } from './imageShrink.ts';
import { publishGymFile } from './gymPublish.ts';
import { GALLERY_ROUTE_NOTE } from './gymTree.ts';
import { CLASS_PHOTO_PROMOTIONS_ROLE } from './googleDrive.ts';
import { addFolderFiles, isAcceptedVideoFile } from './photoStore.ts';
import { assertOriginRoom, isStorageQuotaError, StorageQuotaError } from './storageQuota.ts';

export const CLASS_PHOTO_PROMOTIONS_DB = 'matboard-class-photo-promotions';
export const CLASS_PHOTO_PROMOTIONS_STORE = 'items';

export const CLASS_PHOTO_PROMOTIONS_LABEL = "Today's class photo / promotions";
export const CLASS_PHOTO_PROMOTIONS_ADD = 'Add photo or video';
export const CLASS_PHOTO_PROMOTIONS_LEAD =
  'A class photo or a short clip. Take photo, Record, or Pick from gallery.';
export const CLASS_PHOTO_PROMOTIONS_STAY = `${GALLERY_ROUTE_NOTE} Photos and clips stay on this phone. When Google Drive or OneDrive is connected, the copy goes in the gallery folder there. Advantage does not host them.`;
export const CLASS_PHOTO_PROMOTIONS_SAVED_DRIVE =
  'Saved in the gallery folder. A copy stays on this phone.';
export const CLASS_PHOTO_PROMOTIONS_SAVED_PHONE =
  'Saved on this phone. Connect Google Drive or OneDrive to use the same gallery on another device.';
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
  let uploaded = 0;
  let failed = 0;
  let needsDrive = true;
  for (const item of saved) {
    const published = await publishGymFile({
      purpose: 'gallery',
      role: 'owner',
      kind: item.kind,
      dateKey,
      fileName: item.name,
      bytes: item.blob,
      mime: item.mime,
    });
    if (published.route.ok && published.route.lane !== 'pending') {
      try {
        const file = new File([item.blob], item.name, { type: item.mime });
        await addFolderFiles([file], 'gallery');
      } catch {
        /* The class-photo copy on this phone is already stored. */
      }
    }
    if (!published.route.ok || published.home === 'phone') continue;
    needsDrive = false;
    if (published.failed || !published.remoteId) {
      failed += 1;
      continue;
    }
    uploaded += 1;
    await setDriveFileId(item.id, published.remoteId);
  }
  return { saved: saved.length, uploaded, failed, skipped, needsDrive: needsDrive && uploaded === 0 && failed === 0 };
}

export { CLASS_PHOTO_PROMOTIONS_ROLE };

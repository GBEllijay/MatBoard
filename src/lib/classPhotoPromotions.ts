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
 * so the slideshow can play it. When the gym has Advantage Cloud, the shared
 * copy is gallery/{approved|pending}/{date}/ on Cloud. The phone copy stays.
 * Drive and OneDrive still take the copy when Cloud is off.
 *
 * Capture reuses Gallery / Daily Training inputs: Take photo
 * (`image/*` + capture), Record (`video/*` + capture), and Pick from gallery
 * (`image/*,video/*`, no capture).
 */

import { gymActorForCloud } from './advantageCloudMedia.ts';
import { galleryHoldExpired, playsInGallery } from './galleryApproval.ts';
import { readGalleryApprovalHere } from './galleryApprovalDefault.ts';
import { shrinkPhotoForStore } from './imageShrink.ts';
import { publishGymFile } from './gymPublish.ts';
import { GALLERY_ROUTE_NOTE, type GymActor } from './gymTree.ts';
import { readCurrentSeat } from './instructorSeats.ts';
import { CLASS_PHOTO_PROMOTIONS_ROLE } from './googleDrive.ts';
import { addFolderFiles, isAcceptedVideoFile } from './photoStore.ts';
import { assertOriginRoom, isStorageQuotaError, StorageQuotaError } from './storageQuota.ts';

export const CLASS_PHOTO_PROMOTIONS_DB = 'matboard-class-photo-promotions';
export const CLASS_PHOTO_PROMOTIONS_STORE = 'items';

export const CLASS_PHOTO_PROMOTIONS_LABEL = "Today's class photo / promotions";
export const CLASS_PHOTO_PROMOTIONS_ADD = 'Add photo or video';
export const CLASS_PHOTO_PROMOTIONS_LEAD =
  'A class photo or a short clip. Take photo, Record, or Pick from gallery.';
export const CLASS_PHOTO_PROMOTIONS_STAY = `${GALLERY_ROUTE_NOTE} Photos and clips stay on this phone. With Advantage Cloud on, they upload to this gym's Advantage Cloud. Without Cloud, when Google Drive or OneDrive is connected, the copy goes in the gallery folder there, and Advantage does not host them.`;
export const CLASS_PHOTO_PROMOTIONS_SAVED_DRIVE =
  'Saved in the gallery folder. A copy stays on this phone.';
export const CLASS_PHOTO_PROMOTIONS_SAVED_PHONE =
  'Saved on this phone. Connect Google Drive or OneDrive to use the same gallery on another device.';
export const CLASS_PHOTO_PROMOTIONS_FAILED =
  'Saved on this phone. Google Drive could not take this file.';
export const CLASS_PHOTO_CLOUD_UPLOADED = 'Uploaded to Advantage Cloud.';
export const CLASS_PHOTO_CLOUD_FAILED = 'Saved on this phone. Advantage Cloud could not take this file.';
export const CLASS_PHOTO_CLOUD_STAY = `${GALLERY_ROUTE_NOTE} Uploaded to Advantage Cloud. The owner's photos are Approved. When Cloud approval is on, Coach and Instructors photos are Pending until the owner or an Instructors seat approves them. When the owner turns Cloud approval off, those photos go straight to the gallery.`;
export const CLASS_PHOTO_PROMOTIONS_SKIPPED =
  'That file is not a photo or video. Take photo, Record, or pick a photo or video from the gallery.';

const DB_VERSION = 1;

export type ClassPhotoPromotionKind = 'photo' | 'video';
export type ClassPhotoLane = 'pending' | 'approved' | 'rejected';

export type ClassPhotoPromotionItem = {
  id: string;
  dateKey: string;
  name: string;
  mime: string;
  kind: ClassPhotoPromotionKind;
  blob: Blob;
  addedAt: number;
  driveFileId: string | null;
  /** Missing on rows saved before the gallery switch. Those stay approved. */
  lane?: ClassPhotoLane;
};

export type AddClassPhotoPromotionsResult = {
  saved: number;
  uploaded: number;
  failed: number;
  skipped: number;
  needsDrive: boolean;
  cloud: boolean;
  lane: ClassPhotoLane | null;
};

/** Cloud gyms say where the photo landed. A gym without Cloud keeps the phone and Drive lines. */
export function classPhotoResultNote(input: {
  cloud: boolean;
  lane: ClassPhotoLane | null;
  failed: boolean;
  needsDrive: boolean;
}): string {
  if (input.cloud && input.failed) return CLASS_PHOTO_CLOUD_FAILED;
  if (input.cloud && input.lane && !input.failed) {
    const status = input.lane === 'approved' ? 'Approved' : input.lane === 'pending' ? 'Pending' : 'Rejected';
    return `${CLASS_PHOTO_CLOUD_UPLOADED} ${status}.`;
  }
  if (input.failed) return CLASS_PHOTO_PROMOTIONS_FAILED;
  if (input.needsDrive) return CLASS_PHOTO_PROMOTIONS_SAVED_PHONE;
  return CLASS_PHOTO_PROMOTIONS_SAVED_DRIVE;
}

/** Device and Drive gallery: what the approval switch on this device does right now. */
export const CLASS_PHOTO_APPROVAL_ON =
  'Approval is on: new photos and clips wait as Pending until the owner or a named approver approves them in Review Inbox.';
export const CLASS_PHOTO_APPROVAL_OFF = 'Approval is off: new photos and clips go straight to the gallery.';
/** Cloud lane follows the owner's gym-wide setting, not this phone's local switch. */
export const CLASS_PHOTO_CLOUD_RULE = 'The owner sets Cloud approval on Advantage Pro Plus Cloud. That gym-wide setting, not the switch on this phone, decides whether instructor Cloud uploads wait. The switch on this phone still only governs photos that stay here or go to Google Drive or OneDrive.';

/**
 * `approvalRequired` is the gallery approval switch as this device reads it.
 * Omit it to keep the older copy.
 */
export function classPhotoStayCopy(cloudOn: boolean, approvalRequired?: boolean): string {
  if (cloudOn) return approvalRequired === undefined ? CLASS_PHOTO_CLOUD_STAY : `${CLASS_PHOTO_CLOUD_STAY} ${CLASS_PHOTO_CLOUD_RULE}`;
  if (approvalRequired === undefined) return CLASS_PHOTO_PROMOTIONS_STAY;
  return `${CLASS_PHOTO_PROMOTIONS_STAY} ${approvalRequired ? CLASS_PHOTO_APPROVAL_ON : CLASS_PHOTO_APPROVAL_OFF}`;
}

function classPhotoActor(): GymActor {
  try {
    const seat = readCurrentSeat();
    if (!seat) return 'owner';
    return gymActorForCloud('seat', seat.presetId);
  } catch {
    return 'owner';
  }
}

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

export function classPhotoLane(item: Pick<ClassPhotoPromotionItem, 'lane'>): ClassPhotoLane {
  if (item.lane === 'pending' || item.lane === 'rejected' || item.lane === 'approved') return item.lane;
  return 'approved';
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

export async function listPendingClassPhotos(): Promise<ClassPhotoPromotionItem[]> {
  await purgeExpiredClassPhotos().catch(() => 0);
  const db = await openDb();
  const raw = await new Promise<unknown[]>((resolve, reject) => {
    const tx = db.transaction(CLASS_PHOTO_PROMOTIONS_STORE, 'readonly');
    const req = tx.objectStore(CLASS_PHOTO_PROMOTIONS_STORE).getAll();
    req.onsuccess = () => resolve((req.result as unknown[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  return raw.filter(isItem).filter((item) => classPhotoLane(item) === 'pending');
}

export async function listClassPhotoPromotions(dateKey: string): Promise<ClassPhotoPromotionItem[]> {
  await purgeExpiredClassPhotos().catch(() => 0);
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

async function deleteItem(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CLASS_PHOTO_PROMOTIONS_STORE, 'readwrite');
  tx.objectStore(CLASS_PHOTO_PROMOTIONS_STORE).delete(id);
  await txDone(tx);
}

/** Drop pending and rejected copies older than a month. Approved items stay. */
export async function purgeExpiredClassPhotos(now = Date.now()): Promise<number> {
  const db = await openDb();
  const raw = await new Promise<unknown[]>((resolve, reject) => {
    const tx = db.transaction(CLASS_PHOTO_PROMOTIONS_STORE, 'readonly');
    const req = tx.objectStore(CLASS_PHOTO_PROMOTIONS_STORE).getAll();
    req.onsuccess = () => resolve((req.result as unknown[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  const expired = raw.filter(isItem).filter((item) => {
    const lane = classPhotoLane(item);
    return (lane === 'pending' || lane === 'rejected') && galleryHoldExpired(item.addedAt, now);
  });
  for (const item of expired) await deleteItem(item.id);
  return expired.length;
}

export async function setClassPhotoLane(id: string, lane: ClassPhotoLane): Promise<void> {
  const existing = await getClassPhotoPromotion(id);
  if (!existing) return;
  existing.lane = lane;
  await putItem(existing);
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
    return { saved: 0, uploaded: 0, failed: 0, skipped, needsDrive: false, cloud: false, lane: null };
  }
  const approvalRequired = readGalleryApprovalHere(typeof localStorage === 'undefined' ? null : localStorage).required;
  let uploaded = 0;
  let failed = 0;
  let needsDrive = true;
  let cloud = false;
  let lane: ClassPhotoLane | null = null;
  const role = classPhotoActor();
  for (const item of saved) {
    item.lane = approvalRequired ? 'pending' : 'approved';
    await putItem(item);
    const published = await publishGymFile({
      purpose: 'gallery',
      role,
      kind: item.kind,
      dateKey,
      fileName: item.name,
      bytes: item.blob,
      mime: item.mime,
      approvalRequired,
    });
    if (published.home === 'advantage-cloud') {
      cloud = true;
      if (published.route.ok && published.route.lane) {
        lane = published.route.lane;
        item.lane = published.route.lane;
        await putItem(item);
      }
    }
    if (published.route.ok && playsInGallery(published.route.lane)) {
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
  return {
    saved: saved.length,
    uploaded,
    failed,
    skipped,
    needsDrive: needsDrive && uploaded === 0 && failed === 0,
    cloud,
    lane,
  };
}

export { CLASS_PHOTO_PROMOTIONS_ROLE };

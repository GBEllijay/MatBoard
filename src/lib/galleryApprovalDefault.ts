/**
 * Gallery approval starts on for an Advantage Pro Plus Cloud owner who has never
 * saved a choice on this device. The owner can still turn it off, and a saved
 * choice (on or off) is never flipped. Seats and other passes keep the old default (off).
 */
import { readGalleryApproval, type GalleryApprovalSettings } from './galleryApproval.ts';
import { proPlusCloudUnlocked } from './proPlusCloud.ts';

type MemoryStore = { getItem: (key: string) => string | null };

export function galleryApprovalDefaultOn(cloudOwner: () => boolean = proPlusCloudUnlocked): boolean {
  try {
    return cloudOwner();
  } catch {
    return false;
  }
}

/** Same as readGalleryApproval, with the Pro Plus Cloud owner default. */
export function readGalleryApprovalHere(
  storage: MemoryStore | null | undefined,
  cloudOwner: () => boolean = proPlusCloudUnlocked,
): GalleryApprovalSettings {
  return readGalleryApproval(storage, galleryApprovalDefaultOn(cloudOwner));
}

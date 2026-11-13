/**
 * One switch for the license: require approval before a class photo or
 * short clip plays in the gallery. The owner turns it on when issuing
 * instructor seats, and the owner or an instructor seat can change it later.
 * Approvers are the owner plus anyone the owner names. A student never approves.
 */

export const GALLERY_APPROVAL_KEY = 'matboard.gym.galleryApproval.v1';

export const REQUIRE_APPROVAL_LABEL =
  'Require approval before photos and videos go to the gallery, and before Record for Review clips or notes reach students.';

export const APPROVAL_WAITING = 'Photos and videos are waiting for approval.';

export const APPROVAL_DAY_LINK = 'Open Review Inbox';

/** Review Inbox, where GalleryReviewQueue shows pending photos and clips. */
export const GALLERY_REVIEW_PATH = '/review';

/** Link under the owner's gallery approval switch. `null` while the count loads. */
export function pendingPhotosLabel(count: number | null): string {
  return count == null ? 'Pending photos' : `Pending photos (${count})`;
}

/** Rejected and still-unapproved items are removed after this long. Approved items stay. */
export const GALLERY_HOLD_MS = 30 * 24 * 60 * 60 * 1000;

export type GalleryApprovalSettings = {
  required: boolean;
  approverSeatIds: string[];
};

const EMPTY: GalleryApprovalSettings = { required: false, approverSeatIds: [] };

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
};

/**
 * `defaultRequired` applies only when nothing was ever saved on this device.
 * A saved choice, on or off, always wins.
 */
export function readGalleryApproval(storage: MemoryStore | null | undefined, defaultRequired = false): GalleryApprovalSettings {
  if (!storage) return EMPTY;
  try {
    const raw = storage.getItem(GALLERY_APPROVAL_KEY);
    if (!raw) return defaultRequired ? { required: true, approverSeatIds: [] } : EMPTY;
    const parsed = JSON.parse(raw) as Partial<GalleryApprovalSettings>;
    const ids = Array.isArray(parsed.approverSeatIds)
      ? parsed.approverSeatIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).slice(0, 40)
      : [];
    return { required: parsed.required === true, approverSeatIds: ids };
  } catch {
    return EMPTY;
  }
}

export function writeGalleryApproval(
  storage: Pick<MemoryStore, 'setItem'> | null | undefined,
  settings: GalleryApprovalSettings,
): void {
  storage?.setItem?.(GALLERY_APPROVAL_KEY, JSON.stringify({
    required: settings.required === true,
    approverSeatIds: settings.approverSeatIds.filter(Boolean).slice(0, 40),
  }));
}

export function galleryHoldExpired(addedAt: number, now = Date.now()): boolean {
  return Number.isFinite(addedAt) && now - addedAt >= GALLERY_HOLD_MS;
}

/**
 * The owner (no seat) can always approve. A named seat can. Everyone else
 * does not see Approve or Reject. A student never can.
 */
export function canApproveGallery(input: {
  role: 'owner' | 'seat' | 'student';
  seatId?: string;
  settings: GalleryApprovalSettings;
}): boolean {
  if (input.role === 'student') return false;
  if (input.role === 'owner') return true;
  const id = input.seatId?.trim() ?? '';
  return id.length > 0 && input.settings.approverSeatIds.includes(id);
}

/** Owner, or an instructor seat. Program director, coach, assistant, and student do not see the switch. */
export function canSetGalleryApproval(input: { role: 'owner' | 'seat' | 'student'; presetId?: string | null }): boolean {
  if (input.role === 'owner') return true;
  if (input.role === 'student') return false;
  return input.presetId === 'instructors';
}

export function pendingDayCopy(count: number): string {
  if (count <= 0) return '';
  const noun = count === 1 ? 'photo or video is' : 'photos and videos are';
  return `${count} ${noun} waiting for approval.`;
}

/** Slideshow and Media Console play approved items. Pending and rejected do not. */
export function playsInGallery(lane: 'pending' | 'approved' | 'rejected' | null | undefined): boolean {
  return lane !== 'pending' && lane !== 'rejected';
}

/**
 * One approve-then-display model for academy media, whatever holds the bytes.
 *
 *   upload ──► pending ──► approved  (shown in the gallery, on the TV, to staff)
 *                     └──► rejected  (deleted from Advantage Cloud; folder stores may still keep a rejected copy)
 *
 * The owner's own uploads skip pending. Coach, Instructors, and program
 * director seats land in pending while the license-level approval switch
 * (GalleryApprovalSwitch / gallery_approval) is on, which is the default.
 * Only the owner or an Instructors seat decides.
 *
 * Advantage Cloud is the first store (src/lib/advantageCloudLanes.ts and
 * src/server/gymCloud.ts). Google Drive and OneDrive plug in later through
 * the same `ApprovalLaneStore` interface with pending/approved/rejected
 * subfolders (see `folderLanePath`). Nothing in this file talks to a network.
 */

export type ApprovalLane = 'pending' | 'approved' | 'rejected';
export type ApprovalSource = 'gallery' | 'daily-video';
export type ApprovalProvider = 'advantage-cloud' | 'google-drive' | 'onedrive';
export type ApprovalDecision = 'approve' | 'reject';

export const APPROVAL_LANES: readonly ApprovalLane[] = ['pending', 'approved', 'rejected'];

export type ApprovalItem = {
  provider: ApprovalProvider;
  source: ApprovalSource;
  lane: ApprovalLane;
  /** Store-relative id. Advantage Cloud: the object path under groups/{license}/. */
  path: string;
  name: string;
  dateKey: string;
  mime: string;
  size: number;
  kind: 'photo' | 'video';
};

export type ApprovalResult = { ok: true; item: ApprovalItem } | { ok: false; message: string };

/**
 * A media home that keeps pending, approved, and rejected apart.
 * `list` returns null when this store is not connected on this device,
 * so a caller can render nothing instead of an error.
 */
export interface ApprovalLaneStore {
  readonly provider: ApprovalProvider;
  list(input: { lane: ApprovalLane; source?: ApprovalSource }): Promise<ApprovalItem[] | null>;
  decide(item: ApprovalItem, decision: ApprovalDecision): Promise<ApprovalResult>;
  /** The bytes for a thumbnail or playback. Null when they cannot be read. */
  open(item: ApprovalItem): Promise<Blob | null>;
}

export function decisionLane(decision: ApprovalDecision): 'approved' | 'rejected' {
  return decision === 'approve' ? 'approved' : 'rejected';
}

export function mediaKindOf(mime: string, name = ''): 'photo' | 'video' {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name) ? 'photo' : 'video';
}

/**
 * Where a new upload lands. The owner is always approved. A seat that may
 * upload lands in pending while approval is required (missing means required).
 * The caller decides first whether this seat may upload this kind at all.
 */
export function uploadLaneFor(input: { kind: 'owner' | 'seat'; approvalRequired?: boolean }): 'pending' | 'approved' {
  if (input.kind === 'owner') return 'approved';
  return input.approvalRequired === false ? 'approved' : 'pending';
}

/** Owner, or an Instructors seat. A Coach cannot approve their own upload. */
export function canDecideApproval(input: { kind: 'owner' | 'seat'; preset?: string | null }): boolean {
  if (input.kind === 'owner') return true;
  return input.preset === 'instructors';
}

/**
 * Lane for a store that keeps the file where it was uploaded and records the
 * decision beside it (Advantage Cloud daily videos). No marker is approved:
 * that is every video uploaded before lanes existed, so nothing disappears.
 */
export function laneFromMarkers(markers: { pending: boolean; rejected: boolean }): ApprovalLane {
  if (markers.rejected) return 'rejected';
  if (markers.pending) return 'pending';
  return 'approved';
}

/** Only approved items are shown to students, on the TV, and in the gallery. */
export function displayable(item: Pick<ApprovalItem, 'lane'>): boolean {
  return item.lane === 'approved';
}

/** Newest day first, then name, so the gallery reads like a camera roll. */
export function sortForGallery<T extends Pick<ApprovalItem, 'dateKey' | 'name'>>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.dateKey === b.dateKey ? a.name.localeCompare(b.name) : b.dateKey.localeCompare(a.dateKey)));
}

/**
 * Folder layout for a folder-based store (Google Drive, OneDrive).
 * Gallery already uses gallery/{lane}/{date}/ in the gym tree. Daily videos
 * keep approved files where they are today and add sibling lane folders, so
 * an existing academy folder needs no move.
 */
export function folderLanePath(source: ApprovalSource, lane: ApprovalLane, dateKey: string): string {
  if (source === 'gallery') return `gallery/${lane}/${dateKey}`;
  return lane === 'approved' ? `videos/daily/${dateKey}` : `videos/daily-${lane}/${dateKey}`;
}

export const FOLDER_LANES_NOT_BUILT = 'Approval for Google Drive and OneDrive is not built yet.';

/**
 * Placeholder for Google Drive / OneDrive. A real store would list the lane
 * folder from `folderLanePath`, and decide by moving the file to the sibling
 * lane folder (a parent change, so no bytes are copied).
 */
export function folderLaneStoreStub(provider: Exclude<ApprovalProvider, 'advantage-cloud'>): ApprovalLaneStore {
  return {
    provider,
    async list() {
      return null;
    },
    async decide() {
      return { ok: false, message: FOLDER_LANES_NOT_BUILT };
    },
    async open() {
      return null;
    },
  };
}

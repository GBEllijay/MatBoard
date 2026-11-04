/**
 * Student profile photo → roster card, with gates.
 *
 * Chain: student → parent (only when the card's parent approval is on) →
 * head coach (license owner or an Instructors seat) → gym folder.
 * Assistant coach, Coach, and Program director seats cannot approve.
 * Approving never publishes. Publishing to the gym folder (Advantage Cloud
 * R2 or the gym's Google Drive / OneDrive) is a separate head-coach step.
 * Only an approved photo can be chosen for the card. Nothing is deleted.
 */

import { hashGatePin } from './parentGate.ts';

export const PHOTO_SUBMISSION_KIND = 'student-photo-submission';
export const PHOTO_MAX_CHARS = 350_000;
const IMAGE_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export type PhotoParentStamp = { required: boolean; approvedAt?: number };

/** What the student device sends. One photo per submission. */
export type StudentPhotoSubmission = {
  schemaVersion: 1;
  kind: typeof PHOTO_SUBMISSION_KIND;
  photoId: string;
  studentId: string;
  submittedAt: number;
  image: string;
  parent: PhotoParentStamp;
};

export type PhotoApprover = 'owner' | 'head' | 'coach' | 'assistant' | 'director' | 'student' | 'parent';

/** Head coach: the license owner or an Instructors seat. */
export function canApproveStudentPhoto(actor: PhotoApprover): boolean {
  return actor === 'owner' || actor === 'head';
}

export function photoImageFits(image: unknown): image is string {
  return typeof image === 'string' && image.length <= PHOTO_MAX_CHARS && IMAGE_RE.test(image);
}

export function readPhotoSubmission(value: unknown): StudentPhotoSubmission | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 1 || row.kind !== PHOTO_SUBMISSION_KIND) return null;
  if (typeof row.photoId !== 'string' || !ID_RE.test(row.photoId)) return null;
  if (typeof row.studentId !== 'string' || !ID_RE.test(row.studentId)) return null;
  if (typeof row.submittedAt !== 'number' || !Number.isFinite(row.submittedAt) || row.submittedAt < 0) return null;
  if (!photoImageFits(row.image)) return null;
  const parentRaw = row.parent as Record<string, unknown> | undefined;
  if (!parentRaw || typeof parentRaw !== 'object' || typeof parentRaw.required !== 'boolean') return null;
  const parent: PhotoParentStamp = { required: parentRaw.required };
  if (typeof parentRaw.approvedAt === 'number' && Number.isFinite(parentRaw.approvedAt)) parent.approvedAt = parentRaw.approvedAt;
  return {
    schemaVersion: 1,
    kind: PHOTO_SUBMISSION_KIND,
    photoId: row.photoId,
    studentId: row.studentId,
    submittedAt: row.submittedAt,
    image: row.image,
    parent,
  };
}

/* --------------------------- student device --------------------------- */

export type PhotoDraftState = 'awaiting-parent' | 'ready-to-send';

export function createPhotoSubmission(input: {
  studentId: string;
  image: string;
  parentRequired: boolean;
  now?: number;
  photoId?: string;
}): { ok: true; submission: StudentPhotoSubmission; state: PhotoDraftState } | { ok: false; error: string } {
  if (!photoImageFits(input.image)) return { ok: false, error: 'Use a JPEG, PNG, or WebP photo under 350 KB.' };
  if (!ID_RE.test(input.studentId)) return { ok: false, error: 'Link this phone to your gym first.' };
  const now = input.now ?? Date.now();
  const photoId = input.photoId ?? `photo-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const submission: StudentPhotoSubmission = {
    schemaVersion: 1,
    kind: PHOTO_SUBMISSION_KIND,
    photoId,
    studentId: input.studentId,
    submittedAt: now,
    image: input.image,
    parent: { required: input.parentRequired },
  };
  return { ok: true, submission, state: input.parentRequired ? 'awaiting-parent' : 'ready-to-send' };
}

export function photoReadyToSend(submission: StudentPhotoSubmission): boolean {
  return !submission.parent.required || typeof submission.parent.approvedAt === 'number';
}

/**
 * The same parent PIN as Parent approvals (parentGate.ts), stored only as a
 * SHA-256 hash on the student's phone.
 */
export async function hashParentPin(pin: string): Promise<string> {
  return hashGatePin(pin);
}

export async function parentApprovePhoto(
  submission: StudentPhotoSubmission,
  pin: string,
  pinHash: string,
  now = Date.now(),
): Promise<{ ok: true; submission: StudentPhotoSubmission } | { ok: false; error: string }> {
  if (!submission.parent.required) return { ok: true, submission };
  if (!pin || !pinHash || (await hashParentPin(pin)) !== pinHash) return { ok: false, error: 'Parent PIN did not match.' };
  return { ok: true, submission: { ...submission, parent: { required: true, approvedAt: now } } };
}

/* ---------------------------- coach device ---------------------------- */

export type PhotoReviewStage = 'awaiting-parent' | 'awaiting-head-coach' | 'approved' | 'declined';

export type PhotoReview = {
  submission: StudentPhotoSubmission;
  cardId: string;
  stage: PhotoReviewStage;
  decidedAt?: number;
  /** Set only by an explicit publish. Approval alone never sets it. */
  publishedPath?: string;
};

type ReviewCard = {
  id: string;
  linkedStudentId?: string;
  guestId?: string;
  coachSync?: 'off';
  parentPhotoApproval?: true;
};

/**
 * Coach intake. The coach card's parent approval setting wins over what the
 * student device says, so a phone that skips the parent step still waits.
 */
export function intakePhotoSubmission(
  card: ReviewCard,
  submission: StudentPhotoSubmission,
): { ok: true; review: PhotoReview } | { ok: false; reason: 'guest' | 'unlinked' | 'sync-off' | 'wrong-student' } {
  if (card.guestId) return { ok: false, reason: 'guest' };
  if (!card.linkedStudentId) return { ok: false, reason: 'unlinked' };
  if (card.coachSync === 'off') return { ok: false, reason: 'sync-off' };
  if (card.linkedStudentId !== submission.studentId) return { ok: false, reason: 'wrong-student' };
  const parentNeeded = Boolean(card.parentPhotoApproval) || submission.parent.required;
  const parentDone = typeof submission.parent.approvedAt === 'number';
  return {
    ok: true,
    review: {
      submission,
      cardId: card.id,
      stage: parentNeeded && !parentDone ? 'awaiting-parent' : 'awaiting-head-coach',
    },
  };
}

export type PhotoDecisionRefusal = 'not-head-coach' | 'awaiting-parent' | 'already-decided';

export function decidePhoto(
  review: PhotoReview,
  actor: PhotoApprover,
  decision: 'approve' | 'decline',
  now = Date.now(),
): { ok: true; review: PhotoReview } | { ok: false; reason: PhotoDecisionRefusal } {
  if (!canApproveStudentPhoto(actor)) return { ok: false, reason: 'not-head-coach' };
  if (review.stage === 'awaiting-parent') return { ok: false, reason: 'awaiting-parent' };
  if (review.stage !== 'awaiting-head-coach') return { ok: false, reason: 'already-decided' };
  return { ok: true, review: { ...review, stage: decision === 'approve' ? 'approved' : 'declined', decidedAt: now } };
}

/** Gym folder path for an approved photo. Same path in R2 and on the gym drive. */
export function studentPhotoPath(studentCode: string, photoId: string, image: string): string {
  const ext = image.startsWith('data:image/png') ? 'png' : image.startsWith('data:image/webp') ? 'webp' : 'jpg';
  return `students/${studentCode}/photos/approved/${photoId}.${ext}`;
}

/** Explicit publish by the head coach. Only an approved photo, never automatic. */
export function markPhotoPublished(
  review: PhotoReview,
  actor: PhotoApprover,
  path: string,
): { ok: true; review: PhotoReview } | { ok: false; reason: 'not-head-coach' | 'not-approved' } {
  if (!canApproveStudentPhoto(actor)) return { ok: false, reason: 'not-head-coach' };
  if (review.stage !== 'approved') return { ok: false, reason: 'not-approved' };
  return { ok: true, review: { ...review, publishedPath: path } };
}

/** The head coach picks which approved photo shows on the card. */
export function chooseCardPhoto(
  reviews: readonly PhotoReview[],
  photoId: string,
  actor: PhotoApprover,
): { ok: true; photoId: string; image: string; cardId: string } | { ok: false; reason: 'not-head-coach' | 'not-approved' } {
  if (!canApproveStudentPhoto(actor)) return { ok: false, reason: 'not-head-coach' };
  const review = reviews.find((row) => row.submission.photoId === photoId);
  if (!review || review.stage !== 'approved') return { ok: false, reason: 'not-approved' };
  return { ok: true, photoId, image: review.submission.image, cardId: review.cardId };
}

/* ------------------------- coach review store ------------------------- */

export const PHOTO_REVIEW_KEY = 'matboard.coach.photoReviews.v1';
const REVIEW_MAX = 40;

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function readPhotoReviews(storage: Pick<Store, 'getItem'>): PhotoReview[] {
  try {
    const raw = storage.getItem(PHOTO_REVIEW_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    const reviews: PhotoReview[] = [];
    for (const row of parsed) {
      const item = row as Partial<PhotoReview>;
      const submission = readPhotoSubmission(item.submission);
      if (!submission || typeof item.cardId !== 'string') continue;
      if (!['awaiting-parent', 'awaiting-head-coach', 'approved', 'declined'].includes(item.stage as string)) continue;
      reviews.push({ ...item, submission, cardId: item.cardId, stage: item.stage as PhotoReviewStage });
    }
    return reviews;
  } catch {
    return [];
  }
}

export function savePhotoReview(storage: Store, review: PhotoReview): PhotoReview[] {
  const rest = readPhotoReviews(storage).filter((row) => row.submission.photoId !== review.submission.photoId);
  const next = [...rest, review].slice(-REVIEW_MAX);
  storage.setItem(PHOTO_REVIEW_KEY, JSON.stringify(next));
  return next;
}

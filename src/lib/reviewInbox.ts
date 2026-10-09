/**
 * Coach submit-for-review inbox.
 * The plan text and a photo id stay on this device. Photo bytes stay in the
 * class-photo store or the gym's Drive folder. Advantage does not host them.
 */

import { lessonPlanForDrive } from './lessonDrive.ts';
import type { TrainingNotesPlan } from './trainingNotesStore.ts';

export const REVIEW_INBOX_KEY = 'matboard.reviewInbox.v1';

export type ReviewStatus = 'pending' | 'approved' | 'changes' | 'rejected';

export type ReviewSubmission = {
  id: string;
  revisionId: string;
  dateKey: string;
  coachName: string;
  planId: string;
  planLabel: string;
  intro: string;
  closing: string;
  /** Class-photo id on this device. Empty when the coach submitted text only. */
  photoId: string;
  photoName: string;
  submittedAt: number;
  status: ReviewStatus;
  instructorNote: string;
};

const STATUSES: readonly ReviewStatus[] = ['pending', 'approved', 'changes', 'rejected'];

export const REVIEW_SUBMIT = 'Submit for review';
export const REVIEW_SUBMITTED =
  'Sent for review. Your instructor can approve it, ask for changes, or reject it.';
export const REVIEW_APPROVE = 'Approve';
export const REVIEW_CHANGES = 'Request changes';
export const REVIEW_REJECT = 'Reject';
export const REVIEW_GALLERY = 'Add approved photo to Gallery';
export const REVIEW_GALLERY_DONE =
  'That photo is in the Gallery on this device. Advantage does not host it.';
export const REVIEW_GALLERY_MISSING =
  'That photo is not on this device. It stays in the gym folder when Drive is connected. Advantage does not host it.';

function isStatus(value: unknown): value is ReviewStatus {
  return STATUSES.includes(value as ReviewStatus);
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function reviewPlanLabel(plan: Pick<TrainingNotesPlan, 'classDesignation' | 'classTime'>): string {
  return [plan.classDesignation?.trim() ?? '', plan.classTime?.trim() ?? ''].filter(Boolean).join(' ');
}

export function submissionMatchesRevision(
  submission: Pick<ReviewSubmission, 'revisionId' | 'dateKey' | 'coachName' | 'planId'>,
  revision: { revisionId: string; dateKey: string; coachName: string; planId: string },
): boolean {
  if (submission.revisionId === revision.revisionId) return true;
  return (
    submission.dateKey === revision.dateKey &&
    submission.coachName.trim().toLowerCase() === revision.coachName.trim().toLowerCase() &&
    submission.planId === revision.planId &&
    submission.planId !== ''
  );
}

/** An approved submission with a class photo can be copied into Gallery. */
export function canAddApprovedPhoto(submission: Pick<ReviewSubmission, 'status' | 'photoId'> | null): boolean {
  return Boolean(submission && submission.status === 'approved' && submission.photoId.trim());
}

function readAll(): ReviewSubmission[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(REVIEW_INBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: number; items?: unknown[] };
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items.map(normalizeSubmission).filter((item): item is ReviewSubmission => item !== null);
  } catch {
    return [];
  }
}

function writeAll(items: ReviewSubmission[]): void {
  localStorage.setItem(REVIEW_INBOX_KEY, JSON.stringify({ version: 1, items }));
}

function normalizeSubmission(value: unknown): ReviewSubmission | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ReviewSubmission>;
  const id = clean(row.id, 120);
  const revisionId = clean(row.revisionId, 200);
  const dateKey = clean(row.dateKey, 10);
  if (!id || !revisionId || !dateKey) return null;
  return {
    id,
    revisionId,
    dateKey,
    coachName: clean(row.coachName, 80),
    planId: clean(row.planId, 80),
    planLabel: clean(row.planLabel, 120),
    intro: clean(row.intro, 8_000),
    closing: clean(row.closing, 2_000),
    photoId: clean(row.photoId, 80),
    photoName: clean(row.photoName, 180),
    submittedAt: typeof row.submittedAt === 'number' && Number.isFinite(row.submittedAt) ? row.submittedAt : 0,
    status: isStatus(row.status) ? row.status : 'pending',
    instructorNote: clean(row.instructorNote, 500),
  };
}

export function listReviewSubmissions(): ReviewSubmission[] {
  return readAll().sort((a, b) => b.submittedAt - a.submittedAt || a.id.localeCompare(b.id));
}

export function findReviewSubmission(revision: {
  revisionId: string;
  dateKey: string;
  coachName: string;
  planId: string;
}): ReviewSubmission | null {
  return (
    readAll().find((item) =>
      submissionMatchesRevision(item, revision),
    ) ?? null
  );
}

/**
 * Coach sends the current plan text and the latest class photo id.
 * A later submit of the same class plan updates that inbox row and marks it pending again.
 */
export function submitForReview(input: {
  revisionId: string;
  dateKey: string;
  coachName: string;
  plan: TrainingNotesPlan;
  photoId?: string;
  photoName?: string;
  submittedAt?: number;
}): ReviewSubmission {
  const plan = lessonPlanForDrive(input.plan);
  const items = readAll();
  const existing = items.find((item) => item.revisionId === input.revisionId || (item.planId && item.planId === plan.id && item.dateKey === input.dateKey));
  const next: ReviewSubmission = {
    id: existing?.id ?? `review-${input.dateKey}-${plan.id || 'plan'}`,
    revisionId: input.revisionId,
    dateKey: input.dateKey,
    coachName: input.coachName.trim().slice(0, 80),
    planId: plan.id,
    planLabel: reviewPlanLabel(plan),
    intro: plan.intro,
    closing: plan.closing,
    photoId: (input.photoId ?? existing?.photoId ?? '').trim().slice(0, 80),
    photoName: (input.photoName ?? existing?.photoName ?? '').trim().slice(0, 180),
    submittedAt: input.submittedAt ?? Date.now(),
    status: 'pending',
    instructorNote: '',
  };
  const rest = items.filter((item) => item.id !== next.id);
  writeAll([next, ...rest]);
  return next;
}

export function decideReview(
  id: string,
  status: Exclude<ReviewStatus, 'pending'>,
  instructorNote = '',
): ReviewSubmission | null {
  const items = readAll();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const next: ReviewSubmission = {
    ...items[index],
    status,
    instructorNote: status === 'approved' ? '' : instructorNote.trim().slice(0, 500),
  };
  items[index] = next;
  writeAll(items);
  return next;
}

/** Instructor opened a Sunday row that the coach has not submitted yet. */
export function submissionFromRevision(input: {
  revisionId: string;
  dateKey: string;
  coachName: string;
  plan: TrainingNotesPlan;
  submittedAt?: number;
}): ReviewSubmission {
  const found = findReviewSubmission({
    revisionId: input.revisionId,
    dateKey: input.dateKey,
    coachName: input.coachName,
    planId: input.plan.id,
  });
  if (found) return found;
  return submitForReview({
    revisionId: input.revisionId,
    dateKey: input.dateKey,
    coachName: input.coachName,
    plan: input.plan,
    submittedAt: input.submittedAt,
  });
}

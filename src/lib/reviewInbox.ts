/**
 * Coach submit-for-review inbox.
 * The plan text and a photo id stay on this device until a gym cloud folder
 * carries that text to another browser. Photo bytes stay in the class-photo
 * store or the gym's Drive folder. Advantage does not host them.
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
  /** Text snapshot. A later submit appends another snapshot. */
  plan: TrainingNotesPlan;
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
export const REVIEW_VERSION_LEAD =
  'Submit for review saves a proposed copy. Earlier versions stay in this history.';

export function reviewStatusLabel(status: ReviewStatus): string {
  if (status === 'approved') return 'Approved';
  if (status === 'changes') return 'Changes requested';
  if (status === 'rejected') return 'Rejected';
  return 'Waiting for review';
}

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

function blankPlan(id: string, coachName: string, intro: string, closing: string): TrainingNotesPlan {
  return {
    version: 1,
    id,
    coachName,
    classDesignation: '',
    classTime: '',
    intro,
    introExpected: '',
    warmupNote: '',
    warmupExpected: '',
    techniques: [],
    specificNote: '',
    specificExpected: '',
    cooldownNote: '',
    cooldownExpected: '',
    closing,
  };
}

function snapshotPlan(value: unknown, fallback: TrainingNotesPlan): TrainingNotesPlan {
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Partial<TrainingNotesPlan>;
  if (raw.version !== 1 || !Array.isArray(raw.techniques)) return fallback;
  const techniques = raw.techniques.filter((item) => item && typeof item === 'object') as TrainingNotesPlan['techniques'];
  try {
    return lessonPlanForDrive({ ...fallback, ...raw, version: 1, techniques });
  } catch {
    return fallback;
  }
}

function normalizeSubmission(value: unknown): ReviewSubmission | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ReviewSubmission>;
  const id = clean(row.id, 120);
  const revisionId = clean(row.revisionId, 200);
  const dateKey = clean(row.dateKey, 10);
  if (!id || !revisionId || !dateKey) return null;
  const intro = clean(row.intro, 8_000);
  const closing = clean(row.closing, 2_000);
  const coachName = clean(row.coachName, 80);
  const planId = clean(row.planId, 80);
  const plan = snapshotPlan(row.plan, blankPlan(planId, coachName, intro, closing));
  return {
    id,
    revisionId,
    dateKey,
    coachName,
    planId,
    planLabel: clean(row.planLabel, 120),
    intro,
    closing,
    photoId: clean(row.photoId, 80),
    photoName: clean(row.photoName, 180),
    submittedAt: typeof row.submittedAt === 'number' && Number.isFinite(row.submittedAt) ? row.submittedAt : 0,
    status: isStatus(row.status) ? row.status : 'pending',
    instructorNote: clean(row.instructorNote, 500),
    plan,
  };
}

function byNewest(a: ReviewSubmission, b: ReviewSubmission): number {
  return b.submittedAt - a.submittedAt || b.id.localeCompare(a.id);
}

function planKey(item: Pick<ReviewSubmission, 'dateKey' | 'planId' | 'revisionId'>): string {
  return item.planId ? `${item.dateKey}:${item.planId}` : item.revisionId;
}

function clipChange(value: string): string {
  const text = value.trim() || 'empty';
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function planFingerprint(plan: TrainingNotesPlan): string {
  return JSON.stringify(lessonPlanForDrive(plan));
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
  return readAll().filter((item) => submissionMatchesRevision(item, revision)).sort(byNewest)[0] ?? null;
}

/** Newest proposal for each class plan. Older copies stay in version history. */
export function latestReviewSubmissions(): ReviewSubmission[] {
  const latest = new Map<string, ReviewSubmission>();
  for (const item of readAll()) {
    const key = planKey(item);
    const current = latest.get(key);
    if (!current || byNewest(item, current) < 0) latest.set(key, item);
  }
  return [...latest.values()].sort(byNewest);
}

/** Every proposed copy for one class plan, newest first. */
export function listPlanVersions(dateKey: string, planId: string): ReviewSubmission[] {
  if (!planId) return [];
  return readAll()
    .filter((item) => item.dateKey === dateKey && item.planId === planId)
    .sort(byNewest);
}

export function planVersionNumber(versionsNewestFirst: readonly ReviewSubmission[], id: string): number {
  const chronological = [...versionsNewestFirst].sort((a, b) => a.submittedAt - b.submittedAt || a.id.localeCompare(b.id));
  const index = chronological.findIndex((item) => item.id === id);
  return index < 0 ? chronological.length : index + 1;
}

/** What changed since the previous proposed copy. The first copy has no earlier text. */
export function versionChangeLines(earlier: TrainingNotesPlan | null, later: TrainingNotesPlan): string[] {
  if (!earlier) return ['First proposal.'];
  const lines: string[] = [];
  const pair = (label: string, before: string, after: string) => {
    if ((before ?? '').trim() === (after ?? '').trim()) return;
    lines.push(`${label}: ${clipChange(before ?? '')} → ${clipChange(after ?? '')}`);
  };
  pair('Coach', earlier.coachName, later.coachName);
  pair('Class', earlier.classDesignation, later.classDesignation);
  pair('Class time', earlier.classTime, later.classTime);
  pair('Intro', earlier.intro, later.intro);
  pair('Warm-up', earlier.warmupNote, later.warmupNote);
  pair('Specific', earlier.specificNote, later.specificNote);
  pair('Cool down', earlier.cooldownNote, later.cooldownNote);
  pair('Closing', earlier.closing, later.closing);
  const count = Math.max(earlier.techniques.length, later.techniques.length);
  for (let index = 0; index < count; index += 1) {
    pair(`Technique ${index + 1}`, earlier.techniques[index]?.title ?? '', later.techniques[index]?.title ?? '');
    pair(`Technique ${index + 1} notes`, earlier.techniques[index]?.notes ?? '', later.techniques[index]?.notes ?? '');
  }
  return lines.length ? lines : ['No text changes.'];
}

/**
 * Coach sends the current plan text and the latest class photo id.
 * Each submit appends a proposed copy. An earlier version stays as it was.
 * Submitting the same text again returns the latest copy.
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
  const family = items.filter((item) =>
    plan.id ? item.planId === plan.id && item.dateKey === input.dateKey : item.revisionId === input.revisionId,
  );
  const latest = family.sort(byNewest)[0] ?? null;
  const photoId = (input.photoId ?? latest?.photoId ?? '').trim().slice(0, 80);
  const photoName = (input.photoName ?? latest?.photoName ?? '').trim().slice(0, 180);
  if (
    latest &&
    latest.photoId === photoId &&
    latest.photoName === photoName &&
    planFingerprint(latest.plan) === planFingerprint(plan)
  ) {
    return latest;
  }
  const submittedAt = input.submittedAt ?? Date.now();
  const next: ReviewSubmission = {
    id: `review-${input.dateKey}-${family.length + 1}-${submittedAt}`,
    revisionId: input.revisionId,
    dateKey: input.dateKey,
    coachName: input.coachName.trim().slice(0, 80),
    planId: plan.id,
    planLabel: reviewPlanLabel(plan),
    intro: plan.intro,
    closing: plan.closing,
    photoId,
    photoName,
    submittedAt,
    status: 'pending',
    instructorNote: '',
    plan,
  };
  writeAll([next, ...items]);
  return next;
}

/**
 * A review packet from the gym folder.
 * A new id is appended. An id already here keeps its plan text and takes the
 * packet's status and note.
 */
export function upsertReviewHandoff(
  value: ReviewSubmission,
  mode: 'add' | 'status',
): 'added' | 'updated' | 'invalid' {
  const normalized = normalizeSubmission(value);
  if (!normalized) return 'invalid';
  const items = readAll();
  const index = items.findIndex((item) => item.id === normalized.id);
  if (index < 0) {
    writeAll([normalized, ...items]);
    return 'added';
  }
  items[index] = {
    ...items[index],
    status: normalized.status,
    instructorNote: normalized.instructorNote,
    photoId: items[index].photoId || normalized.photoId,
    photoName: items[index].photoName || normalized.photoName,
  };
  writeAll(items);
  return mode === 'add' ? 'added' : 'updated';
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

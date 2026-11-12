/**
 * Student → instructor self-assessment ("Send to my instructor").
 *
 * R2 keys under the academy license (groups/{license}/…):
 *   instructors/{instructorId}/assessments/{itemId}.json   the item the instructor reads and answers
 *   assessments/index/{itemId}.json                        owner-visible index row: who, which instructor, status. No scores.
 *
 * itemId is `{studentId}__{submissionId}`, so one student's rows list by prefix.
 * Scores stay in the item. They never go to roster/master.json or any roster backup.
 * Status runs pending → seen → responded. A reply goes out through Coach Sync
 * (coach-assessment-update) and its updateId is kept as responseId.
 */

import { SYNC_ASSESSMENT_AREA_IDS } from './progress/syncPackets.ts';
import { isInstructorId } from './instructorIdentity.ts';

export const ASSESSMENT_SUBMISSION_KIND = 'student-assessment-submission';
export const ASSESSMENT_NOTE_MAX = 1000;
export const ASSESSMENT_SUBMISSION_MAX_CHARS = 8_000;
export const ASSESSMENT_PROOF_MAX = 4_000;

/** Per-student cap on items still pending or seen. */
export const ASSESSMENT_STUDENT_OPEN_MAX = 10;
/** Per-instructor folder cap (every status). Keeps one inbox from growing without bound. */
export const ASSESSMENT_INSTRUCTOR_FOLDER_MAX = 5_000;
/** A student waits this long between two sends. */
export const ASSESSMENT_MIN_GAP_MS = 60_000;

/** The eight D8 faces, same ids as Coach Sync assessments. */
export const ASSESSMENT_FACE_IDS = SYNC_ASSESSMENT_AREA_IDS;
type FaceId = (typeof ASSESSMENT_FACE_IDS)[number];

export type AssessmentItemStatus = 'pending' | 'seen' | 'responded';
export type AssessmentRoute = 'roster' | 'connect-code' | 'owner-default';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const PROFILE_RE = /^(default|p[a-z0-9]{10,20})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIGNED_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SUBMISSION_KEYS = new Set([
  'kind',
  'v',
  'submissionId',
  'studentId',
  'profileId',
  'date',
  'note',
  'scores',
  'assignedInstructorId',
  'via',
  'studentName',
  'sentAt',
]);

/** What the student phone sends. */
export type AssessmentSubmission = {
  kind: typeof ASSESSMENT_SUBMISSION_KIND;
  v: 1;
  submissionId: string;
  studentId: string;
  profileId: string;
  date: string;
  note: string;
  scores: Partial<Record<FaceId, number>>;
  /** What the phone thinks. The server routes by the roster or the signed connect code, never by this alone. */
  assignedInstructorId?: string;
  /** The signed coach connect code the student scanned. Proves which instructor showed it. */
  via?: string;
  studentName?: string;
  sentAt: number;
};

/** What the instructor reads. */
export type InstructorAssessmentItem = {
  kind: 'instructor-assessment-item';
  v: 1;
  id: string;
  license: string;
  instructorId: string;
  route: AssessmentRoute;
  status: AssessmentItemStatus;
  submission: Omit<AssessmentSubmission, 'via'>;
  receivedAt: number;
  seenAt?: number;
  respondedAt?: number;
  responseId?: string;
  respondedBy?: string;
};

/** Owner-visible index row. No scores, no note. */
export type AssessmentIndexRow = {
  id: string;
  studentId: string;
  instructorId: string;
  status: AssessmentItemStatus;
  date: string;
  receivedAt: number;
  responseId?: string;
};

function realDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Strict reader, same idea as the card share: unknown keys are refused, sizes are capped. */
export function readAssessmentSubmission(value: unknown): AssessmentSubmission | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (JSON.stringify(value).length > ASSESSMENT_SUBMISSION_MAX_CHARS) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !SUBMISSION_KEYS.has(key))) return null;
  if (row.kind !== ASSESSMENT_SUBMISSION_KIND || row.v !== 1) return null;
  if (typeof row.submissionId !== 'string' || !ID_RE.test(row.submissionId)) return null;
  if (typeof row.studentId !== 'string' || !ID_RE.test(row.studentId)) return null;
  if (typeof row.profileId !== 'string' || !PROFILE_RE.test(row.profileId)) return null;
  if (!realDay(row.date)) return null;
  if (typeof row.sentAt !== 'number' || !Number.isFinite(row.sentAt) || row.sentAt < 0) return null;
  const note = typeof row.note === 'string' ? row.note.trim() : row.note == null ? '' : null;
  if (note == null || note.length > ASSESSMENT_NOTE_MAX) return null;
  const raw = row.scores;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const scores: Partial<Record<FaceId, number>> = {};
  for (const [key, score] of Object.entries(raw as Record<string, unknown>)) {
    if (!(ASSESSMENT_FACE_IDS as readonly string[]).includes(key)) return null;
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) return null;
    scores[key as FaceId] = score;
  }
  if (!Object.keys(scores).length) return null;
  const out: AssessmentSubmission = {
    kind: ASSESSMENT_SUBMISSION_KIND,
    v: 1,
    submissionId: row.submissionId,
    studentId: row.studentId,
    profileId: row.profileId,
    date: row.date,
    note,
    scores,
    sentAt: row.sentAt,
  };
  if (row.assignedInstructorId !== undefined) {
    if (!isInstructorId(row.assignedInstructorId)) return null;
    out.assignedInstructorId = row.assignedInstructorId;
  }
  if (row.via !== undefined) {
    if (typeof row.via !== 'string' || row.via.length > ASSESSMENT_PROOF_MAX || !SIGNED_RE.test(row.via)) return null;
    out.via = row.via;
  }
  if (row.studentName !== undefined) {
    if (typeof row.studentName !== 'string') return null;
    const name = row.studentName.replace(/\s+/g, ' ').trim();
    if (name.length > 80) return null;
    if (name) out.studentName = name;
  }
  return out;
}

export function assessmentItemId(studentId: string, submissionId: string): string {
  return `${studentId}__${submissionId}`;
}

export function instructorAssessmentPrefix(license: string, instructorId: string): string {
  return `groups/${license}/instructors/${instructorId}/assessments/`;
}

export function instructorAssessmentKey(license: string, instructorId: string, itemId: string): string {
  return `${instructorAssessmentPrefix(license, instructorId)}${itemId}.json`;
}

export function assessmentIndexPrefix(license: string): string {
  return `groups/${license}/assessments/index/`;
}

export function assessmentIndexKey(license: string, itemId: string): string {
  return `${assessmentIndexPrefix(license)}${itemId}.json`;
}

const ORDER: Record<AssessmentItemStatus, number> = { pending: 0, seen: 1, responded: 2 };

/** Status only moves forward. Responded is final. Marking seen twice is a no-op. */
export function nextAssessmentStatus(
  current: AssessmentItemStatus,
  wanted: AssessmentItemStatus,
): { ok: true; status: AssessmentItemStatus; changed: boolean } | { ok: false; error: string } {
  if (current === 'responded') {
    return wanted === 'responded' ? { ok: false, error: 'That assessment was already answered.' } : { ok: true, status: current, changed: false };
  }
  if (ORDER[wanted] < ORDER[current]) return { ok: true, status: current, changed: false };
  return { ok: true, status: wanted, changed: wanted !== current };
}

export function isAssessmentStatus(value: unknown): value is AssessmentItemStatus {
  return value === 'pending' || value === 'seen' || value === 'responded';
}

/** Index row from an item. Never carries scores or the note. */
export function assessmentIndexRow(item: InstructorAssessmentItem): AssessmentIndexRow {
  const row: AssessmentIndexRow = {
    id: item.id,
    studentId: item.submission.studentId,
    instructorId: item.instructorId,
    status: item.status,
    date: item.submission.date,
    receivedAt: item.receivedAt,
  };
  if (item.responseId) row.responseId = item.responseId;
  return row;
}

/** Shape check for an item read back from R2 or a list response. */
export function readInstructorAssessmentItem(value: unknown): InstructorAssessmentItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.kind !== 'instructor-assessment-item' || row.v !== 1) return null;
  if (typeof row.id !== 'string' || typeof row.license !== 'string') return null;
  if (!isInstructorId(row.instructorId) || !isAssessmentStatus(row.status)) return null;
  if (row.route !== 'roster' && row.route !== 'connect-code' && row.route !== 'owner-default') return null;
  if (typeof row.receivedAt !== 'number') return null;
  const submission = readAssessmentSubmission(row.submission);
  if (!submission || submission.via) return null;
  if (row.id !== assessmentItemId(submission.studentId, submission.submissionId)) return null;
  const item: InstructorAssessmentItem = {
    kind: 'instructor-assessment-item',
    v: 1,
    id: row.id,
    license: row.license,
    instructorId: row.instructorId,
    route: row.route,
    status: row.status,
    submission,
    receivedAt: row.receivedAt,
  };
  if (typeof row.seenAt === 'number') item.seenAt = row.seenAt;
  if (typeof row.respondedAt === 'number') item.respondedAt = row.respondedAt;
  if (typeof row.responseId === 'string' && ID_RE.test(row.responseId)) item.responseId = row.responseId;
  if (typeof row.respondedBy === 'string' && isInstructorId(row.respondedBy)) item.respondedBy = row.respondedBy;
  return item;
}

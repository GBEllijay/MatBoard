/**
 * Shared validators for personal class planning marks.
 * Safe for the server (no storage, fetch, or roster).
 * This is not official membership attendance.
 */
import { isStableStudentId } from './studentIdentity.ts';

export const RSVP_STATUSES = ['planned', 'cancelled', 'attended', 'missed'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const ABSENTEE_REASONS = ['missed', 'traveling', ''] as const;
export type AbsenteeReason = (typeof ABSENTEE_REASONS)[number];

export const ABSENTEE_STATUSES = ['requested', 'sent', 'declined'] as const;
export type AbsenteeStatus = (typeof ABSENTEE_STATUSES)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLOT_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

export type ClassRsvp = {
  slotId: string;
  date: string;
  studentId: string;
  displayName: string;
  status: RsvpStatus;
  updatedAt: number;
};

export type AbsenteeRequest = {
  id: string;
  slotId: string;
  date: string;
  studentId: string;
  displayName: string;
  reason: AbsenteeReason;
  status: AbsenteeStatus;
  createdAt: number;
  updatedAt: number;
};

export function isIsoDate(value: string): boolean {
  return DATE_RE.test(value);
}

export function isSlotId(value: string): boolean {
  return SLOT_RE.test(value);
}

/** Names only. Email addresses are stripped and never stored. */
export function cleanDisplayName(value: string, fallback = 'Student'): string {
  const stripped = value.replace(EMAIL_RE, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return stripped || fallback;
}

export function isRsvpStatus(value: unknown): value is RsvpStatus {
  return typeof value === 'string' && (RSVP_STATUSES as readonly string[]).includes(value);
}

export function isAbsenteeReason(value: unknown): value is AbsenteeReason {
  return typeof value === 'string' && (ABSENTEE_REASONS as readonly string[]).includes(value);
}

export function isAbsenteeStatus(value: unknown): value is AbsenteeStatus {
  return typeof value === 'string' && (ABSENTEE_STATUSES as readonly string[]).includes(value);
}

export function readClassRsvp(raw: unknown): ClassRsvp | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<ClassRsvp>;
  if (typeof row.slotId !== 'string' || !isSlotId(row.slotId)) return null;
  if (typeof row.date !== 'string' || !isIsoDate(row.date)) return null;
  if (typeof row.studentId !== 'string' || !isStableStudentId(row.studentId)) return null;
  if (!isRsvpStatus(row.status)) return null;
  const displayName = cleanDisplayName(typeof row.displayName === 'string' ? row.displayName : '');
  const updatedAt = typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : 0;
  return { slotId: row.slotId, date: row.date, studentId: row.studentId, displayName, status: row.status, updatedAt };
}

export function readAbsenteeRequest(raw: unknown): AbsenteeRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<AbsenteeRequest>;
  if (typeof row.id !== 'string' || !ID_RE.test(row.id)) return null;
  if (typeof row.slotId !== 'string' || !isSlotId(row.slotId)) return null;
  if (typeof row.date !== 'string' || !isIsoDate(row.date)) return null;
  if (typeof row.studentId !== 'string' || !isStableStudentId(row.studentId)) return null;
  if (!isAbsenteeStatus(row.status)) return null;
  const status = row.status;
  const reason: AbsenteeReason = isAbsenteeReason(row.reason) ? row.reason : '';
  const displayName = cleanDisplayName(typeof row.displayName === 'string' ? row.displayName : '');
  const createdAt = typeof row.createdAt === 'number' && Number.isFinite(row.createdAt) ? row.createdAt : 0;
  const updatedAt = typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : 0;
  return { id: row.id, slotId: row.slotId, date: row.date, studentId: row.studentId, displayName, reason, status, createdAt, updatedAt };
}

export function rsvpKey(slotId: string, date: string, studentId: string): string {
  return `${date}:${slotId}:${studentId}`;
}

export function myRsvp(
  rows: readonly ClassRsvp[],
  slotId: string,
  date: string,
  studentId: string,
): ClassRsvp | null {
  return rows.find((row) => row.slotId === slotId && row.date === date && row.studentId === studentId) ?? null;
}

export function expectedForClass(
  rows: readonly ClassRsvp[],
  slotId: string,
  date: string,
): ClassRsvp[] {
  return rows
    .filter((row) => row.slotId === slotId && row.date === date && (row.status === 'planned' || row.status === 'attended'))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}

export function whoInClassPrefill(rows: readonly ClassRsvp[], slotId: string, date: string): { names: string; ids: string[] } {
  const expected = expectedForClass(rows, slotId, date);
  return { names: expected.map((row) => row.displayName).join(', '), ids: expected.map((row) => row.studentId) };
}

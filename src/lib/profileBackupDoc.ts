/**
 * Advantage Cloud profile backup: one small JSON file per buyer's license.
 *
 *   groups/{licenseId}/profiles/backup.json   (existing GYM_MEDIA bucket)
 *
 * It holds only the small profile fields people lose when a phone is wiped:
 * each Student Edition profile's name, gym, belt, start date, and rank
 * (stripes and promotion dates), the buyer's own instructor name and belt,
 * and the academy's name, founded date, founders, and lineage text.
 * No photos, no logos, no videos, no journal entries. Student and kid videos
 * never go to Advantage Cloud.
 *
 * Safe to import from the server: no DOM and no device stores.
 */

import { studentBasicsIsMeaningful, type StudentSyncBasics, type StudentSyncRank } from './signedInSyncDocs.ts';

export const PROFILE_BACKUP_PATH = '/api/profile-backup';
export const PROFILE_BACKUP_KIND = 'advantage-profile-backup';
export const PROFILE_BACKUP_MAX_BYTES = 200_000;
export const PROFILE_BACKUP_MAX_STUDENTS = 25;

const DEFAULT_PROFILE_ID = 'default';
const PROFILE_ID_RE = /^p[a-z0-9]{10,20}$/;
const LICENSE_RE = /^[A-Za-z0-9._:-]{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STUDENT_BELTS = new Set(['white', 'blue', 'purple', 'brown', 'black', 'grey', 'yellow', 'orange', 'green', 'coral', 'redWhite', 'red']);
const INSTRUCTOR_BELTS = new Set(['white', 'blue', 'purple', 'brown', 'black', 'coral', 'redWhite', 'red']);
const PHOTO_KEYS = new Set(['pictures', 'pictureNote', 'pictureCount', 'image', 'photo', 'photoId', 'video', 'videos', 'logo', 'logoDataUrl']);

export type ProfileBackupStudent = {
  id: string;
  /** Name on the profile switcher. */
  name: string;
  updatedAt: number;
  basics: StudentSyncBasics;
};

export type ProfileBackupInstructor = { updatedAt: number; name: string; belt: string };

export type ProfileBackupAcademy = {
  updatedAt: number;
  name: string;
  foundedOn: string;
  founders: string;
  lineage: string;
};

export type ProfileBackupDoc = {
  v: 1;
  kind: typeof PROFILE_BACKUP_KIND;
  updatedAt: number;
  students: ProfileBackupStudent[];
  instructor?: ProfileBackupInstructor;
  academy?: ProfileBackupAcademy;
};

export function isBackupProfileId(id: unknown): id is string {
  return typeof id === 'string' && (id === DEFAULT_PROFILE_ID || PROFILE_ID_RE.test(id));
}

/** R2 key for one license, or null when the id is not a safe path segment. */
export function profileBackupKey(licenseId: string): string | null {
  const id = typeof licenseId === 'string' ? licenseId.trim() : '';
  if (!LICENSE_RE.test(id) || id.includes('..')) return null;
  return `groups/${id}/profiles/backup.json`;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function stamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function date(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return DATE_RE.test(raw) ? raw : '';
}

function dates(value: unknown, max = 12): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, max).map((item) => (typeof item === 'string' ? item.trim().slice(0, 10) : ''));
}

function texts(value: unknown, max = 12, len = 80): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, max).map((item) => text(item, len));
}

/** Rank dates and stripes only. Photo and video fields are dropped. */
export function sanitizeBackupRank(raw: unknown, depth = 0): StudentSyncRank | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const rank: StudentSyncRank = {};
  if (typeof row.id === 'string') rank.id = row.id.slice(0, 80);
  if (typeof row.belt === 'string' && STUDENT_BELTS.has(row.belt)) rank.belt = row.belt;
  if (typeof row.tapeCount === 'number' && Number.isFinite(row.tapeCount)) rank.tapeCount = Math.max(0, Math.min(12, Math.floor(row.tapeCount)));
  if (typeof row.awardedOn === 'string') rank.awardedOn = date(row.awardedOn);
  const tapeDates = dates(row.tapeDates);
  if (tapeDates) rank.tapeDates = tapeDates;
  const high = dates(row.highDegreeDates);
  if (high) rank.highDegreeDates = high;
  if (typeof row.instructorBars === 'boolean') rank.instructorBars = row.instructorBars;
  if (typeof row.instructorBarsOn === 'string') rank.instructorBarsOn = date(row.instructorBarsOn);
  const lineage = texts(row.lineage, 12, 120);
  if (lineage) rank.lineage = lineage;
  const focus = texts(row.degreeFocus, 12, 120);
  if (focus) rank.degreeFocus = focus;
  if (depth === 0 && Array.isArray(row.history)) {
    rank.history = row.history
      .slice(0, 40)
      .map((item) => sanitizeBackupRank(item, 1))
      .filter((item): item is StudentSyncRank => Boolean(item));
  }
  return rank;
}

export function sanitizeBackupBasics(raw: unknown): StudentSyncBasics | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const belt = typeof row.belt === 'string' && STUDENT_BELTS.has(row.belt) ? row.belt : 'white';
  const basics: StudentSyncBasics = {
    displayName: text(row.displayName, 80),
    gymName: text(row.gymName, 80),
    belt,
    startedOn: date(row.startedOn),
  };
  const rank = sanitizeBackupRank(row.rank);
  if (rank) basics.rank = rank;
  return studentBasicsIsMeaningful(basics) ? basics : undefined;
}

export function instructorIsEmpty(row: ProfileBackupInstructor | null | undefined): boolean {
  return !row || (!row.name && !row.belt);
}

export function academyIsEmpty(row: ProfileBackupAcademy | null | undefined): boolean {
  return !row || (!row.name && !row.foundedOn && !row.founders && !row.lineage);
}

function sanitizeInstructor(raw: unknown): ProfileBackupInstructor | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const out: ProfileBackupInstructor = {
    updatedAt: stamp(row.updatedAt),
    name: text(row.name, 80),
    belt: typeof row.belt === 'string' && INSTRUCTOR_BELTS.has(row.belt) ? row.belt : '',
  };
  return instructorIsEmpty(out) ? undefined : out;
}

function sanitizeAcademy(raw: unknown): ProfileBackupAcademy | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const out: ProfileBackupAcademy = {
    updatedAt: stamp(row.updatedAt),
    name: text(row.name, 80),
    foundedOn: date(row.foundedOn),
    founders: text(row.founders, 120),
    lineage: text(row.lineage, 240),
  };
  return academyIsEmpty(out) ? undefined : out;
}

function dropMedia(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropMedia);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (PHOTO_KEYS.has(key) || (typeof item === 'string' && item.startsWith('data:'))) continue;
    out[key] = dropMedia(item);
  }
  return out;
}

/** Clean any incoming or stored file. Unknown fields, photos, and videos are dropped. */
export function sanitizeProfileBackup(raw: unknown): ProfileBackupDoc | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = dropMedia(raw) as Record<string, unknown>;
  const students: ProfileBackupStudent[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(row.students) ? row.students : []) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (!isBackupProfileId(rec.id) || seen.has(rec.id)) continue;
    const basics = sanitizeBackupBasics(rec.basics);
    if (!basics) continue;
    seen.add(rec.id);
    students.push({ id: rec.id, name: text(rec.name, 40), updatedAt: stamp(rec.updatedAt), basics });
    if (students.length >= PROFILE_BACKUP_MAX_STUDENTS) break;
  }
  const doc: ProfileBackupDoc = { v: 1, kind: PROFILE_BACKUP_KIND, updatedAt: stamp(row.updatedAt), students };
  const instructor = sanitizeInstructor(row.instructor);
  if (instructor) doc.instructor = instructor;
  const academy = sanitizeAcademy(row.academy);
  if (academy) doc.academy = academy;
  return doc;
}

export function profileBackupIsEmpty(doc: ProfileBackupDoc | null | undefined): boolean {
  return !doc || (doc.students.length === 0 && instructorIsEmpty(doc.instructor) && academyIsEmpty(doc.academy));
}

function newer<T extends { updatedAt: number }>(incoming: T | undefined, stored: T | undefined): T | undefined {
  if (!incoming) return stored;
  if (!stored) return incoming;
  return incoming.updatedAt >= stored.updatedAt ? incoming : stored;
}

/**
 * Server merge. Per section, the newer updatedAt wins. A profile that is
 * missing from the incoming file is kept, so a wiped phone can never erase
 * the backup by saving a blank file. Nothing is ever deleted here.
 */
export function mergeProfileBackup(incoming: ProfileBackupDoc, stored: ProfileBackupDoc | null): ProfileBackupDoc {
  if (!stored) return incoming;
  const byId = new Map<string, ProfileBackupStudent>();
  for (const row of stored.students) byId.set(row.id, row);
  for (const row of incoming.students) byId.set(row.id, newer(row, byId.get(row.id)) ?? row);
  const order = [...incoming.students.map((row) => row.id), ...stored.students.map((row) => row.id)];
  const students = [...new Set(order)]
    .map((id) => byId.get(id))
    .filter((row): row is ProfileBackupStudent => Boolean(row))
    .slice(0, PROFILE_BACKUP_MAX_STUDENTS);
  const doc: ProfileBackupDoc = {
    v: 1,
    kind: PROFILE_BACKUP_KIND,
    updatedAt: Math.max(incoming.updatedAt, stored.updatedAt),
    students,
  };
  const instructor = newer(incoming.instructor, stored.instructor);
  if (instructor) doc.instructor = instructor;
  const academy = newer(incoming.academy, stored.academy);
  if (academy) doc.academy = academy;
  return doc;
}

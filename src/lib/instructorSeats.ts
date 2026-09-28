/**
 * Owner-issued instructor seats for Instructor Collaboration and Advantage Coach Unlimited.
 * Soft beta: records stay on this device. No email send, billing, or invite cap.
 *
 * This app has no separate gym id. The Media Console gym name
 * (`matboard.gymName.v1`) is the gym identity when one is saved. A blank name
 * uses a stable device gym id kept in this archive.
 */

import { readGymName } from './gymName.ts';

export const INSTRUCTOR_SEATS_STORAGE_KEY = 'matboard.pro.instructorSeats.v1';
const SEATS_EVENT = 'matboard-instructor-seats';
const EMAIL_MAX = 254;

export type SeatStatus = 'invited' | 'active' | 'revoked';

export type InstructorPermissions = {
  galleryUpload: boolean;
  dailyLessonPlanAccess: boolean;
  rosterSubmit: boolean;
  rosterPull: boolean;
  downloadTodaysVideos: boolean;
  uploadForDistribution: boolean;
};

export const DEFAULT_INSTRUCTOR_PERMISSIONS: InstructorPermissions = {
  galleryUpload: false,
  dailyLessonPlanAccess: true,
  rosterSubmit: true,
  rosterPull: true,
  downloadTodaysVideos: true,
  uploadForDistribution: true,
};

export const INSTRUCTOR_PERMISSION_FIELDS: readonly {
  key: keyof InstructorPermissions;
  label: string;
}[] = [
  { key: 'galleryUpload', label: 'Gallery upload' },
  { key: 'dailyLessonPlanAccess', label: 'Daily training lesson plan access' },
  { key: 'rosterSubmit', label: 'Roster submit' },
  { key: 'rosterPull', label: 'Roster pull' },
  { key: 'downloadTodaysVideos', label: "Download today's videos" },
  { key: 'uploadForDistribution', label: 'Upload for instructor distribution' },
];

export type InstructorSeat = {
  id: string;
  gymId: string;
  email: string;
  status: SeatStatus;
  issuedAt: number;
  permissions: InstructorPermissions;
  inviteToken: string;
};

type SeatArchive = {
  version: 1;
  deviceGymId: string;
  seats: InstructorSeat[];
};

export type IssueInviteResult =
  | { ok: true; seat: InstructorSeat; inviteLink: string }
  | { ok: false; reason: 'email' | 'duplicate' | 'storage' };

export type SeatWriteResult =
  | { ok: true; seat: InstructorSeat }
  | { ok: false; reason: 'missing' | 'revoked' | 'storage' };

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `seat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultInstructorPermissions(): InstructorPermissions {
  return { ...DEFAULT_INSTRUCTOR_PERMISSIONS };
}

/** Missing keys use the soft-beta defaults. Only real booleans are kept. */
export function normalizeInstructorPermissions(
  value: Partial<InstructorPermissions> | null | undefined,
): InstructorPermissions {
  const next = defaultInstructorPermissions();
  if (!value) return next;
  for (const field of INSTRUCTOR_PERMISSION_FIELDS) {
    const flag = value[field.key];
    if (typeof flag === 'boolean') next[field.key] = flag;
  }
  return next;
}

export function normalizeInviteEmail(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().slice(0, EMAIL_MAX);
}

export function isInviteEmail(value: string): boolean {
  const email = normalizeInviteEmail(value);
  if (!email || email.length > EMAIL_MAX) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function instructorInviteLink(token: string, origin: string): string {
  const base = origin.replace(/\/$/, '');
  const params = new URLSearchParams({ invite: token });
  return `${base}/instructors?${params.toString()}`;
}

/**
 * Whether a Coach control should show for the current seat.
 *
 * TODO: Daily Lesson Plan, gallery upload, roster submit, roster pull,
 * today's video download, and "Upload for instructor distribution" do not
 * call this yet. A follow-up should hide each control when the signed-in
 * seat lacks that permission. Device guests have no seat (`permissions` is
 * null) and should hide all collaboration chrome. The owner hub is not a seat.
 */
export function seatPermissionAllows(
  permissions: InstructorPermissions | null,
  key: keyof InstructorPermissions,
): boolean {
  if (!permissions) return false;
  return permissions[key];
}

function emptyArchive(): SeatArchive {
  return { version: 1, deviceGymId: `device-${newId()}`, seats: [] };
}

function isStatus(value: unknown): value is SeatStatus {
  return value === 'invited' || value === 'active' || value === 'revoked';
}

function readSeat(value: unknown): InstructorSeat | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<InstructorSeat>;
  if (typeof row.id !== 'string' || !row.id) return null;
  if (typeof row.gymId !== 'string') return null;
  if (typeof row.email !== 'string' || !isInviteEmail(row.email)) return null;
  if (!isStatus(row.status)) return null;
  if (typeof row.issuedAt !== 'number' || !Number.isFinite(row.issuedAt)) return null;
  if (typeof row.inviteToken !== 'string' || !row.inviteToken) return null;
  if (!row.permissions || typeof row.permissions !== 'object') return null;
  return {
    id: row.id,
    gymId: row.gymId,
    email: normalizeInviteEmail(row.email),
    status: row.status,
    issuedAt: row.issuedAt,
    permissions: normalizeInstructorPermissions(row.permissions),
    inviteToken: row.inviteToken,
  };
}

function readArchive(): SeatArchive {
  try {
    if (typeof localStorage === 'undefined') return emptyArchive();
    const raw = localStorage.getItem(INSTRUCTOR_SEATS_STORAGE_KEY);
    if (!raw) return emptyArchive();
    const parsed = JSON.parse(raw) as Partial<SeatArchive>;
    if (parsed.version !== 1 || !Array.isArray(parsed.seats)) return emptyArchive();
    const deviceGymId =
      typeof parsed.deviceGymId === 'string' && parsed.deviceGymId
        ? parsed.deviceGymId
        : `device-${newId()}`;
    const seats = parsed.seats
      .map(readSeat)
      .filter((seat): seat is InstructorSeat => seat !== null);
    return { version: 1, deviceGymId, seats };
  } catch {
    return emptyArchive();
  }
}

function writeArchive(archive: SeatArchive): boolean {
  try {
    localStorage.setItem(
      INSTRUCTOR_SEATS_STORAGE_KEY,
      JSON.stringify({ version: 1, deviceGymId: archive.deviceGymId, seats: archive.seats }),
    );
    return true;
  } catch {
    return false;
  }
}

function emitSeats(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SEATS_EVENT));
}

function gymIdFor(archive: SeatArchive): string {
  const name = readGymName().trim();
  return name || archive.deviceGymId;
}

function cloneSeat(seat: InstructorSeat): InstructorSeat {
  return { ...seat, permissions: { ...seat.permissions } };
}

export function listInstructorSeats(): InstructorSeat[] {
  return readArchive()
    .seats.map(cloneSeat)
    .sort((a, b) => b.issuedAt - a.issuedAt || a.email.localeCompare(b.email));
}

export function subscribeInstructorSeats(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === INSTRUCTOR_SEATS_STORAGE_KEY) fn();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(SEATS_EVENT, fn);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(SEATS_EVENT, fn);
  };
}

function openEmailTaken(seats: readonly InstructorSeat[], email: string): boolean {
  return seats.some(
    (seat) => seat.email === email && (seat.status === 'invited' || seat.status === 'active'),
  );
}

export function issueInstructorInvite(input: {
  email: string;
  permissions?: Partial<InstructorPermissions>;
  origin: string;
  now?: number;
  token?: string;
}): IssueInviteResult {
  const email = normalizeInviteEmail(input.email);
  if (!isInviteEmail(email)) return { ok: false, reason: 'email' };
  const archive = readArchive();
  if (openEmailTaken(archive.seats, email)) return { ok: false, reason: 'duplicate' };
  const token = input.token?.trim() || newId();
  const seat: InstructorSeat = {
    id: newId(),
    gymId: gymIdFor(archive),
    email,
    status: 'invited',
    issuedAt: input.now ?? Date.now(),
    permissions: normalizeInstructorPermissions(input.permissions),
    inviteToken: token,
  };
  archive.seats.push(seat);
  if (!writeArchive(archive)) return { ok: false, reason: 'storage' };
  emitSeats();
  return {
    ok: true,
    seat: cloneSeat(seat),
    inviteLink: instructorInviteLink(seat.inviteToken, input.origin),
  };
}

export function updateInstructorSeatPermissions(
  id: string,
  permissions: InstructorPermissions,
): SeatWriteResult {
  const archive = readArchive();
  const seat = archive.seats.find((row) => row.id === id);
  if (!seat) return { ok: false, reason: 'missing' };
  if (seat.status === 'revoked') return { ok: false, reason: 'revoked' };
  seat.permissions = normalizeInstructorPermissions(permissions);
  if (!writeArchive(archive)) return { ok: false, reason: 'storage' };
  emitSeats();
  return { ok: true, seat: cloneSeat(seat) };
}

export function revokeInstructorSeat(id: string): SeatWriteResult {
  const archive = readArchive();
  const seat = archive.seats.find((row) => row.id === id);
  if (!seat) return { ok: false, reason: 'missing' };
  if (seat.status !== 'revoked') seat.status = 'revoked';
  if (!writeArchive(archive)) return { ok: false, reason: 'storage' };
  emitSeats();
  return { ok: true, seat: cloneSeat(seat) };
}

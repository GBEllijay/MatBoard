/**
 * Which gym this student is connected to, and which gyms they left.
 *
 * Leave academy forgets the folder link, the Plus Cloud license id and the
 * current gym, and remembers the old gym's ids so its packets are refused.
 * The journal, reports and the student ID stay on the phone.
 */

import {
  ACADEMY_BINDING_KEY,
  clearStudentDriveLink,
  loadAcademyLink,
  probeGoogleFolder,
  probeOneDriveFolder,
  type AcademyProvider,
  type StudentDriveLink,
  type MemoryStore,
} from './academyPathway.ts';
import { readGymIds } from './coachGymFit.ts';
import { COACH_INBOX_QUEUE_KEY } from './coachRankUpdate.ts';
import { ACADEMY_LICENSE_KEY, readAcademyLicense, saveAcademyLicense } from './studentInboxClient.ts';
import { STUDENT_GYM_LOGO_KEY, STUDENT_GYM_LOGO_SYNC_KEY } from './studentGymMark.ts';

export const ACADEMY_MEMBERSHIP_KEY = 'matboard.studentEdition.academyMembership.v1';
export const ACADEMY_STALE_KEY = 'matboard.studentEdition.academyStale.v1';
export const ACADEMY_STALE_COPY = "Your academy link may have changed — rescan your gym's QR";
export const LEAVE_LOGO_PROMPT = 'Remove old gym logo?';
export const OLD_GYM_REFUSED = 'This file is from a gym you left. Nothing was changed.';

export type AcademyGym = {
  ids: string[];
  name: string;
  provider: AcademyProvider | null;
  /** Epoch ms when it connected. 0 when it connected before this was recorded. */
  since: number;
};

export type AcademyMembership = {
  v: 1;
  current: AcademyGym | null;
  left: { ids: string[]; name: string; at: number }[];
};

const LEFT_MAX = 12;

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function remove(storage: MemoryStore, key: string): void {
  try {
    if (storage.removeItem) storage.removeItem(key);
    else storage.setItem(key, '');
  } catch {
    /* storage refused; nothing else to do */
  }
}

/** Ids a gym signs packets with: its license id and its folder. */
export function gymIdsFor(folderId: string | null | undefined, license: string | null | undefined): string[] {
  return readGymIds([license ?? '', folderId ? `folder:${folderId}` : '']);
}

function readGym(raw: unknown): AcademyGym | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<AcademyGym>;
  const ids = readGymIds(row.ids);
  if (!ids.length) return null;
  const provider = row.provider === 'googleDrive' || row.provider === 'oneDrive' ? row.provider : null;
  const since = typeof row.since === 'number' && Number.isFinite(row.since) && row.since > 0 ? row.since : 0;
  return { ids, name: clip(row.name, 80), provider, since };
}

export function readMembership(storage: Pick<MemoryStore, 'getItem'>): AcademyMembership {
  let parsed: Partial<AcademyMembership> | null = null;
  try {
    const raw = storage.getItem(ACADEMY_MEMBERSHIP_KEY);
    parsed = raw ? (JSON.parse(raw) as Partial<AcademyMembership>) : null;
  } catch {
    parsed = null;
  }
  const left = Array.isArray(parsed?.left)
    ? parsed.left.flatMap((row) => {
        const ids = readGymIds(row?.ids);
        return ids.length || clip(row?.name, 80)
          ? [{ ids, name: clip(row?.name, 80), at: typeof row?.at === 'number' ? row.at : 0 }]
          : [];
      })
    : [];
  let current = parsed?.v === 1 ? readGym(parsed.current) : null;
  if (!current && !parsed) {
    // Connected before membership was recorded: the folder link is the gym.
    const link = loadAcademyLink(storage);
    if (link) {
      current = {
        ids: gymIdsFor(link.folderId, readAcademyLicense(storage)),
        name: link.gymName,
        provider: link.provider,
        since: 0,
      };
    }
  }
  return { v: 1, current, left: left.slice(-LEFT_MAX) };
}

function writeMembership(storage: MemoryStore, value: AcademyMembership): void {
  storage.setItem(ACADEMY_MEMBERSHIP_KEY, JSON.stringify(value));
}

/**
 * A new academy link was accepted. The old license id is cleared first so a
 * new gym never inherits it. A gym the student left and then rescans is allowed again.
 */
export function joinAcademy(
  storage: MemoryStore,
  input: { folderId: string; provider: AcademyProvider; gymName: string; license?: string },
  now = Date.now(),
): AcademyMembership {
  remove(storage, ACADEMY_LICENSE_KEY);
  saveAcademyLicense(storage, input.license);
  const ids = gymIdsFor(input.folderId, readAcademyLicense(storage));
  const before = readMembership(storage);
  const sameGym = before.current && before.current.ids.some((id) => ids.includes(id));
  const next: AcademyMembership = {
    v: 1,
    current: {
      ids,
      name: clip(input.gymName, 80),
      provider: input.provider,
      since: sameGym && before.current?.since ? before.current.since : now,
    },
    left: before.left.filter((row) => !row.ids.some((id) => ids.includes(id))),
  };
  writeMembership(storage, next);
  clearAcademyStale(storage);
  return next;
}

/** Same gym, another folder in it (the folder picker). The license stays. */
export function moveAcademyFolder(storage: MemoryStore, folderId: string): void {
  const before = readMembership(storage);
  if (!before.current) return;
  const ids = readGymIds([...before.current.ids, `folder:${folderId}`]);
  writeMembership(storage, { ...before, current: { ...before.current, ids } });
  clearAcademyStale(storage);
}

/**
 * The academy folder was disconnected without leaving the gym (for example a
 * Google sign-out). The folder record and the license id go; the gym stays current.
 */
export function forgetAcademyFolder(storage: MemoryStore): void {
  clearStudentDriveLink(storage, 'academy');
  remove(storage, ACADEMY_LICENSE_KEY);
}

export type LeaveResult = { left: string; logoRemoved: boolean };

/**
 * Leave academy. Clears the folder record, the license id and the current gym,
 * and remembers the old gym so nothing from it is accepted again.
 * `removeLogo` false keeps the gym logo: student choice wins.
 */
export function leaveAcademy(storage: MemoryStore, options: { removeLogo: boolean }, now = Date.now()): LeaveResult {
  const before = readMembership(storage);
  const link = loadAcademyLink(storage);
  const ids = readGymIds([...(before.current?.ids ?? []), ...gymIdsFor(link?.folderId, readAcademyLicense(storage))]);
  const name = before.current?.name || link?.gymName || '';
  const left = [...before.left];
  if (ids.length || name) left.push({ ids, name, at: now });
  writeMembership(storage, { v: 1, current: null, left: left.slice(-LEFT_MAX) });
  remove(storage, ACADEMY_BINDING_KEY);
  remove(storage, ACADEMY_LICENSE_KEY);
  // Updates still waiting came from the old gym.
  remove(storage, COACH_INBOX_QUEUE_KEY);
  clearAcademyStale(storage);
  if (options.removeLogo) {
    remove(storage, STUDENT_GYM_LOGO_KEY);
    remove(storage, STUDENT_GYM_LOGO_SYNC_KEY);
  }
  return { left: name, logoRemoved: options.removeLogo };
}

function sameName(a: string, b: string): boolean {
  return Boolean(a) && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * May a coach packet or coach file be applied here?
 * - Never left a gym: yes (older coaches do not sign packets).
 * - Signed: it must be the current gym, or, with no current gym, not a gym the student left.
 * - Unsigned after leaving: only when its gym name is the current gym's name.
 */
export function gymPacketAllowed(storage: Pick<MemoryStore, 'getItem'>, raw: unknown): boolean {
  const membership = readMembership(storage);
  const record = raw && typeof raw === 'object' ? (raw as { gym?: unknown }) : null;
  const gym = record?.gym && typeof record.gym === 'object' ? (record.gym as { ids?: unknown; name?: unknown }) : null;
  const ids = readGymIds(gym?.ids);
  const name = clip(gym?.name, 80);
  const leftIds = membership.left.flatMap((row) => row.ids);
  if (ids.length) {
    if (membership.current) return ids.some((id) => membership.current!.ids.includes(id));
    return !ids.some((id) => leftIds.includes(id));
  }
  if (!membership.left.length) return true;
  if (!membership.current) return false;
  return sameName(name, membership.current.name) && !membership.left.some((row) => sameName(name, row.name));
}

/** Same check on packet text. Text that is not JSON is left to the normal parser. */
export function gymTextAllowed(storage: Pick<MemoryStore, 'getItem'>, text: string): boolean {
  try {
    return gymPacketAllowed(storage, JSON.parse(text));
  } catch {
    return true;
  }
}

/* Stale academy link ---------------------------------------------------- */

export function markAcademyStale(storage: MemoryStore, now = Date.now()): void {
  storage.setItem(ACADEMY_STALE_KEY, String(now));
}

export function clearAcademyStale(storage: MemoryStore): void {
  remove(storage, ACADEMY_STALE_KEY);
}

export function readAcademyStale(storage: Pick<MemoryStore, 'getItem'>): boolean {
  try {
    return Boolean(storage.getItem(ACADEMY_STALE_KEY));
  } catch {
    return false;
  }
}

/** Access denied or not found means the folder moved or was unshared. */
export function isStaleAccessStatus(status: number | undefined): boolean {
  return status === 403 || status === 404;
}

/** Record a failed academy read or upload. True when the link now reads as stale. */
export function reportAcademyAccessFailure(storage: MemoryStore, status: number | undefined): boolean {
  if (!isStaleAccessStatus(status)) return false;
  markAcademyStale(storage);
  return true;
}

/**
 * After an academy upload or read failed, look at the folder once.
 * Access denied or not found marks the link stale. Other errors (offline,
 * signed out) do not. Never throws.
 */
export async function confirmAcademyLinkStale(
  storage: MemoryStore,
  link: Pick<StudentDriveLink, 'provider' | 'folderId'>,
  token: string | null | undefined,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  try {
    const probe =
      link.provider === 'googleDrive'
        ? await probeGoogleFolder(token, link.folderId, fetcher)
        : await probeOneDriveFolder(token, link.folderId, fetcher);
    if (probe.ok) return false;
    return reportAcademyAccessFailure(storage, 'status' in probe ? probe.status : undefined);
  } catch {
    return false;
  }
}

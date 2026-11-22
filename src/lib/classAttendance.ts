/**
 * Personal class planning: "I plan to attend" and "I was here".
 * This is not official membership attendance, and it is not a door check-in.
 * Marks attach to the Student Edition stable id. Guests and unlinked roster
 * cards are skipped when an instructor builds a send list.
 */
import { isStableStudentId, readStableStudentId } from './studentIdentity.ts';
import { ENTITLEMENT_TOKEN_KEY } from './entitlement.ts';
import { readInboxPass } from './studentInboxClient.ts';
import { SCHEDULE_API } from './gymSchedulePublish.ts';
import type { Student } from './rosterStore.ts';

export const CLASS_RSVP_CACHE_KEY = 'matboard.student.classRsvp.v1';
export const CLASS_ATTENDANCE_EVENT = 'matboard-class-attendance';

import {
  cleanDisplayName,
  isIsoDate,
  isSlotId,
  readAbsenteeRequest,
  readClassRsvp,
  type AbsenteeReason,
  type AbsenteeRequest,
  type AbsenteeStatus,
  type ClassRsvp,
  type RsvpStatus,
} from './classAttendanceCore.ts';

export {
  ABSENTEE_REASONS,
  ABSENTEE_STATUSES,
  RSVP_STATUSES,
  cleanDisplayName,
  expectedForClass,
  isAbsenteeReason,
  isAbsenteeStatus,
  isIsoDate,
  isRsvpStatus,
  isSlotId,
  myRsvp,
  readAbsenteeRequest,
  readClassRsvp,
  rsvpKey,
  whoInClassPrefill,
  type AbsenteeReason,
  type AbsenteeRequest,
  type AbsenteeStatus,
  type ClassRsvp,
  type RsvpStatus,
} from './classAttendanceCore.ts';


type Auth = { token?: string | null; inboxPass?: string | null };

function authHeaders(auth: Auth = {}): Record<string, string> {
  const token = (auth.token ?? (typeof localStorage === 'undefined' ? '' : localStorage.getItem(ENTITLEMENT_TOKEN_KEY) ?? '')).trim();
  const pass = (auth.inboxPass ?? (typeof localStorage === 'undefined' ? '' : readInboxPass(localStorage))).trim();
  const bearer = token || pass;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return headers;
}

/** Students an instructor can message: linked, not a guest, comms not off. */
export function linkedSendTargets(roster: readonly Student[], studentIds: readonly string[]): Student[] {
  const wanted = new Set(studentIds);
  const out: Student[] = [];
  const seen = new Set<string>();
  for (const card of roster) {
    if (card.guestId) continue;
    if (card.coachSync === 'off') continue;
    if (card.archivedAt) continue;
    const linked = card.linkedStudentId ?? '';
    if (!linked || !wanted.has(linked) || seen.has(linked)) continue;
    if (card.rosterList && card.rosterList !== 'student') continue;
    seen.add(linked);
    out.push(card);
  }
  return out;
}

export function displayNameForStudent(
  roster: readonly Student[],
  studentId: string,
  fallback: string,
): string {
  const card = roster.find((row) => row.linkedStudentId === studentId && !row.guestId);
  return cleanDisplayName(card?.name ?? fallback);
}

type CacheFile = { v: 1; rsvps: ClassRsvp[]; requests: AbsenteeRequest[] };

function readCache(storage: Pick<Storage, 'getItem'> | null): CacheFile {
  if (!storage) return { v: 1, rsvps: [], requests: [] };
  try {
    const raw = storage.getItem(CLASS_RSVP_CACHE_KEY);
    if (!raw) return { v: 1, rsvps: [], requests: [] };
    const parsed = JSON.parse(raw) as Partial<CacheFile>;
    const rsvps = Array.isArray(parsed.rsvps) ? parsed.rsvps.map(readClassRsvp).filter((row): row is ClassRsvp => Boolean(row)) : [];
    const requests = Array.isArray(parsed.requests)
      ? parsed.requests.map(readAbsenteeRequest).filter((row): row is AbsenteeRequest => Boolean(row))
      : [];
    return { v: 1, rsvps, requests };
  } catch {
    return { v: 1, rsvps: [], requests: [] };
  }
}

function writeCache(storage: Pick<Storage, 'setItem'> | null, file: CacheFile): void {
  if (!storage) return;
  storage.setItem(CLASS_RSVP_CACHE_KEY, JSON.stringify(file));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CLASS_ATTENDANCE_EVENT));
}

export function readCachedClassAttendance(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): CacheFile {
  return readCache(storage);
}

function upsertRsvp(list: ClassRsvp[], next: ClassRsvp): ClassRsvp[] {
  const index = list.findIndex((row) => row.slotId === next.slotId && row.date === next.date && row.studentId === next.studentId);
  if (index < 0) return [...list, next];
  const copy = list.slice();
  copy[index] = next;
  return copy;
}

function mergeRemote(cache: CacheFile, rsvps: ClassRsvp[], requests: AbsenteeRequest[]): CacheFile {
  let next = cache.rsvps;
  for (const row of rsvps) next = upsertRsvp(next, row);
  const seen = new Set(requests.map((row) => row.id));
  const kept = cache.requests.filter((row) => !seen.has(row.id));
  return { v: 1, rsvps: next, requests: [...kept, ...requests] };
}

export async function fetchClassAttendance(
  input: { date: string; slotId?: string },
  options: { fetchImpl?: typeof fetch; auth?: Auth; storage?: Storage | null } = {},
): Promise<{ available: boolean; rsvps: ClassRsvp[]; requests: AbsenteeRequest[] }> {
  const storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage;
  const cached = readCache(storage);
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'undefined' ? undefined : fetch);
  if (!fetchImpl) {
    const rsvps = cached.rsvps.filter((row) => row.date === input.date && (!input.slotId || row.slotId === input.slotId));
    const requests = cached.requests.filter((row) => row.date === input.date && (!input.slotId || row.slotId === input.slotId));
    return { available: false, rsvps, requests };
  }
  try {
    const params = new URLSearchParams({ view: 'rsvps', date: input.date });
    if (input.slotId) params.set('slotId', input.slotId);
    const response = await fetchImpl(`${SCHEDULE_API}?${params}`, { headers: authHeaders(options.auth) });
    const body = (await response.json()) as { ok?: unknown; available?: unknown; rsvps?: unknown; requests?: unknown };
    if (body.available === false) {
      const rsvps = cached.rsvps.filter((row) => row.date === input.date && (!input.slotId || row.slotId === input.slotId));
      const requests = cached.requests.filter((row) => row.date === input.date && (!input.slotId || row.slotId === input.slotId));
      return { available: false, rsvps, requests };
    }
    const rsvps = Array.isArray(body.rsvps) ? body.rsvps.map(readClassRsvp).filter((row): row is ClassRsvp => Boolean(row)) : [];
    const requests = Array.isArray(body.requests)
      ? body.requests.map(readAbsenteeRequest).filter((row): row is AbsenteeRequest => Boolean(row))
      : [];
    if (storage) writeCache(storage, mergeRemote(cached, rsvps, requests));
    return { available: true, rsvps, requests };
  } catch {
    const rsvps = cached.rsvps.filter((row) => row.date === input.date && (!input.slotId || row.slotId === input.slotId));
    const requests = cached.requests.filter((row) => row.date === input.date && (!input.slotId || row.slotId === input.slotId));
    return { available: false, rsvps, requests };
  }
}

export async function submitClassRsvp(
  input: { slotId: string; date: string; studentId: string; displayName: string; status: RsvpStatus },
  options: { fetchImpl?: typeof fetch; auth?: Auth; storage?: Storage | null; now?: number } = {},
): Promise<{ ok: boolean; available: boolean; rsvp?: ClassRsvp; error?: string }> {
  const storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage;
  const studentId = input.studentId || (storage ? readStableStudentId(storage) ?? '' : '');
  if (!isStableStudentId(studentId) || !isSlotId(input.slotId) || !isIsoDate(input.date)) {
    return { ok: false, available: true, error: 'That class mark could not be saved.' };
  }
  const rsvp: ClassRsvp = {
    slotId: input.slotId,
    date: input.date,
    studentId,
    displayName: cleanDisplayName(input.displayName),
    status: input.status,
    updatedAt: options.now ?? Date.now(),
  };
  if (storage) {
    const cache = readCache(storage);
    writeCache(storage, { ...cache, rsvps: upsertRsvp(cache.rsvps, rsvp) });
  }
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'undefined' ? undefined : fetch);
  if (!fetchImpl) return { ok: true, available: false, rsvp };
  try {
    const response = await fetchImpl(SCHEDULE_API, {
      method: 'POST',
      headers: { ...authHeaders(options.auth), 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'rsvp',
        slotId: rsvp.slotId,
        date: rsvp.date,
        studentId: rsvp.studentId,
        displayName: rsvp.displayName,
        status: rsvp.status,
      }),
    });
    const body = (await response.json()) as { ok?: unknown; available?: unknown; error?: unknown; rsvp?: unknown };
    if (body.available === false) return { ok: true, available: false, rsvp };
    if (!response.ok || body.ok !== true) {
      return { ok: false, available: true, rsvp, error: typeof body.error === 'string' ? body.error : 'Could not save that class mark.' };
    }
    const saved = readClassRsvp(body.rsvp) ?? rsvp;
    if (storage) {
      const cache = readCache(storage);
      writeCache(storage, { ...cache, rsvps: upsertRsvp(cache.rsvps, saved) });
    }
    return { ok: true, available: true, rsvp: saved };
  } catch {
    return { ok: true, available: false, rsvp };
  }
}

export async function confirmClassRoster(
  input: { slotId: string; date: string; attendedIds: string[]; missedIds?: string[] },
  options: { fetchImpl?: typeof fetch; auth?: Auth; storage?: Storage | null; names?: Record<string, string>; now?: number } = {},
): Promise<{ ok: boolean; available: boolean; error?: string }> {
  const storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage;
  const now = options.now ?? Date.now();
  const names = options.names ?? {};
  if (storage) {
    const cache = readCache(storage);
    let rsvps = cache.rsvps;
    for (const studentId of input.attendedIds) {
      if (!isStableStudentId(studentId)) continue;
      rsvps = upsertRsvp(rsvps, {
        slotId: input.slotId,
        date: input.date,
        studentId,
        displayName: cleanDisplayName(names[studentId] ?? 'Student'),
        status: 'attended',
        updatedAt: now,
      });
    }
    for (const studentId of input.missedIds ?? []) {
      if (!isStableStudentId(studentId)) continue;
      rsvps = upsertRsvp(rsvps, {
        slotId: input.slotId,
        date: input.date,
        studentId,
        displayName: cleanDisplayName(names[studentId] ?? 'Student'),
        status: 'missed',
        updatedAt: now,
      });
    }
    writeCache(storage, { ...cache, rsvps });
  }
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'undefined' ? undefined : fetch);
  if (!fetchImpl) return { ok: true, available: false };
  try {
    const response = await fetchImpl(SCHEDULE_API, {
      method: 'POST',
      headers: { ...authHeaders(options.auth), 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'confirm',
        slotId: input.slotId,
        date: input.date,
        attendedIds: input.attendedIds,
        missedIds: input.missedIds ?? [],
        names,
      }),
    });
    const body = (await response.json()) as { ok?: unknown; available?: unknown; error?: unknown };
    if (body.available === false) return { ok: true, available: false };
    if (!response.ok || body.ok !== true) {
      return { ok: false, available: true, error: typeof body.error === 'string' ? body.error : 'Could not confirm who was in class.' };
    }
    return { ok: true, available: true };
  } catch {
    return { ok: true, available: false };
  }
}

export async function requestAbsenteeCopy(
  input: { slotId: string; date: string; studentId: string; displayName: string; reason: AbsenteeReason },
  options: { fetchImpl?: typeof fetch; auth?: Auth; storage?: Storage | null; now?: number } = {},
): Promise<{ ok: boolean; available: boolean; request?: AbsenteeRequest; error?: string }> {
  const storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage;
  const now = options.now ?? Date.now();
  const studentId = input.studentId || (storage ? readStableStudentId(storage) ?? '' : '');
  if (!isStableStudentId(studentId) || !isSlotId(input.slotId) || !isIsoDate(input.date)) {
    return { ok: false, available: true, error: 'That request could not be saved.' };
  }
  const request: AbsenteeRequest = {
    id: `ar-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    slotId: input.slotId,
    date: input.date,
    studentId,
    displayName: cleanDisplayName(input.displayName),
    reason: input.reason,
    status: 'requested',
    createdAt: now,
    updatedAt: now,
  };
  if (storage) {
    const cache = readCache(storage);
    writeCache(storage, { ...cache, requests: [...cache.requests.filter((row) => row.id !== request.id), request] });
  }
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'undefined' ? undefined : fetch);
  if (!fetchImpl) return { ok: true, available: false, request };
  try {
    const response = await fetchImpl(SCHEDULE_API, {
      method: 'POST',
      headers: { ...authHeaders(options.auth), 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'absentee-request',
        slotId: request.slotId,
        date: request.date,
        studentId: request.studentId,
        displayName: request.displayName,
        reason: request.reason,
        id: request.id,
      }),
    });
    const body = (await response.json()) as { ok?: unknown; available?: unknown; error?: unknown; request?: unknown };
    if (body.available === false) return { ok: true, available: false, request };
    if (!response.ok || body.ok !== true) {
      return { ok: false, available: true, request, error: typeof body.error === 'string' ? body.error : 'Could not send that request.' };
    }
    const saved = readAbsenteeRequest(body.request) ?? request;
    if (storage) {
      const cache = readCache(storage);
      writeCache(storage, { ...cache, requests: [...cache.requests.filter((row) => row.id !== saved.id && !(row.slotId === saved.slotId && row.date === saved.date && row.studentId === saved.studentId && row.status === 'requested')), saved] });
    }
    return { ok: true, available: true, request: saved };
  } catch {
    return { ok: true, available: false, request };
  }
}

export async function resolveAbsenteeRequest(
  input: { id: string; status: Exclude<AbsenteeStatus, 'requested'> },
  options: { fetchImpl?: typeof fetch; auth?: Auth; storage?: Storage | null; now?: number } = {},
): Promise<{ ok: boolean; available: boolean; error?: string }> {
  const storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage;
  const now = options.now ?? Date.now();
  if (storage) {
    const cache = readCache(storage);
    writeCache(storage, {
      ...cache,
      requests: cache.requests.map((row) => (row.id === input.id ? { ...row, status: input.status, updatedAt: now } : row)),
    });
  }
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'undefined' ? undefined : fetch);
  if (!fetchImpl) return { ok: true, available: false };
  try {
    const response = await fetchImpl(SCHEDULE_API, {
      method: 'POST',
      headers: { ...authHeaders(options.auth), 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'absentee-resolve', id: input.id, status: input.status }),
    });
    const body = (await response.json()) as { ok?: unknown; available?: unknown; error?: unknown };
    if (body.available === false) return { ok: true, available: false };
    if (!response.ok || body.ok !== true) {
      return { ok: false, available: true, error: typeof body.error === 'string' ? body.error : 'Could not update that request.' };
    }
    return { ok: true, available: true };
  } catch {
    return { ok: true, available: false };
  }
}

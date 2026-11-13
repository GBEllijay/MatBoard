/**
 * Student inbox on Advantage Cloud, with a file when the bucket is not bound.
 * Preview sites have no GYM_MEDIA binding. Probe then returns unbound and the
 * coach saves a file the student imports, the same path as coach feedback.
 */

import { ENTITLEMENT_TOKEN_KEY } from './entitlement.ts';
import { base64UrlToBytes } from './entitlementToken.ts';
import { exportProgressPacket, progressHandoffFileName } from './progress/format.ts';
import type { CoachInboxPacket } from './coachRankUpdate.ts';
import type { CoachGymLogoPacket } from './progress/types.ts';

/** Every typed coach → student packet: rank, competition, belt progress, assessment, gym logo. */
export type InboxPacket = CoachInboxPacket | CoachGymLogoPacket;

export const INBOX_PASS_KEY = 'matboard.studentEdition.inboxPass.v1';
export const ACADEMY_LICENSE_KEY = 'matboard.studentEdition.academyLicense.v1';

const LICENSE_RE = /^[A-Za-z0-9_-]{8,80}$/;

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type InboxDelivery =
  | { mode: 'cloud'; studentPass: string }
  | { mode: 'file'; name: string; json: string; reason: string };

export function licenseIdFromToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))) as { sub?: unknown };
    return typeof parsed.sub === 'string' && LICENSE_RE.test(parsed.sub) ? parsed.sub : null;
  } catch {
    return null;
  }
}

export function readStoredEntitlementToken(storage: Pick<MemoryStore, 'getItem'> = localStorage): string {
  try {
    return storage.getItem(ENTITLEMENT_TOKEN_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function licenseIdFromStoredToken(storage: Pick<MemoryStore, 'getItem'> = localStorage): string | null {
  const token = readStoredEntitlementToken(storage);
  return token ? licenseIdFromToken(token) : null;
}

export function readInboxPass(storage: Pick<MemoryStore, 'getItem'>): string {
  try {
    return storage.getItem(INBOX_PASS_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function saveInboxPass(storage: MemoryStore, pass: string): void {
  const trimmed = pass.trim();
  if (trimmed.split('.').length !== 3) return;
  storage.setItem(INBOX_PASS_KEY, trimmed);
}

export function saveAcademyLicense(storage: MemoryStore, license: string | undefined): void {
  if (!license || !LICENSE_RE.test(license)) return;
  storage.setItem(ACADEMY_LICENSE_KEY, license);
}

/** Plus Cloud license id the academy QR carried, or '' when none. */
export function readAcademyLicense(storage: Pick<MemoryStore, 'getItem'>): string {
  try {
    const value = storage.getItem(ACADEMY_LICENSE_KEY)?.trim() ?? '';
    return LICENSE_RE.test(value) ? value : '';
  } catch {
    return '';
  }
}

export function rankUpdateFile(packet: InboxPacket): { name: string; json: string } {
  return { name: progressHandoffFileName(packet), json: exportProgressPacket(packet) };
}

export async function probeGymInbox(fetchImpl: typeof fetch = fetch): Promise<'bound' | 'unbound' | 'offline'> {
  try {
    const response = await fetchImpl('/api/gym/inbox?probe=1', { headers: { accept: 'application/json' } });
    if (response.status === 503) return 'unbound';
    if (!response.ok) return 'offline';
    const body = (await response.json()) as { bound?: unknown };
    return body.bound === true ? 'bound' : 'unbound';
  } catch {
    return 'offline';
  }
}

export async function deliverRankUpdate(
  packet: InboxPacket,
  options: { fetchImpl?: typeof fetch; token?: string | null; license?: string | null } = {},
): Promise<InboxDelivery> {
  const file = rankUpdateFile(packet);
  const token = options.token ?? readStoredEntitlementToken();
  const license = options.license ?? licenseIdFromToken(token);
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!token || !license) {
    return {
      mode: 'file',
      ...file,
      reason: 'Advantage Cloud is not connected on this site. A file was saved for the student to import.',
    };
  }
  const probe = await probeGymInbox(fetchImpl);
  if (probe !== 'bound') {
    return {
      mode: 'file',
      ...file,
      reason: 'Advantage Cloud is not connected on this site. A file was saved for the student to import.',
    };
  }
  try {
    const response = await fetchImpl('/api/gym/inbox', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: 'write', license, studentId: packet.studentId, packet }),
    });
    if (response.status === 503) {
      return {
        mode: 'file',
        ...file,
        reason: 'Advantage Cloud is not connected on this site. A file was saved for the student to import.',
      };
    }
    if (!response.ok) {
      return {
        mode: 'file',
        ...file,
        reason: 'This seat cannot write a student inbox. A file was saved for the student to import.',
      };
    }
    const body = (await response.json()) as { studentPass?: unknown };
    const studentPass = typeof body.studentPass === 'string' ? body.studentPass : '';
    if (!studentPass) {
      return {
        mode: 'file',
        ...file,
        reason: 'The inbox was written, but no student code came back. A file was saved as well.',
      };
    }
    return { mode: 'cloud', studentPass };
  } catch {
    return {
      mode: 'file',
      ...file,
      reason: 'Advantage Cloud is not connected on this site. A file was saved for the student to import.',
    };
  }
}

/** The head coach's call on one of this student's own profile photos. */
export type PhotoDecision = { photoId: string; decision: 'approve' | 'decline'; decidedAt: number };

const PHOTO_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export function readPhotoDecisions(value: unknown): PhotoDecision[] {
  if (!Array.isArray(value)) return [];
  const out: PhotoDecision[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const item = row as { photoId?: unknown; decision?: unknown; decidedAt?: unknown };
    if (typeof item.photoId !== 'string' || !PHOTO_ID_RE.test(item.photoId)) continue;
    if (item.decision !== 'approve' && item.decision !== 'decline') continue;
    out.push({
      photoId: item.photoId,
      decision: item.decision,
      decidedAt: typeof item.decidedAt === 'number' && Number.isFinite(item.decidedAt) ? item.decidedAt : 0,
    });
  }
  return out;
}

export async function pullStudentInbox(
  pass: string,
  fetchImpl: typeof fetch = fetch,
): Promise<
  | {
      ok: true;
      packets: unknown[];
      fromInstructor: { name: string; path: string; dateKey: string }[];
      photoDecisions: PhotoDecision[];
    }
  | { ok: false; reason: 'unbound' | 'denied' | 'offline' }
> {
  const license = inboxPassLicense(pass);
  const studentId = inboxPassStudentId(pass);
  if (!pass || !license || !studentId) return { ok: false, reason: 'denied' };
  try {
    const response = await fetchImpl(
      `/api/gym/inbox?license=${encodeURIComponent(license)}&studentId=${encodeURIComponent(studentId)}`,
      { headers: { accept: 'application/json', authorization: `Bearer ${pass}` } },
    );
    if (response.status === 503) return { ok: false, reason: 'unbound' };
    if (response.status === 401 || response.status === 403) return { ok: false, reason: 'denied' };
    if (!response.ok) return { ok: false, reason: 'offline' };
    const body = (await response.json()) as { packets?: unknown; fromInstructor?: unknown; photoDecisions?: unknown };
    const fromInstructor = Array.isArray(body.fromInstructor)
      ? body.fromInstructor.filter((row): row is { name: string; path: string; dateKey: string } => {
          if (!row || typeof row !== 'object') return false;
          const file = row as { name?: unknown; path?: unknown; dateKey?: unknown };
          return typeof file.name === 'string' && typeof file.path === 'string' && typeof file.dateKey === 'string';
        })
      : [];
    return {
      ok: true,
      packets: Array.isArray(body.packets) ? body.packets : [],
      fromInstructor,
      photoDecisions: readPhotoDecisions(body.photoDecisions),
    };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

export async function downloadFromInstructor(
  pass: string,
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Blob | null> {
  const license = inboxPassLicense(pass);
  const studentId = inboxPassStudentId(pass);
  if (!pass || !license || !studentId || !path) return null;
  try {
    const response = await fetchImpl(
      `/api/gym/inbox?license=${encodeURIComponent(license)}&studentId=${encodeURIComponent(studentId)}&file=${encodeURIComponent(path)}`,
      { headers: { authorization: `Bearer ${pass}` } },
    );
    if (!response.ok) return null;
    return response.blob();
  } catch {
    return null;
  }
}

export async function clearStudentInboxItem(
  pass: string,
  updateId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const license = inboxPassLicense(pass);
  const studentId = inboxPassStudentId(pass);
  if (!pass || !license || !studentId || !updateId) return false;
  try {
    const response = await fetchImpl(
      `/api/gym/inbox?license=${encodeURIComponent(license)}&studentId=${encodeURIComponent(studentId)}&updateId=${encodeURIComponent(updateId)}`,
      { method: 'DELETE', headers: { accept: 'application/json', authorization: `Bearer ${pass}` } },
    );
    return response.ok;
  } catch {
    return false;
  }
}

function inboxPassPayload(pass: string): { gym?: unknown; studentId?: unknown } | null {
  const parts = pass.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))) as { gym?: unknown; studentId?: unknown };
  } catch {
    return null;
  }
}

export function inboxPassLicense(pass: string): string | null {
  const gym = inboxPassPayload(pass)?.gym;
  return typeof gym === 'string' && LICENSE_RE.test(gym) ? gym : null;
}

function inboxPassStudentId(pass: string): string | null {
  const studentId = inboxPassPayload(pass)?.studentId;
  return typeof studentId === 'string' && studentId.trim() ? studentId : null;
}

/* ------------------------------ profile photos ------------------------------ */

/**
 * Student → head coach photo. Uses the student's own inbox code. When the cloud
 * is not connected, the caller saves the submission as a file instead.
 */
export async function submitStudentPhoto(
  pass: string,
  submission: { studentId: string; photoId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; reason: 'unbound' | 'denied' | 'refused' | 'offline' }> {
  const license = inboxPassLicense(pass);
  const studentId = inboxPassStudentId(pass);
  if (!pass || !license || !studentId || studentId !== submission.studentId) return { ok: false, reason: 'denied' };
  try {
    const response = await fetchImpl('/api/gym/inbox', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${pass}` },
      body: JSON.stringify({ action: 'photo-submit', license, studentId, submission }),
    });
    if (response.status === 503) return { ok: false, reason: 'unbound' };
    if (response.status === 403) return { ok: false, reason: 'denied' };
    if (!response.ok) return { ok: false, reason: 'refused' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

/** Head coach photo review on Advantage Cloud: list, decide, publish. */
export async function coachPhotoRequest(
  action: 'photo-list' | 'photo-decide' | 'photo-publish',
  input: { studentId: string; photoId?: string; decision?: 'approve' | 'decline' },
  options: { fetchImpl?: typeof fetch; token?: string | null } = {},
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number }> {
  const token = options.token ?? readStoredEntitlementToken();
  const license = token ? licenseIdFromToken(token) : null;
  if (!token || !license) return { ok: false, status: 0 };
  try {
    const response = await (options.fetchImpl ?? fetch)('/api/gym/inbox', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, license, ...input }),
    });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, body: (await response.json()) as Record<string, unknown> };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** The student id this phone's inbox code belongs to, or null. */
export function studentIdFromInboxPass(pass: string): string | null {
  return inboxPassStudentId(pass);
}

/* --------------------------- student → coach events -------------------------- */

/**
 * Send one tournament registration to the coach on Advantage Cloud with the
 * student's own inbox code. No code (not a gym-account phone) sends nothing.
 */
export async function submitStudentEvent(
  pass: string,
  event: { studentId: string; eventId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; reason: 'unbound' | 'denied' | 'refused' | 'offline' }> {
  const license = inboxPassLicense(pass);
  const studentId = inboxPassStudentId(pass);
  if (!pass || !license || !studentId || studentId !== event.studentId) return { ok: false, reason: 'denied' };
  try {
    const response = await fetchImpl('/api/gym/inbox', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${pass}` },
      body: JSON.stringify({ action: 'event-submit', license, studentId, event }),
    });
    if (response.status === 503) return { ok: false, reason: 'unbound' };
    if (response.status === 403) return { ok: false, reason: 'denied' };
    if (!response.ok) return { ok: false, reason: 'refused' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

/** Coach: list a student's events on Advantage Cloud. Read only. */
export async function coachStudentEventList(
  studentId: string,
  options: { fetchImpl?: typeof fetch; token?: string | null } = {},
): Promise<{ ok: true; events: unknown[] } | { ok: false; status: number }> {
  const token = options.token ?? readStoredEntitlementToken();
  const license = token ? licenseIdFromToken(token) : null;
  if (!token || !license) return { ok: false, status: 0 };
  try {
    const response = await (options.fetchImpl ?? fetch)('/api/gym/inbox', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'event-list', license, studentId }),
    });
    if (!response.ok) return { ok: false, status: response.status };
    const body = (await response.json()) as { events?: unknown };
    return { ok: true, events: Array.isArray(body.events) ? body.events : [] };
  } catch {
    return { ok: false, status: 0 };
  }
}

/* ----------------------------- student card share ---------------------------- */

/** Student → coach card share on Advantage Cloud, right after a QR sign-up. */
export async function submitStudentCardShare(
  license: string,
  share: { studentId: string; shareId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; reason: 'unbound' | 'refused' | 'offline' }> {
  if (!LICENSE_RE.test(license)) return { ok: false, reason: 'refused' };
  try {
    const response = await fetchImpl('/api/gym/inbox', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'card-share-submit', license, studentId: share.studentId, share }),
    });
    if (response.status === 503) return { ok: false, reason: 'unbound' };
    if (!response.ok) return { ok: false, reason: 'refused' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

/** Coach: list pending card shares, or mark one decided (a marker; nothing is deleted). */
export async function coachCardShareRequest(
  action: 'card-share-list' | 'card-share-decide',
  input: { studentId: string; shareId?: string },
  options: { fetchImpl?: typeof fetch; token?: string | null } = {},
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number }> {
  const token = options.token ?? readStoredEntitlementToken();
  const license = token ? licenseIdFromToken(token) : null;
  if (!token || !license) return { ok: false, status: 0 };
  try {
    const response = await (options.fetchImpl ?? fetch)('/api/gym/inbox', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, license, ...input }),
    });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, body: (await response.json()) as Record<string, unknown> };
  } catch {
    return { ok: false, status: 0 };
  }
}

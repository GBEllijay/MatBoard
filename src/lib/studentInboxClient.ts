/**
 * Student inbox on Advantage Cloud, with a file when the bucket is not bound.
 * Preview sites have no GYM_MEDIA binding. Probe then returns unbound and the
 * coach saves a file the student imports, the same path as coach feedback.
 */

import { ENTITLEMENT_TOKEN_KEY } from './entitlement.ts';
import { base64UrlToBytes } from './entitlementToken.ts';
import { exportProgressPacket, progressHandoffFileName } from './progress/format.ts';
import type { CoachCompetitionUpdatePacket, CoachRankUpdatePacket } from './progress/types.ts';

export type InboxPacket = CoachRankUpdatePacket | CoachCompetitionUpdatePacket;

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

export async function pullStudentInbox(
  pass: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; packets: unknown[] } | { ok: false; reason: 'unbound' | 'denied' | 'offline' }> {
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
    const body = (await response.json()) as { packets?: unknown };
    return { ok: true, packets: Array.isArray(body.packets) ? body.packets : [] };
  } catch {
    return { ok: false, reason: 'offline' };
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

function inboxPassLicense(pass: string): string | null {
  const gym = inboxPassPayload(pass)?.gym;
  return typeof gym === 'string' && LICENSE_RE.test(gym) ? gym : null;
}

function inboxPassStudentId(pass: string): string | null {
  const studentId = inboxPassPayload(pass)?.studentId;
  return typeof studentId === 'string' && studentId.trim() ? studentId : null;
}

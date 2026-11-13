/**
 * Per-student inbox under the gym's Advantage Cloud folder.
 * groups/<license>/students/<studentId>/inbox/<updateId>.json
 *
 * The gym owner, and instructor seats whose preset can upload (Coach and
 * Instructors), may write. A student pass can read and clear only that
 * student's own inbox. Assistant coach and program director seats cannot write.
 * Unlock codes, entitlements, Stripe, and Drive are not involved.
 *
 * These objects are shared copies under the academy license, not a transfer
 * of the student's journal, photos, or backup. Revoking the student license
 * ends academy access. It does not delete the student's own history.
 * Clearing an item writes a marker under inbox-cleared/. No R2 object is
 * deleted (gyms keep a 60-day download window after a lapse).
 *
 * Student profile photos: the student pass submits to photos/pending/. Only the
 * head coach (owner or Instructors seat) lists, decides (photos/decided/), and
 * publishes (photos/approved/). Approval never publishes on its own.
 */

import { readSignedJson, signJson, verifyToken, type EntitlementClaims } from '../lib/entitlementToken.ts';
import { readCoachAssessment, readCoachBeltProgress, readCoachNote } from '../lib/progress/syncPackets.ts';
import { photoReadyToSend, readPhotoSubmission } from '../lib/rosterPhotoApproval.ts';
import { cardShareReadyToSend, readStudentCardShare } from '../lib/studentCardShare.ts';
import { readTournamentRegistration } from '../lib/studentEvents.ts';
import { freeStudentGrantClosed } from './studentLicenses.ts';
import { STUDENT_LICENSE_REVOKED_MESSAGE, studentCloudPathAllowed } from '../lib/studentLicensePool.ts';
import { signingMaterial } from './tokenIssue.ts';
import { readCoachConnectVia } from './coachConnect.ts';
import type { D1Database } from './d1.ts';

export const INBOX_PACKET_KINDS = [
  'coach-rank-update',
  'coach-competition-update',
  'coach-belt-progress-update',
  'coach-assessment-update',
  'coach-note-update',
  'coach-gym-logo-update',
] as const;

const RANK_BELTS = new Set([
  'white',
  'blue',
  'purple',
  'brown',
  'black',
  'grey',
  'yellow',
  'orange',
  'green',
  'coral',
  'redWhite',
  'red',
]);

const BANNED_KEYS = new Set(['stripe', 'stripes', 'levelKey', 'met', 'journal', 'rubric', 'goals', 'checklist']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type StoredRankUpdate = {
  schemaVersion: 1 | 2;
  kind: 'coach-rank-update';
  id: string;
  studentId: string;
  updatedAt: number;
  issuedAt: number;
  updateId: string;
  rankUpdate: {
    belt: string;
    stripeCount: number;
    promotionDate: string;
    note: string;
  };
  gym?: { name: string; logo?: string };
};

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const LICENSE_RE = /^[A-Za-z0-9_-]{8,80}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const PASS_SECONDS = 180 * 24 * 60 * 60;
const MAX_PACKET_CHARS = 400_000;

const UPLOAD_PRESETS = new Set(['coach', 'instructors']);

export type InboxObject = {
  body?: ReadableStream | null;
  text?: () => Promise<string>;
  httpMetadata?: { contentType?: string };
};

export type InboxBucket = {
  get(key: string): Promise<InboxObject | null>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string }): Promise<{ objects: { key: string }[] }>;
};

export type StudentInboxEnv = {
  GYM_MEDIA?: InboxBucket;
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
  ENTITLEMENTS_DB?: D1Database | null;
};

export type StudentInboxPass = {
  typ: 'student-inbox';
  v: 1;
  gym: string;
  studentId: string;
  exp: number;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function inboxPrefix(license: string, studentId: string): string {
  return `groups/${license}/students/${studentId}/inbox/`;
}

export function inboxObjectKey(license: string, studentId: string, updateId: string): string {
  return `${inboxPrefix(license, studentId)}${updateId}.json`;
}

function bearerOf(request: Request): string {
  const auth = request.headers.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
}

function isSeat(claims: EntitlementClaims): boolean {
  return claims.src === 'seat' || claims.tier === 'seat';
}

/** Owner of this license, or a Coach / Instructors seat with upload rights. */
export function canWriteStudentInbox(claims: EntitlementClaims | null, license: string): boolean {
  if (!claims || claims.subs?.state === 'locked') return false;
  if (!LICENSE_RE.test(license)) return false;
  if (isSeat(claims)) {
    return claims.gym === license && UPLOAD_PRESETS.has(claims.preset ?? '');
  }
  if (claims.sub !== license) return false;
  return claims.tier === 'owner' || claims.grants.includes('pro') || claims.grants.includes('coach');
}

export function studentPassAllows(
  pass: StudentInboxPass | null,
  license: string,
  studentId: string,
  nowSec: number,
): boolean {
  if (!pass || pass.typ !== 'student-inbox' || pass.v !== 1) return false;
  if (pass.gym !== license || pass.studentId !== studentId) return false;
  return typeof pass.exp === 'number' && pass.exp > nowSec;
}

function asPass(value: unknown): StudentInboxPass | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<StudentInboxPass>;
  if (row.typ !== 'student-inbox' || row.v !== 1) return null;
  if (typeof row.gym !== 'string' || typeof row.studentId !== 'string' || typeof row.exp !== 'number') return null;
  return { typ: 'student-inbox', v: 1, gym: row.gym, studentId: row.studentId, exp: row.exp };
}

function carriesBannedKey(value: unknown): boolean {
  const stack: unknown[] = [value];
  const seen = new Set<object>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (BANNED_KEYS.has(key)) return true;
      if (child && typeof child === 'object') stack.push(child);
    }
  }
  return false;
}

function realDay(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Same rules as the progress file: known belt, stripe count, date, and no checklist. */
export function readStoredRankUpdate(value: unknown): StoredRankUpdate | null {
  if (!value || typeof value !== 'object' || carriesBannedKey(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 1 && row.schemaVersion !== 2) return null;
  if (row.kind !== 'coach-rank-update') return null;
  if (typeof row.id !== 'string' || !ID_RE.test(row.id)) return null;
  if (typeof row.studentId !== 'string' || !ID_RE.test(row.studentId)) return null;
  if (typeof row.updateId !== 'string' || !ID_RE.test(row.updateId)) return null;
  if (typeof row.updatedAt !== 'number' || !Number.isFinite(row.updatedAt) || row.updatedAt < 0) return null;
  if (typeof row.issuedAt !== 'number' || !Number.isFinite(row.issuedAt) || row.issuedAt < 0) return null;
  if (!row.rankUpdate || typeof row.rankUpdate !== 'object') return null;
  const rank = row.rankUpdate as Record<string, unknown>;
  if (typeof rank.belt !== 'string' || !RANK_BELTS.has(rank.belt)) return null;
  if (typeof rank.stripeCount !== 'number' || !Number.isInteger(rank.stripeCount) || rank.stripeCount < 0 || rank.stripeCount > 4) {
    return null;
  }
  if (typeof rank.promotionDate !== 'string' || !realDay(rank.promotionDate)) return null;
  const note = typeof rank.note === 'string' ? rank.note.trim() : '';
  if (note.length > 500) return null;
  const stored: StoredRankUpdate = {
    schemaVersion: row.schemaVersion,
    kind: 'coach-rank-update',
    id: row.id,
    studentId: row.studentId,
    updatedAt: row.updatedAt,
    issuedAt: row.issuedAt,
    updateId: row.updateId,
    rankUpdate: { belt: rank.belt, stripeCount: rank.stripeCount, promotionDate: rank.promotionDate, note },
  };
  attachStoredGym(stored, row.gym);
  return stored;
}

function attachStoredGym(stored: { gym?: { name: string; logo?: string } }, gym: unknown): void {
  if (!gym || typeof gym !== 'object') return;
  const row = gym as Record<string, unknown>;
  const name = typeof row.name === 'string' ? row.name.trim().slice(0, 80) : '';
  const logo =
    typeof row.logo === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/.test(row.logo) && row.logo.length <= 350_000
      ? row.logo
      : undefined;
  if (name) stored.gym = logo ? { name, logo } : { name };
}

export type StoredCompetitionUpdate = {
  schemaVersion: 1 | 2;
  kind: 'coach-competition-update';
  id: string;
  studentId: string;
  updatedAt: number;
  issuedAt: number;
  updateId: string;
  competitionUpdate: {
    tournamentName: string;
    date: string;
    location: string;
    division: string;
    weightClass: string;
    matches: { opponent: string; result: string; method: string; note: string; round?: string }[];
  };
  gym?: { name: string; logo?: string };
};

export function readStoredCompetitionUpdate(value: unknown): StoredCompetitionUpdate | null {
  if (!value || typeof value !== 'object' || carriesBannedKey(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 1 && row.schemaVersion !== 2) return null;
  if (row.kind !== 'coach-competition-update') return null;
  if (typeof row.id !== 'string' || !ID_RE.test(row.id)) return null;
  if (typeof row.studentId !== 'string' || !ID_RE.test(row.studentId)) return null;
  if (typeof row.updateId !== 'string' || !ID_RE.test(row.updateId)) return null;
  if (typeof row.updatedAt !== 'number' || typeof row.issuedAt !== 'number') return null;
  if (!row.competitionUpdate || typeof row.competitionUpdate !== 'object') return null;
  const event = row.competitionUpdate as Record<string, unknown>;
  const tournamentName = typeof event.tournamentName === 'string' ? event.tournamentName.trim().slice(0, 80) : '';
  if (!tournamentName || typeof event.date !== 'string' || !realDay(event.date)) return null;
  if (!Array.isArray(event.matches) || event.matches.length > 40) return null;
  const matches: StoredCompetitionUpdate['competitionUpdate']['matches'] = [];
  for (const item of event.matches) {
    if (!item || typeof item !== 'object') return null;
    const match = item as Record<string, unknown>;
    const opponent = typeof match.opponent === 'string' ? match.opponent.trim().slice(0, 80) : '';
    if (!opponent) return null;
    if (match.result !== 'win' && match.result !== 'loss' && match.result !== 'draw') return null;
    if (match.method !== '' && match.method !== 'points' && match.method !== 'sub' && match.method !== 'advantage' && match.method !== 'dq') {
      return null;
    }
    const note = typeof match.note === 'string' ? match.note.trim().slice(0, 500) : '';
    const round = typeof match.round === 'string' ? match.round.trim().slice(0, 80) : '';
    matches.push({ opponent, result: match.result, method: match.method, note, ...(round ? { round } : {}) });
  }
  const stored: StoredCompetitionUpdate = {
    schemaVersion: row.schemaVersion,
    kind: 'coach-competition-update',
    id: row.id,
    studentId: row.studentId,
    updatedAt: row.updatedAt,
    issuedAt: row.issuedAt,
    updateId: row.updateId,
    competitionUpdate: {
      tournamentName,
      date: event.date,
      location: typeof event.location === 'string' ? event.location.trim().slice(0, 500) : '',
      division: typeof event.division === 'string' ? event.division.trim().slice(0, 80) : '',
      weightClass: typeof event.weightClass === 'string' ? event.weightClass.trim().slice(0, 80) : '',
      matches,
    },
  };
  attachStoredGym(stored, row.gym);
  return stored;
}

type SyncEnvelope = {
  schemaVersion: 1 | 2;
  id: string;
  studentId: string;
  updatedAt: number;
  issuedAt: number;
  updateId: string;
  gym?: { name: string; logo?: string };
};

function readEnvelope(row: Record<string, unknown>): SyncEnvelope | null {
  if (row.schemaVersion !== 1 && row.schemaVersion !== 2) return null;
  if (typeof row.id !== 'string' || !ID_RE.test(row.id)) return null;
  if (typeof row.studentId !== 'string' || !ID_RE.test(row.studentId)) return null;
  if (typeof row.updateId !== 'string' || !ID_RE.test(row.updateId)) return null;
  if (typeof row.updatedAt !== 'number' || !Number.isFinite(row.updatedAt) || row.updatedAt < 0) return null;
  if (typeof row.issuedAt !== 'number' || !Number.isFinite(row.issuedAt) || row.issuedAt < 0) return null;
  return {
    schemaVersion: row.schemaVersion,
    id: row.id,
    studentId: row.studentId,
    updatedAt: row.updatedAt,
    issuedAt: row.issuedAt,
    updateId: row.updateId,
  };
}

/**
 * Belt progress, coach assessment, and gym logo packets. Same rules as the
 * progress file: no checklist, met marks, rubric, or journal keys ride along.
 */
export function readStoredSyncPacket(value: unknown): (SyncEnvelope & { kind: string }) | null {
  if (!value || typeof value !== 'object' || carriesBannedKey(value)) return null;
  const row = value as Record<string, unknown>;
  const envelope = readEnvelope(row);
  if (!envelope) return null;
  const errors: string[] = [];
  if (row.kind === 'coach-belt-progress-update') {
    const beltProgress = readCoachBeltProgress(row.beltProgress, errors);
    if (errors.length) return null;
    const stored = { ...envelope, kind: row.kind, beltProgress };
    attachStoredGym(stored, row.gym);
    return stored;
  }
  if (row.kind === 'coach-assessment-update') {
    const assessment = readCoachAssessment(row.assessment, errors);
    if (errors.length) return null;
    const stored = { ...envelope, kind: row.kind, assessment };
    attachStoredGym(stored, row.gym);
    return stored;
  }
  if (row.kind === 'coach-note-update') {
    const coachNote = readCoachNote(row.coachNote, errors);
    if (errors.length) return null;
    const stored = { ...envelope, kind: row.kind, coachNote };
    attachStoredGym(stored, row.gym);
    return stored;
  }
  if (row.kind === 'coach-gym-logo-update') {
    const gymLogo = row.gymLogo as Record<string, unknown> | undefined;
    const logoVersion = gymLogo && typeof gymLogo === 'object' ? gymLogo.logoVersion : undefined;
    if (typeof logoVersion !== 'number' || !Number.isFinite(logoVersion) || logoVersion < 0) return null;
    const stored: SyncEnvelope & { kind: string; gymLogo: { logoVersion: number } } = {
      ...envelope,
      kind: row.kind,
      gymLogo: { logoVersion },
    };
    const gym = row.gym as Record<string, unknown> | undefined;
    const name = gym && typeof gym.name === 'string' ? gym.name.trim().slice(0, 80) : '';
    const logo = gym?.logo;
    if (typeof logo !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,/.test(logo) || logo.length > 350_000) {
      return null;
    }
    stored.gym = { name, logo };
    return stored;
  }
  return null;
}

/** Cleared items get a marker. The R2 object itself is kept (60-day download window). */
export function inboxClearedKey(license: string, studentId: string, updateId: string): string {
  return `groups/${license}/students/${studentId}/inbox-cleared/${updateId}`;
}

export function photoKey(
  license: string,
  studentId: string,
  lane: 'pending' | 'decided' | 'approved',
  photoId: string,
): string {
  return `groups/${license}/students/${studentId}/photos/${lane}/${photoId}.json`;
}

/** Head coach: the license owner or an Instructors seat. Not Coach, Assistant coach, or Program director. */
export function canApproveStudentPhotos(claims: EntitlementClaims | null, license: string): boolean {
  if (!canWriteStudentInbox(claims, license) || !claims) return false;
  if (isSeat(claims)) return claims.preset === 'instructors';
  return true;
}

const PHOTO_PENDING_MAX = 20;
const STUDENT_EVENTS_MAX = 100;
const CARD_SHARES_MAX = 50;

export function cardShareKey(license: string, shareId: string): string {
  return `groups/${license}/card-shares/${shareId}.json`;
}

export function cardShareDecidedKey(license: string, shareId: string): string {
  return `groups/${license}/card-shares-decided/${shareId}`;
}

/** Student → coach tournament registrations. One object per tournament. */
export function studentEventKey(license: string, studentId: string, eventId: string): string {
  return `groups/${license}/students/${studentId}/events/${eventId}.json`;
}

async function objectText(object: InboxObject): Promise<string> {
  if (object.text) return object.text();
  if (!object.body) return '';
  return new Response(object.body).text();
}

export async function handleStudentInbox(
  request: Request,
  env: StudentInboxEnv,
  now: () => Date = () => new Date(),
): Promise<Response> {
  const bucket = env.GYM_MEDIA;
  const url = new URL(request.url);
  if (!bucket) return json(503, { ok: false, reason: 'unbound' });
  if (request.method === 'GET' && url.searchParams.get('probe') === '1') return json(200, { ok: true, bound: true });

  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return json(503, { ok: false, error: 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.' });
  const keys = [{ kid: material.kid, jwk: material.publicJwk }];
  const closedFree = async (studentId: string): Promise<Response | null> => {
    if (!(await freeStudentGrantClosed(env.ENTITLEMENTS_DB ?? null, studentId, now()))) return null;
    return json(403, { ok: false, error: STUDENT_LICENSE_REVOKED_MESSAGE });
  };

  if (request.method === 'POST') {
    let body: {
      action?: unknown;
      token?: unknown;
      license?: unknown;
      studentId?: unknown;
      packet?: unknown;
      submission?: unknown;
      photoId?: unknown;
      decision?: unknown;
      event?: unknown;
      share?: unknown;
      shareId?: unknown;
    } = {};
    try {
      body = JSON.parse(await request.text()) as typeof body;
    } catch {
      return json(400, { ok: false, error: 'The inbox request was not JSON.' });
    }
    const token = bearerOf(request) || (typeof body.token === 'string' ? body.token : '');
    const license = typeof body.license === 'string' ? body.license : '';
    const studentId = typeof body.studentId === 'string' ? body.studentId : '';
    if (!LICENSE_RE.test(license) || !ID_RE.test(studentId)) {
      return json(400, { ok: false, error: 'Missing license or student id.' });
    }

    if (body.action === 'photo-submit') {
      // Student → head coach. Signed with the student's own inbox pass.
      const pass = asPass(token ? await readSignedJson(token, keys) : null);
      if (!studentPassAllows(pass, license, studentId, Math.floor(now().getTime() / 1000))) {
        return json(403, { ok: false, error: 'Only this student can send a photo to the coach.' });
      }
      const photoClosed = await closedFree(studentId);
      if (photoClosed) return photoClosed;
      const submission = readPhotoSubmission(body.submission);
      if (!submission || submission.studentId !== studentId) {
        return json(400, { ok: false, error: 'That is not a profile photo for this student.' });
      }
      if (!photoReadyToSend(submission)) {
        return json(400, { ok: false, error: 'A parent must approve this photo first.' });
      }
      const pending = await bucket.list({ prefix: `groups/${license}/students/${studentId}/photos/pending/` });
      if (pending.objects.length >= PHOTO_PENDING_MAX) {
        return json(429, { ok: false, error: 'Too many photos are waiting for the coach.' });
      }
      await bucket.put(photoKey(license, studentId, 'pending', submission.photoId), JSON.stringify(submission), {
        httpMetadata: { contentType: 'application/json' },
      });
      return json(200, { ok: true, photoId: submission.photoId, stage: 'awaiting-head-coach' });
    }

    if (body.action === 'card-share-submit') {
      // Student → coach card share after a QR sign-up. The phone has no inbox
      // pass yet, so this is open: strict payload, no journal or notes, a size
      // and count cap, parent stamp enforced, and it only ever lands as pending.
      const share = readStudentCardShare(body.share);
      if (!share || share.studentId !== studentId) {
        return json(400, { ok: false, error: 'That is not a student card share.' });
      }
      if (!cardShareReadyToSend(share)) return json(400, { ok: false, error: 'A parent must approve this first.' });
      // Who showed the code: only a signed coach connect code for this license counts.
      // A phone-written viaInstructorId is dropped, and the code itself is never stored.
      const { via, viaInstructorId: _unchecked, ...rest } = share;
      void _unchecked;
      const checkedVia = via ? await readCoachConnectVia(via, keys, license) : null;
      const stored = checkedVia ? { ...rest, viaInstructorId: checkedVia } : rest;
      const key = cardShareKey(license, share.shareId);
      if (!(await bucket.get(key))) {
        const listed = await bucket.list({ prefix: `groups/${license}/card-shares/` });
        if (listed.objects.length >= CARD_SHARES_MAX) {
          return json(429, { ok: false, error: 'Too many student cards are waiting for the coach.' });
        }
      }
      await bucket.put(key, JSON.stringify(stored), { httpMetadata: { contentType: 'application/json' } });
      return json(200, { ok: true, shareId: share.shareId, stage: 'pending', viaInstructorId: checkedVia });
    }

    if (body.action === 'event-submit') {
      // Student → coach: tournament registration only. Signed with the student's own inbox pass.
      const pass = asPass(token ? await readSignedJson(token, keys) : null);
      if (!studentPassAllows(pass, license, studentId, Math.floor(now().getTime() / 1000))) {
        return json(403, { ok: false, error: 'Only this student can tell the coach about their tournament.' });
      }
      const eventClosed = await closedFree(studentId);
      if (eventClosed) return eventClosed;
      const event = readTournamentRegistration(body.event);
      if (!event || event.studentId !== studentId) {
        return json(400, { ok: false, error: 'That is not a tournament registration for this student.' });
      }
      const key = studentEventKey(license, studentId, event.eventId);
      const existing = await bucket.get(key);
      if (!existing) {
        const listed = await bucket.list({ prefix: `groups/${license}/students/${studentId}/events/` });
        if (listed.objects.length >= STUDENT_EVENTS_MAX) {
          return json(429, { ok: false, error: 'Too many tournament notices are waiting for the coach.' });
        }
      }
      // Same tournament again writes the same key. Nothing is ever deleted.
      await bucket.put(key, JSON.stringify(event), { httpMetadata: { contentType: 'application/json' } });
      return json(200, { ok: true, eventId: event.eventId });
    }

    const claims = token ? await verifyToken(token, keys) : null;

    if (body.action === 'card-share-list' || body.action === 'card-share-decide') {
      if (!canWriteStudentInbox(claims, license)) {
        return json(403, { ok: false, error: 'Only an Instructor or Coach seat can review student cards.' });
      }
      if (body.action === 'card-share-decide') {
        const shareId = typeof body.shareId === 'string' ? body.shareId : '';
        if (!ID_RE.test(shareId)) return json(400, { ok: false, error: 'Missing share id.' });
        if (!(await bucket.get(cardShareKey(license, shareId)))) return json(404, { ok: false, error: 'That card share is not waiting.' });
        // A marker only. The share itself stays in R2 (60-day download window).
        await bucket.put(cardShareDecidedKey(license, shareId), String(now().getTime()), {
          httpMetadata: { contentType: 'text/plain' },
        });
        return json(200, { ok: true, shareId });
      }
      const decidedPrefix = cardShareDecidedKey(license, '');
      const decided = new Set((await bucket.list({ prefix: decidedPrefix })).objects.map((row) => row.key.slice(decidedPrefix.length)));
      const listed = await bucket.list({ prefix: `groups/${license}/card-shares/` });
      const shares: unknown[] = [];
      for (const object of listed.objects) {
        const stored = await bucket.get(object.key);
        if (!stored) continue;
        try {
          const share = readStudentCardShare(JSON.parse(await objectText(stored)));
          if (share && !decided.has(share.shareId)) shares.push(share);
        } catch {
          /* a corrupt object stays out of the list */
        }
      }
      return json(200, { ok: true, shares });
    }

    if (body.action === 'event-list') {
      if (!canWriteStudentInbox(claims, license)) {
        return json(403, { ok: false, error: 'Only the gym owner or an instructor with upload rights can read student notices.' });
      }
      const listed = await bucket.list({ prefix: `groups/${license}/students/${studentId}/events/` });
      const events: unknown[] = [];
      for (const object of listed.objects) {
        const stored = await bucket.get(object.key);
        if (!stored) continue;
        try {
          const event = readTournamentRegistration(JSON.parse(await objectText(stored)));
          if (event && event.studentId === studentId) events.push(event);
        } catch {
          /* a corrupt object stays out of the list */
        }
      }
      return json(200, { ok: true, events });
    }

    if (body.action === 'photo-list' || body.action === 'photo-decide' || body.action === 'photo-publish') {
      if (!canApproveStudentPhotos(claims, license)) {
        return json(403, { ok: false, error: 'Only the head coach can review student photos.' });
      }
      if (body.action === 'photo-list') {
        const prefix = `groups/${license}/students/${studentId}/photos/`;
        const listed = await bucket.list({ prefix });
        const decided = new Set(
          listed.objects.filter((row) => row.key.startsWith(`${prefix}decided/`)).map((row) => row.key.slice(`${prefix}decided/`.length)),
        );
        const photos: unknown[] = [];
        for (const object of listed.objects) {
          if (!object.key.startsWith(`${prefix}pending/`)) continue;
          if (decided.has(object.key.slice(`${prefix}pending/`.length))) continue;
          const stored = await bucket.get(object.key);
          if (!stored) continue;
          const submission = readPhotoSubmission(JSON.parse(await objectText(stored)));
          if (submission) photos.push(submission);
        }
        return json(200, { ok: true, photos });
      }
      const photoId = typeof body.photoId === 'string' ? body.photoId : '';
      if (!ID_RE.test(photoId)) return json(400, { ok: false, error: 'Missing photo id.' });
      const pendingObject = await bucket.get(photoKey(license, studentId, 'pending', photoId));
      if (!pendingObject) return json(404, { ok: false, error: 'That photo is not waiting for review.' });
      const submission = readPhotoSubmission(JSON.parse(await objectText(pendingObject)));
      if (!submission) return json(404, { ok: false, error: 'That photo is not waiting for review.' });
      const decidedObject = await bucket.get(photoKey(license, studentId, 'decided', photoId));
      const previous = decidedObject ? (JSON.parse(await objectText(decidedObject)) as { decision?: unknown }) : null;
      if (body.action === 'photo-decide') {
        if (body.decision !== 'approve' && body.decision !== 'decline') {
          return json(400, { ok: false, error: 'Choose approve or decline.' });
        }
        if (previous) return json(409, { ok: false, error: 'That photo was already decided.' });
        await bucket.put(
          photoKey(license, studentId, 'decided', photoId),
          JSON.stringify({ photoId, decision: body.decision, decidedAt: now().getTime() }),
          { httpMetadata: { contentType: 'application/json' } },
        );
        // Approval does not publish. Publishing is its own head-coach step.
        return json(200, { ok: true, photoId, stage: body.decision === 'approve' ? 'approved' : 'declined' });
      }
      if (previous?.decision !== 'approve') return json(409, { ok: false, error: 'Approve the photo before publishing it.' });
      const key = photoKey(license, studentId, 'approved', photoId);
      await bucket.put(key, JSON.stringify({ ...submission, publishedAt: now().getTime() }), {
        httpMetadata: { contentType: 'application/json' },
      });
      return json(200, { ok: true, photoId, path: key });
    }

    if (!canWriteStudentInbox(claims, license)) {
      return json(403, { ok: false, error: 'Only the gym owner or an instructor with upload rights can write a student inbox.' });
    }
    const exp = Math.floor(now().getTime() / 1000) + PASS_SECONDS;
    const studentPass = await signJson(
      material.kid,
      { typ: 'student-inbox', v: 1, gym: license, studentId, exp },
      material.privateJwk,
    );
    if (body.action === 'pass') return json(200, { ok: true, studentPass });
    const parsed =
      readStoredRankUpdate(body.packet) ?? readStoredCompetitionUpdate(body.packet) ?? readStoredSyncPacket(body.packet);
    if (!parsed) return json(400, { ok: false, error: 'That file is not a coach update for a student inbox.' });
    if (parsed.studentId !== studentId || !ID_RE.test(parsed.updateId)) {
      return json(400, { ok: false, error: 'The update is for a different student.' });
    }
    const text = JSON.stringify(parsed);
    if (text.length > MAX_PACKET_CHARS) return json(413, { ok: false, error: 'That update is too large.' });
    await bucket.put(inboxObjectKey(license, studentId, parsed.updateId), text, {
      httpMetadata: { contentType: 'application/json' },
    });
    return json(200, { ok: true, updateId: parsed.updateId, studentPass });
  }

  if (request.method === 'GET' || request.method === 'DELETE') {
    const license = url.searchParams.get('license') ?? '';
    const studentId = url.searchParams.get('studentId') ?? '';
    if (!LICENSE_RE.test(license) || !ID_RE.test(studentId)) {
      return json(400, { ok: false, error: 'Missing license or student id.' });
    }
    const parsedPass = bearerOf(request) ? await readSignedJson(bearerOf(request), keys) : null;
    const pass = asPass(parsedPass);
    if (!studentPassAllows(pass, license, studentId, Math.floor(now().getTime() / 1000))) {
      return json(403, { ok: false, error: 'A student can read and clear only their own inbox.' });
    }
    const inboxClosed = await closedFree(studentId);
    if (inboxClosed) return inboxClosed;
    const file = url.searchParams.get('file') ?? '';
    if (file && request.method === 'GET') {
      if (!studentCloudPathAllowed(file, studentId) || !file.includes('/from-instructor/')) {
        return json(404, { ok: false, error: 'That file is not in your folder.' });
      }
      const stored = await bucket.get(`groups/${license}/${file}`);
      if (!stored) return json(404, { ok: false, error: 'That file is not in your folder.' });
      const name = file.split('/').pop() ?? 'file';
      const headers = new Headers({
        'content-type': stored.httpMetadata?.contentType || 'application/octet-stream',
        'cache-control': 'private, no-store',
        'content-disposition': `attachment; filename="${name}"`,
      });
      if (stored.body) return new Response(stored.body, { status: 200, headers });
      return new Response(await objectText(stored), { status: 200, headers });
    }
    if (request.method === 'DELETE') {
      const updateId = url.searchParams.get('updateId') ?? '';
      if (!ID_RE.test(updateId)) return json(400, { ok: false, error: 'Missing update id.' });
      // Never delete R2 files. A marker hides the item from this student's list.
      await bucket.put(inboxClearedKey(license, studentId, updateId), String(now().getTime()), {
        httpMetadata: { contentType: 'text/plain' },
      });
      return json(200, { ok: true, cleared: true });
    }
    const prefix = inboxPrefix(license, studentId);
    const listed = await bucket.list({ prefix });
    const clearedPrefix = inboxClearedKey(license, studentId, '');
    const cleared = new Set(
      (await bucket.list({ prefix: clearedPrefix })).objects.map((row) => row.key.slice(clearedPrefix.length)),
    );
    const packets: unknown[] = [];
    for (const object of listed.objects) {
      const rest = object.key.startsWith(prefix) ? object.key.slice(prefix.length) : '';
      if (!rest.endsWith('.json') || rest.includes('/')) continue;
      if (cleared.has(rest.slice(0, -'.json'.length))) continue;
      const stored = await bucket.get(object.key);
      if (!stored) continue;
      try {
        packets.push(JSON.parse(await objectText(stored)));
      } catch {
        /* a corrupt object stays out of the card list */
      }
    }
    const fromPrefix = `groups/${license}/students/${studentId}/from-instructor/`;
    const fromListed = await bucket.list({ prefix: fromPrefix });
    const fromInstructor: { name: string; path: string; dateKey: string }[] = [];
    for (const object of fromListed.objects) {
      const relative = object.key.startsWith(`groups/${license}/`) ? object.key.slice(`groups/${license}/`.length) : '';
      if (!studentCloudPathAllowed(relative, studentId)) continue;
      const parts = relative.split('/');
      fromInstructor.push({ name: parts[4] ?? relative, path: relative, dateKey: parts[3] ?? '' });
    }
    return json(200, { ok: true, packets, fromInstructor });
  }

  return json(405, { ok: false, error: 'Method not allowed.' });
}

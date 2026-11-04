/**
 * Per-student inbox under the gym's Advantage Cloud folder.
 * groups/<license>/students/<studentId>/inbox/<updateId>.json
 *
 * The gym owner, and instructor seats whose preset can upload (Coach and
 * Instructors), may write. A student pass can read and clear only that
 * student's own inbox. Assistant coach and program director seats cannot write.
 * Unlock codes, entitlements, Stripe, and Drive are not involved.
 */

import { readSignedJson, signJson, verifyToken, type EntitlementClaims } from '../lib/entitlementToken.ts';
import { signingMaterial } from './tokenIssue.ts';

export const INBOX_PACKET_KINDS = ['coach-rank-update', 'coach-competition-update'] as const;

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
    matches: { opponent: string; result: string; method: string; note: string }[];
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
    matches.push({ opponent, result: match.result, method: match.method, note });
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

  if (request.method === 'POST') {
    let body: { action?: unknown; token?: unknown; license?: unknown; studentId?: unknown; packet?: unknown } = {};
    try {
      body = JSON.parse(await request.text()) as typeof body;
    } catch {
      return json(400, { ok: false, error: 'The inbox request was not JSON.' });
    }
    const token = bearerOf(request) || (typeof body.token === 'string' ? body.token : '');
    const claims = token ? await verifyToken(token, keys) : null;
    const license = typeof body.license === 'string' ? body.license : '';
    const studentId = typeof body.studentId === 'string' ? body.studentId : '';
    if (!LICENSE_RE.test(license) || !ID_RE.test(studentId)) {
      return json(400, { ok: false, error: 'Missing license or student id.' });
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
    const parsed = readStoredRankUpdate(body.packet) ?? readStoredCompetitionUpdate(body.packet);
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
    if (request.method === 'DELETE') {
      const updateId = url.searchParams.get('updateId') ?? '';
      if (!ID_RE.test(updateId)) return json(400, { ok: false, error: 'Missing update id.' });
      await bucket.delete(inboxObjectKey(license, studentId, updateId));
      return json(200, { ok: true, cleared: true });
    }
    const prefix = inboxPrefix(license, studentId);
    const listed = await bucket.list({ prefix });
    const packets: unknown[] = [];
    for (const object of listed.objects) {
      const rest = object.key.startsWith(prefix) ? object.key.slice(prefix.length) : '';
      if (!rest.endsWith('.json') || rest.includes('/')) continue;
      const stored = await bucket.get(object.key);
      if (!stored) continue;
      try {
        packets.push(JSON.parse(await objectText(stored)));
      } catch {
        /* a corrupt object stays out of the card list */
      }
    }
    return json(200, { ok: true, packets });
  }

  return json(405, { ok: false, error: 'Method not allowed.' });
}

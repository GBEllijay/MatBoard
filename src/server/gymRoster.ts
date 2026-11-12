/**
 * Advantage Cloud master roster for one gym license.
 *
 * R2 keys, all under the license's own `groups/{licenseId}/roster/` prefix in GYM_MEDIA:
 *   master.json           shared roster backup (kind advantage-roster-backup, scope shared)
 *   pending/{id}.json     a seat's roster adds and edits waiting for the head coach
 *   settings.json         { trustMode } — off unless the owner turns it on
 *   private/{author}.json one author's private coach notes, never merged into master.json
 *
 * Who can do what:
 * - Plus Cloud is required. Revoked seats are refused by readGymCloudActor.
 * - Owner, Coach, and Instructors seats can read the master roster and submit.
 *   Assistant Coach, Program Director, and custom (no preset) seats are refused.
 * - The owner's submissions apply at once. A seat's submissions are pending unless trust mode is on.
 * - The owner and an Instructors seat approve or reject. A seat never decides its own submission.
 * - Only the owner turns trust mode on or off.
 * - Private notes: each author writes only their own file. The owner reads every author's file.
 *   A seat reads only its own. They are never in master.json, pending files, or any student route.
 *
 * The roster is the academy's record. It is not the student's journal or backup.
 * Nothing here deletes from R2. Approve and reject rewrite the pending file with its new status.
 * Merging into master only adds students or fills blanks (rosterBackup.mergeRosterBackup).
 */

import { cloudCapBytes } from '../lib/advantageCloudMedia.ts';
import {
  ROSTER_BACKUP_KIND,
  buildRosterBackup,
  mergeRosterBackup,
  parseRosterBackup,
  sharedRosterBackup,
  type RosterBackup,
  type RosterMergeReport,
} from '../lib/rosterBackup.ts';
import { gymBytesUnder, readGymCloudActor, type GymCloudActor, type GymCloudEnv } from './gymCloud.ts';

export const ROSTER_MASTER_MAX_BYTES = 20_000_000;
export const ROSTER_PRIVATE_MAX_BYTES = 2_000_000;
export const ROSTER_PENDING_LIST_MAX = 200;
const PRIVATE_NOTE_MAX = 4000;

export type RosterPendingStatus = 'pending' | 'approved' | 'rejected';

export type RosterPendingRecord = {
  id: string;
  status: RosterPendingStatus;
  submittedAt: string;
  submittedBy: { kind: 'owner' | 'seat'; seatId: string; preset: string | null };
  summary: { students: number; names: string[] };
  backup: RosterBackup;
  decidedAt?: string;
  decidedBy?: { kind: 'owner' | 'seat'; seatId: string };
  report?: RosterMergeReport;
};

export type RosterRole = { canRead: boolean; canSubmit: boolean; canApprove: boolean; isOwner: boolean };

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Roster role for a signed-in actor. Exported for tests. */
export function rosterRole(actor: Pick<GymCloudActor, 'kind' | 'preset' | 'plusCloud'>): RosterRole {
  if (!actor.plusCloud) return { canRead: false, canSubmit: false, canApprove: false, isOwner: false };
  if (actor.kind === 'owner') return { canRead: true, canSubmit: true, canApprove: true, isOwner: true };
  const preset = actor.preset ?? '';
  // Only the Coach and Instructors presets use the gym roster. Assistant Coach, Program Director,
  // and custom seats (no preset) are refused so no preset gains roster reach it did not have.
  if (preset !== 'coach' && preset !== 'instructors') {
    return { canRead: false, canSubmit: false, canApprove: false, isOwner: false };
  }
  return { canRead: true, canSubmit: true, canApprove: preset === 'instructors', isOwner: false };
}

function prefix(actor: GymCloudActor): string {
  return `groups/${actor.licenseId}/roster/`;
}

function authorKey(actor: GymCloudActor): string {
  return actor.kind === 'owner' ? 'owner' : `seat-${actor.seatId.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

async function readJson<T>(env: GymCloudEnv, key: string): Promise<T | null> {
  const object = await env.GYM_MEDIA!.get(key);
  if (!object) return null;
  try {
    return JSON.parse(await new Response(object.body).text()) as T;
  } catch {
    return null;
  }
}

async function writeJson(env: GymCloudEnv, key: string, value: unknown, max: number): Promise<Response | null> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.byteLength > max) return json(413, { ok: false, error: 'That roster is too large for Advantage Cloud.' });
  const bucket = env.GYM_MEDIA!;
  const cap = cloudCapBytes(env.GYM_MEDIA_LICENSE_CAP_BYTES);
  const license = /^groups\/[^/]+\//.exec(key)?.[0] ?? key;
  const [used, existing] = await Promise.all([gymBytesUnder(bucket, license), bucket.head(key)]);
  if (used - (existing?.size ?? 0) + bytes.byteLength > cap) {
    return json(409, { ok: false, error: 'Advantage Cloud is full.' });
  }
  await bucket.put(key, bytes, { httpMetadata: { contentType: 'application/json' } });
  return null;
}

async function readTrustMode(env: GymCloudEnv, actor: GymCloudActor): Promise<boolean> {
  const settings = await readJson<{ trustMode?: unknown }>(env, `${prefix(actor)}settings.json`);
  return settings?.trustMode === true;
}

async function readMaster(env: GymCloudEnv, actor: GymCloudActor): Promise<RosterBackup | null> {
  const raw = await readJson<unknown>(env, `${prefix(actor)}master.json`);
  if (!raw) return null;
  const parsed = parseRosterBackup(JSON.stringify(raw));
  return parsed.ok ? sharedRosterBackup(parsed.backup) : null;
}

function emptyShared(now: Date): RosterBackup {
  return buildRosterBackup(
    { roster: { version: 1, students: [], ready: {}, gamePlans: {}, competitionPlans: {} }, cardFile: { cards: {} }, privateNotes: {}, inbox: [] },
    { scope: 'shared', now },
  );
}

async function applyToMaster(env: GymCloudEnv, actor: GymCloudActor, incoming: RosterBackup, now: Date): Promise<{ report: RosterMergeReport } | Response> {
  const master = (await readMaster(env, actor)) ?? emptyShared(now);
  const { next, report } = mergeRosterBackup(
    { roster: master.roster, cardFile: { cards: master.cards, settings: master.cardSettings }, privateNotes: {}, inbox: master.inbox, coachStores: master.coachStores },
    sharedRosterBackup(incoming),
    { now: now.getTime() },
  );
  const merged = buildRosterBackup({ ...next, privateNotes: {} }, { scope: 'shared', now });
  const failed = await writeJson(env, `${prefix(actor)}master.json`, merged, ROSTER_MASTER_MAX_BYTES);
  if (failed) return failed;
  return { report };
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function incomingBackup(body: Record<string, unknown>): RosterBackup | null {
  const raw = body.backup;
  if (!raw || typeof raw !== 'object' || (raw as { kind?: unknown }).kind !== ROSTER_BACKUP_KIND) return null;
  const parsed = parseRosterBackup(JSON.stringify(raw));
  // Private notes never travel through roster sync, even if a client sends them.
  return parsed.ok ? sharedRosterBackup(parsed.backup) : null;
}

async function listPending(env: GymCloudEnv, actor: GymCloudActor, role: RosterRole): Promise<RosterPendingRecord[]> {
  const bucket = env.GYM_MEDIA!;
  const keys: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listed = await bucket.list({ prefix: `${prefix(actor)}pending/`, cursor, limit: 1000 });
    for (const object of listed.objects) keys.push(object.key);
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  const rows: RosterPendingRecord[] = [];
  for (const key of keys.sort().reverse().slice(0, ROSTER_PENDING_LIST_MAX)) {
    const row = await readJson<RosterPendingRecord>(env, key);
    if (!row || typeof row.id !== 'string') continue;
    if (!role.canApprove && !(row.submittedBy?.kind === actor.kind && row.submittedBy?.seatId === actor.seatId)) continue;
    rows.push(row);
  }
  return rows;
}

function pendingId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '');
  return `${stamp}-${crypto.randomUUID().slice(0, 8)}`;
}

function cleanNotes(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [id, text] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(id) || typeof text !== 'string' || !text.trim()) continue;
    out[id] = text.slice(0, PRIVATE_NOTE_MAX);
  }
  return out;
}

export async function handleGymRoster(request: Request, env: GymCloudEnv, now: () => Date = () => new Date()): Promise<Response> {
  const bucket = env.GYM_MEDIA;
  if (!bucket) return json(503, { ok: false, reason: 'unbound', error: 'Advantage Cloud is not connected.' });
  const stamp = now();
  const actor = await readGymCloudActor(request, env, stamp);
  if (actor instanceof Response) return actor;
  const role = rosterRole(actor);
  if (!actor.plusCloud) return json(403, { ok: false, cloud: false, error: 'Advantage Cloud is not on this license.' });
  if (!role.canRead) return json(403, { ok: false, error: 'This seat does not use the gym roster.' });
  const url = new URL(request.url);
  const op = url.searchParams.get('op') ?? 'state';

  if (request.method === 'GET') {
    if (op === 'state') {
      const [master, trustMode, pending] = await Promise.all([
        readMaster(env, actor),
        readTrustMode(env, actor),
        listPending(env, actor, role),
      ]);
      return json(200, { ok: true, role, trustMode, master, pending });
    }
    if (op === 'private') {
      if (role.isOwner) {
        const listed = await bucket.list({ prefix: `${prefix(actor)}private/`, limit: 1000 });
        const notes: Record<string, Record<string, string>> = {};
        for (const object of listed.objects) {
          const author = object.key.slice(`${prefix(actor)}private/`.length).replace(/\.json$/, '');
          notes[author] = cleanNotes(await readJson<unknown>(env, object.key)) ?? {};
        }
        return json(200, { ok: true, author: 'owner', notes });
      }
      const mine = cleanNotes(await readJson<unknown>(env, `${prefix(actor)}private/${authorKey(actor)}.json`)) ?? {};
      return json(200, { ok: true, author: authorKey(actor), notes: { [authorKey(actor)]: mine } });
    }
    return json(404, { ok: false, error: 'Unknown roster request.' });
  }

  if (request.method !== 'POST') return json(405, { ok: false, error: 'Use GET or POST.' });
  const body = await readBody(request);
  if (!body) return json(400, { ok: false, error: 'Send JSON.' });

  if (op === 'submit') {
    if (!role.canSubmit) return json(403, { ok: false, error: 'This seat cannot change the gym roster.' });
    const backup = incomingBackup(body);
    if (!backup) return json(400, { ok: false, error: 'That is not an Advantage roster backup.' });
    const direct = role.isOwner || (await readTrustMode(env, actor));
    if (direct) {
      const applied = await applyToMaster(env, actor, backup, stamp);
      if (applied instanceof Response) return applied;
      return json(200, { ok: true, applied: true, report: applied.report });
    }
    const id = pendingId(stamp);
    const record: RosterPendingRecord = {
      id,
      status: 'pending',
      submittedAt: stamp.toISOString(),
      submittedBy: { kind: actor.kind, seatId: actor.seatId, preset: actor.preset },
      summary: { students: backup.roster.students.length, names: backup.roster.students.slice(0, 12).map((row) => `${row.name} (${row.belt})`) },
      backup,
    };
    const failed = await writeJson(env, `${prefix(actor)}pending/${id}.json`, record, ROSTER_MASTER_MAX_BYTES);
    if (failed) return failed;
    return json(200, { ok: true, applied: false, pending: true, id });
  }

  if (op === 'decide') {
    if (!role.canApprove) return json(403, { ok: false, error: 'Only the head coach approves roster changes.' });
    const id = typeof body.id === 'string' && /^[A-Za-z0-9-]{8,80}$/.test(body.id) ? body.id : '';
    const decision = body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : '';
    if (!id || !decision) return json(400, { ok: false, error: 'Choose a roster change and Approve or Reject.' });
    const key = `${prefix(actor)}pending/${id}.json`;
    const record = await readJson<RosterPendingRecord>(env, key);
    if (!record) return json(404, { ok: false, error: 'That roster change is gone.' });
    if (record.status !== 'pending') return json(409, { ok: false, error: 'That roster change was already decided.', status: record.status });
    if (actor.kind === 'seat' && record.submittedBy.kind === 'seat' && record.submittedBy.seatId === actor.seatId) {
      return json(403, { ok: false, error: 'Another head coach approves your own roster change.' });
    }
    const next: RosterPendingRecord = { ...record, decidedAt: stamp.toISOString(), decidedBy: { kind: actor.kind, seatId: actor.seatId } };
    if (decision === 'approve') {
      const applied = await applyToMaster(env, actor, record.backup, stamp);
      if (applied instanceof Response) return applied;
      next.status = 'approved';
      next.report = applied.report;
    } else {
      next.status = 'rejected';
    }
    const failed = await writeJson(env, key, next, ROSTER_MASTER_MAX_BYTES);
    if (failed) return failed;
    return json(200, { ok: true, status: next.status, report: next.report ?? null });
  }

  if (op === 'trust') {
    if (!role.isOwner) return json(403, { ok: false, error: 'Only the gym owner changes trust mode.' });
    const on = body.on === true;
    const failed = await writeJson(env, `${prefix(actor)}settings.json`, { trustMode: on, updatedAt: stamp.toISOString() }, 4_000);
    if (failed) return failed;
    return json(200, { ok: true, trustMode: on });
  }

  if (op === 'private') {
    const notes = cleanNotes(body.notes);
    if (!notes) return json(400, { ok: false, error: 'Send private notes.' });
    const key = `${prefix(actor)}private/${authorKey(actor)}.json`;
    const current = cleanNotes(await readJson<unknown>(env, key)) ?? {};
    // Fill blanks only, same as every other roster import. Nothing is removed.
    const merged = { ...current };
    let added = 0;
    for (const [id, text] of Object.entries(notes)) {
      if (merged[id]) continue;
      merged[id] = text;
      added += 1;
    }
    if (added) {
      const failed = await writeJson(env, key, merged, ROSTER_PRIVATE_MAX_BYTES);
      if (failed) return failed;
    }
    return json(200, { ok: true, added });
  }

  return json(404, { ok: false, error: 'Unknown roster request.' });
}

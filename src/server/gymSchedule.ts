/**
 * Published class schedule, personal class marks, and absentee recap requests.
 * Uses ENTITLEMENTS_DB. If migration 0010 has not been applied, GET/POST
 * return { available: false } and the client falls back to the local board.
 */
import { readSignedJson, verifyToken, type EntitlementClaims } from '../lib/entitlementToken.ts';
import { normalizeGymCalendar, scheduleForPublish, type GymCalendarState } from '../lib/gymCalendar.ts';
import {
  cleanDisplayName,
  isAbsenteeReason,
  isIsoDate,
  isRsvpStatus,
  isSlotId,
  isAbsenteeStatus,
  readAbsenteeRequest,
  readClassRsvp,
  type AbsenteeReason,
  type AbsenteeRequest,
  type AbsenteeStatus,
  type ClassRsvp,
  type RsvpStatus,
} from '../lib/classAttendanceCore.ts';
import { isStableStudentId } from '../lib/studentIdentity.ts';
import { STUDENT_LICENSE_PRESET } from '../lib/studentLicensePool.ts';
import { studentPassAllows, type StudentInboxPass } from './studentInbox.ts';
import { signingMaterial } from './tokenIssue.ts';
import type { D1Database } from './d1.ts';
import type { GymCloudEnv } from './gymCloud.ts';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const LICENSE_RE = /^[A-Za-z0-9_-]{8,80}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SCHEDULE_JSON_MAX = 80_000;
const UPLOAD_PRESETS = new Set(['coach', 'instructors']);

export type GymScheduleEnv = GymCloudEnv & {
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
};

type StaffActor = { kind: 'staff'; licenseId: string; actorId: string; seat: boolean };
type StudentActor = { kind: 'student'; licenseId: string; studentLicenseId: string | null; passStudentId: string | null };
type Actor = StaffActor | StudentActor;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bearerOf(request: Request): string {
  const auth = request.headers.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
}

function isSeat(claims: EntitlementClaims): boolean {
  return claims.src === 'seat' || claims.tier === 'seat';
}

function asPass(value: unknown): StudentInboxPass | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<StudentInboxPass>;
  if (row.typ !== 'student-inbox' || row.v !== 1) return null;
  if (typeof row.gym !== 'string' || typeof row.studentId !== 'string' || typeof row.exp !== 'number') return null;
  return { typ: 'student-inbox', v: 1, gym: row.gym, studentId: row.studentId, exp: row.exp };
}

function isMissingTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /no such table/i.test(message);
}

export function staffCanPublish(claims: EntitlementClaims, license: string): boolean {
  if (!LICENSE_RE.test(license) || claims.subs?.state === 'locked') return false;
  if (isSeat(claims)) return claims.gym === license && UPLOAD_PRESETS.has(claims.preset ?? '');
  if (claims.sub !== license) return false;
  return claims.tier === 'owner' || claims.grants.includes('pro') || claims.grants.includes('coach');
}

async function readActor(request: Request, env: GymScheduleEnv, now: Date): Promise<Actor | Response> {
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return json(503, { ok: false, error: 'Entitlement signing is not set up yet.' });
  const keys = [{ kid: material.kid, jwk: material.publicJwk }];
  const token = bearerOf(request);
  if (!token) return json(401, { ok: false, error: 'Sign in to use the class schedule.' });
  const claims = await verifyToken(token, keys);
  if (claims) {
    const seconds = Math.floor(now.getTime() / 1000);
    if (claims.exp <= seconds || claims.nbf > seconds + 300) return json(401, { ok: false, error: 'Sign in to use the class schedule.' });
    if (claims.preset === STUDENT_LICENSE_PRESET || claims.tier === 'student') {
      const license = claims.gym ?? '';
      if (!LICENSE_RE.test(license)) return json(403, { ok: false, error: 'Connect to your academy first.' });
      return { kind: 'student', licenseId: license, studentLicenseId: claims.sub, passStudentId: null };
    }
    const license = isSeat(claims) ? claims.gym || '' : claims.sub;
    if (!staffCanPublish(claims, license)) {
      return json(403, { ok: false, error: 'This seat cannot publish the class schedule.' });
    }
    return {
      kind: 'staff',
      licenseId: license,
      actorId: isSeat(claims) ? claims.sid || 'seat' : 'owner',
      seat: isSeat(claims),
    };
  }
  const pass = asPass(await readSignedJson(token, keys));
  if (pass && LICENSE_RE.test(pass.gym)) {
    if (!studentPassAllows(pass, pass.gym, pass.studentId, Math.floor(now.getTime() / 1000))) {
      return json(401, { ok: false, error: 'Sign in to use the class schedule.' });
    }
    return { kind: 'student', licenseId: pass.gym, studentLicenseId: null, passStudentId: pass.studentId };
  }
  return json(401, { ok: false, error: 'Sign in to use the class schedule.' });
}

async function bindStudentId(
  db: D1Database,
  actor: StudentActor,
  studentId: string,
  nowMs: number,
): Promise<{ ok: true; studentId: string } | { ok: false; error: string }> {
  if (actor.passStudentId) {
    if (actor.passStudentId !== studentId) return { ok: false, error: 'That mark does not match this student.' };
    return { ok: true, studentId };
  }
  if (!actor.studentLicenseId) return { ok: false, error: 'Connect to your academy first.' };
  try {
    const existing = await db
      .prepare(
        `SELECT student_id AS studentId FROM gym_schedule_identities WHERE license_id = ? AND student_license_id = ? LIMIT 1`,
      )
      .bind(actor.licenseId, actor.studentLicenseId)
      .first<{ studentId: string }>();
    if (existing?.studentId) {
      if (existing.studentId !== studentId) return { ok: false, error: 'That mark does not match this student.' };
      return { ok: true, studentId };
    }
    const taken = await db
      .prepare(`SELECT student_license_id AS sub FROM gym_schedule_identities WHERE license_id = ? AND student_id = ? LIMIT 1`)
      .bind(actor.licenseId, studentId)
      .first<{ sub: string }>();
    if (taken?.sub && taken.sub !== actor.studentLicenseId) {
      return { ok: false, error: 'That student id is already in use at this academy.' };
    }
    await db
      .prepare(
        `INSERT INTO gym_schedule_identities (license_id, student_license_id, student_id, created_at) VALUES (?, ?, ?, ?)`,
      )
      .bind(actor.licenseId, actor.studentLicenseId, studentId, nowMs)
      .run();
    return { ok: true, studentId };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: 'missing-table' };
    return { ok: false, error: 'Could not save that class mark.' };
  }
}

function parseSchedule(raw: unknown): GymCalendarState | null {
  if (!raw || typeof raw !== 'object') return null;
  const schedule = scheduleForPublish(normalizeGymCalendar(raw));
  if (!schedule.classes.length && !schedule.specials.length && !schedule.title && !schedule.notes) {
    return schedule;
  }
  return schedule;
}

export async function handleGymSchedule(request: Request, env: GymScheduleEnv, now = () => new Date()): Promise<Response> {
  const db = env.ENTITLEMENTS_DB;
  const url = new URL(request.url);
  if (!db) return json(200, { ok: true, available: false, schedule: null, rsvps: [], requests: [] });

  if (request.method === 'GET' && url.searchParams.get('probe') === '1') {
    return json(200, { ok: true, bound: true });
  }

  const actor = await readActor(request, env, now());
  if (actor instanceof Response) return actor;

  if (request.method === 'GET') {
    const view = url.searchParams.get('view') || 'schedule';
    try {
      if (view === 'rsvps') {
        const date = url.searchParams.get('date') ?? '';
        const slotId = url.searchParams.get('slotId') ?? '';
        if (!isIsoDate(date)) return json(400, { ok: false, available: true, error: 'Pick a class date.' });
        let sql = `SELECT slot_id AS slotId, class_date AS date, student_id AS studentId, display_name AS displayName, status, updated_at AS updatedAt
                   FROM gym_class_rsvps WHERE license_id = ? AND class_date = ?`;
        const args: unknown[] = [actor.licenseId, date];
        if (slotId) {
          if (!isSlotId(slotId)) return json(400, { ok: false, available: true, error: 'That class is not on the schedule.' });
          sql += ' AND slot_id = ?';
          args.push(slotId);
        }
        if (actor.kind === 'student') {
          const self = actor.passStudentId;
          if (self) {
            sql += ' AND student_id = ?';
            args.push(self);
          } else if (actor.studentLicenseId) {
            const bound = await db
              .prepare(
                `SELECT student_id AS studentId FROM gym_schedule_identities WHERE license_id = ? AND student_license_id = ? LIMIT 1`,
              )
              .bind(actor.licenseId, actor.studentLicenseId)
              .first<{ studentId: string }>();
            if (!bound?.studentId) {
              return json(200, { ok: true, available: true, rsvps: [], requests: [] });
            }
            sql += ' AND student_id = ?';
            args.push(bound.studentId);
          }
        }
        const page = await db.prepare(`${sql} ORDER BY display_name ASC`).bind(...args).all<Record<string, unknown>>();
        const rsvps = (page.results ?? []).map(readClassRsvp).filter((row): row is ClassRsvp => Boolean(row));

        let requestSql = `SELECT id, slot_id AS slotId, class_date AS date, student_id AS studentId, display_name AS displayName, reason, status, created_at AS createdAt, updated_at AS updatedAt
                          FROM gym_class_absentee_requests WHERE license_id = ? AND class_date = ?`;
        const requestArgs: unknown[] = [actor.licenseId, date];
        if (slotId) {
          requestSql += ' AND slot_id = ?';
          requestArgs.push(slotId);
        }
        if (actor.kind === 'student') {
          const self = rsvps[0]?.studentId ?? actor.passStudentId;
          if (self) {
            requestSql += ' AND student_id = ?';
            requestArgs.push(self);
          } else {
            return json(200, { ok: true, available: true, rsvps, requests: [] });
          }
        }
        const reqPage = await db
          .prepare(`${requestSql} ORDER BY created_at ASC`)
          .bind(...requestArgs)
          .all<Record<string, unknown>>();
        const requests = (reqPage.results ?? []).map(readAbsenteeRequest).filter((row): row is AbsenteeRequest => Boolean(row));
        return json(200, { ok: true, available: true, rsvps, requests });
      }

      const row = await db
        .prepare(`SELECT schedule_json AS json, updated_at AS updatedAt FROM gym_schedule WHERE license_id = ? LIMIT 1`)
        .bind(actor.licenseId)
        .first<{ json: string; updatedAt: number }>();
      if (!row?.json) return json(200, { ok: true, available: true, schedule: null, updatedAt: 0 });
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.json);
      } catch {
        return json(200, { ok: true, available: true, schedule: null, updatedAt: 0 });
      }
      return json(200, { ok: true, available: true, schedule: parseSchedule(parsed), updatedAt: row.updatedAt });
    } catch (error) {
      if (isMissingTable(error)) return json(200, { ok: true, available: false, schedule: null, rsvps: [], requests: [] });
      return json(500, { ok: false, available: true, error: 'Could not read the class schedule.' });
    }
  }

  if (request.method !== 'POST') return json(405, { ok: false, error: 'Use GET or POST.' });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: 'Send the class schedule as JSON.' });
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const nowMs = now().getTime();

  try {
    if (action === 'publish') {
      if (actor.kind !== 'staff') return json(403, { ok: false, available: true, error: 'Only the gym can publish the class schedule.' });
      const schedule = parseSchedule(body.schedule);
      if (!schedule) return json(400, { ok: false, available: true, error: 'That is not a class schedule.' });
      const payload = JSON.stringify(schedule);
      if (payload.length > SCHEDULE_JSON_MAX) return json(400, { ok: false, available: true, error: 'That schedule is too large to publish.' });
      await db
        .prepare(
          `INSERT INTO gym_schedule (license_id, schedule_json, updated_at, published_by) VALUES (?, ?, ?, ?)
           ON CONFLICT(license_id) DO UPDATE SET schedule_json = excluded.schedule_json, updated_at = excluded.updated_at, published_by = excluded.published_by`,
        )
        .bind(actor.licenseId, payload, nowMs, actor.actorId)
        .run();
      return json(200, { ok: true, available: true, updatedAt: nowMs });
    }

    if (action === 'rsvp') {
      if (actor.kind !== 'student') return json(403, { ok: false, available: true, error: 'Only a student can mark a class for themselves.' });
      const slotId = typeof body.slotId === 'string' ? body.slotId : '';
      const date = typeof body.date === 'string' ? body.date : '';
      const studentId = typeof body.studentId === 'string' ? body.studentId : '';
      const status = body.status;
      if (!isSlotId(slotId) || !isIsoDate(date) || !isStableStudentId(studentId) || !isRsvpStatus(status)) {
        return json(400, { ok: false, available: true, error: 'That class mark could not be saved.' });
      }
      const bound = await bindStudentId(db, actor, studentId, nowMs);
      if (!bound.ok) {
        if (bound.error === 'missing-table') return json(200, { ok: false, available: false });
        return json(403, { ok: false, available: true, error: bound.error });
      }
      const displayName = cleanDisplayName(typeof body.displayName === 'string' ? body.displayName : '');
      await db
        .prepare(
          `INSERT INTO gym_class_rsvps (license_id, slot_id, class_date, student_id, display_name, status, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(license_id, slot_id, class_date, student_id)
           DO UPDATE SET display_name = excluded.display_name, status = excluded.status, updated_at = excluded.updated_at`,
        )
        .bind(actor.licenseId, slotId, date, bound.studentId, displayName, status, nowMs)
        .run();
      const rsvp: ClassRsvp = { slotId, date, studentId: bound.studentId, displayName, status: status as RsvpStatus, updatedAt: nowMs };
      return json(200, { ok: true, available: true, rsvp });
    }

    if (action === 'confirm') {
      if (actor.kind !== 'staff') return json(403, { ok: false, available: true, error: 'Only the gym can confirm who was in class.' });
      const slotId = typeof body.slotId === 'string' ? body.slotId : '';
      const date = typeof body.date === 'string' ? body.date : '';
      if (!isSlotId(slotId) || !isIsoDate(date)) return json(400, { ok: false, available: true, error: 'Pick a class first.' });
      const names = body.names && typeof body.names === 'object' && !Array.isArray(body.names) ? (body.names as Record<string, unknown>) : {};
      const attended = Array.isArray(body.attendedIds) ? body.attendedIds : [];
      const missed = Array.isArray(body.missedIds) ? body.missedIds : [];
      for (const studentId of attended) {
        if (typeof studentId !== 'string' || !isStableStudentId(studentId)) continue;
        const displayName = cleanDisplayName(typeof names[studentId] === 'string' ? names[studentId] : '');
        await db
          .prepare(
            `INSERT INTO gym_class_rsvps (license_id, slot_id, class_date, student_id, display_name, status, updated_at)
             VALUES (?, ?, ?, ?, ?, 'attended', ?)
             ON CONFLICT(license_id, slot_id, class_date, student_id)
             DO UPDATE SET display_name = excluded.display_name, status = 'attended', updated_at = excluded.updated_at`,
          )
          .bind(actor.licenseId, slotId, date, studentId, displayName, nowMs)
          .run();
      }
      for (const studentId of missed) {
        if (typeof studentId !== 'string' || !isStableStudentId(studentId)) continue;
        const displayName = cleanDisplayName(typeof names[studentId] === 'string' ? names[studentId] : '');
        await db
          .prepare(
            `INSERT INTO gym_class_rsvps (license_id, slot_id, class_date, student_id, display_name, status, updated_at)
             VALUES (?, ?, ?, ?, ?, 'missed', ?)
             ON CONFLICT(license_id, slot_id, class_date, student_id)
             DO UPDATE SET display_name = excluded.display_name, status = 'missed', updated_at = excluded.updated_at`,
          )
          .bind(actor.licenseId, slotId, date, studentId, displayName, nowMs)
          .run();
      }
      return json(200, { ok: true, available: true });
    }

    if (action === 'absentee-request') {
      if (actor.kind !== 'student') return json(403, { ok: false, available: true, error: 'Only a student can request an absentee copy.' });
      const slotId = typeof body.slotId === 'string' ? body.slotId : '';
      const date = typeof body.date === 'string' ? body.date : '';
      const studentId = typeof body.studentId === 'string' ? body.studentId : '';
      const reason: AbsenteeReason = isAbsenteeReason(body.reason) ? body.reason : '';
      if (!isSlotId(slotId) || !isIsoDate(date) || !isStableStudentId(studentId)) {
        return json(400, { ok: false, available: true, error: 'That request could not be saved.' });
      }
      const bound = await bindStudentId(db, actor, studentId, nowMs);
      if (!bound.ok) {
        if (bound.error === 'missing-table') return json(200, { ok: false, available: false });
        return json(403, { ok: false, available: true, error: bound.error });
      }
      const displayName = cleanDisplayName(typeof body.displayName === 'string' ? body.displayName : '');
      const existing = await db
        .prepare(
          `SELECT id, slot_id AS slotId, class_date AS date, student_id AS studentId, display_name AS displayName, reason, status, created_at AS createdAt, updated_at AS updatedAt
           FROM gym_class_absentee_requests
           WHERE license_id = ? AND slot_id = ? AND class_date = ? AND student_id = ? AND status = 'requested' LIMIT 1`,
        )
        .bind(actor.licenseId, slotId, date, bound.studentId)
        .first<Record<string, unknown>>();
      if (existing) {
        const request = readAbsenteeRequest(existing);
        return json(200, { ok: true, available: true, request });
      }
      const id = typeof body.id === 'string' && ID_RE.test(body.id) ? body.id : `ar-${nowMs.toString(36)}`;
      await db
        .prepare(
          `INSERT INTO gym_class_absentee_requests (id, license_id, slot_id, class_date, student_id, display_name, reason, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)`,
        )
        .bind(id, actor.licenseId, slotId, date, bound.studentId, displayName, reason, nowMs, nowMs)
        .run();
      const request: AbsenteeRequest = {
        id,
        slotId,
        date,
        studentId: bound.studentId,
        displayName,
        reason,
        status: 'requested',
        createdAt: nowMs,
        updatedAt: nowMs,
      };
      return json(200, { ok: true, available: true, request });
    }

    if (action === 'absentee-resolve') {
      if (actor.kind !== 'staff') return json(403, { ok: false, available: true, error: 'Only the gym can close an absentee request.' });
      const id = typeof body.id === 'string' ? body.id : '';
      const status = body.status;
      if (!ID_RE.test(id) || !isAbsenteeStatus(status) || status === 'requested') {
        return json(400, { ok: false, available: true, error: 'That request could not be updated.' });
      }
      const result = await db
        .prepare(
          `UPDATE gym_class_absentee_requests SET status = ?, updated_at = ? WHERE id = ? AND license_id = ?`,
        )
        .bind(status as AbsenteeStatus, nowMs, id, actor.licenseId)
        .run();
      if (!result.meta.changes) return json(404, { ok: false, available: true, error: 'That request was not found.' });
      return json(200, { ok: true, available: true });
    }

    return json(400, { ok: false, available: true, error: 'Unknown class schedule action.' });
  } catch (error) {
    if (isMissingTable(error)) return json(200, { ok: false, available: false });
    return json(500, { ok: false, available: true, error: 'Could not save the class schedule.' });
  }
}

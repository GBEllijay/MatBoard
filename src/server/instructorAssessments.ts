/**
 * "Send to my instructor": a student's self-assessment lands in one instructor's
 * Advantage Cloud inbox, with an owner-visible index row. In-app only, no push.
 *
 * POST /api/gym/assessments  { action, … }
 *   submit          student inbox pass (Bearer). Strict payload, size caps, rate limits.
 *   student-status  student inbox pass. This student's own rows (status only).
 *   list            owner (every instructor) or a Coach / Instructors seat (its own folder only).
 *   mark            same people: pending → seen → responded (+ responseId from Coach Sync).
 *
 * Routing, most trusted first (instructorAssessments.ts in lib has the keys):
 *   1. roster        roster/master.json has this student (linkedStudentId) with assignedInstructorId.
 *   2. connect-code  the student's saved coach connect code, signed for this license, names `via`.
 *   3. owner-default the owner.
 * The phone's own assignedInstructorId is kept as `requested` only; it never routes by itself.
 *
 * Scores are written only to the instructor item. The index row and the master roster never carry them.
 * Nothing here deletes from R2. Status changes rewrite the item and its index row.
 */

import { readSignedJson, type PublicJwk } from '../lib/entitlementToken.ts';
import {
  ASSESSMENT_INSTRUCTOR_FOLDER_MAX,
  ASSESSMENT_MIN_GAP_MS,
  ASSESSMENT_STUDENT_OPEN_MAX,
  assessmentIndexKey,
  assessmentIndexPrefix,
  assessmentIndexRow,
  assessmentItemId,
  instructorAssessmentKey,
  instructorAssessmentPrefix,
  isAssessmentStatus,
  nextAssessmentStatus,
  readAssessmentSubmission,
  readInstructorAssessmentItem,
  type AssessmentIndexRow,
  type AssessmentRoute,
  type InstructorAssessmentItem,
} from '../lib/instructorAssessments.ts';
import { OWNER_INSTRUCTOR_ID, instructorIdFor, isInstructorId } from '../lib/instructorIdentity.ts';
import { readCoachConnectVia } from './coachConnect.ts';
import { readGymCloudActor, type GymCloudActor, type GymCloudEnv } from './gymCloud.ts';
import { freeStudentGrantClosed } from './studentLicenses.ts';
import { STUDENT_LICENSE_REVOKED_MESSAGE } from '../lib/studentLicensePool.ts';
import { signingMaterial } from './tokenIssue.ts';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const LICENSE_RE = /^[A-Za-z0-9_-]{8,80}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}__[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const BODY_MAX_CHARS = 12_000;
const LIST_MAX = 200;
/** Seat presets that answer through Coach Sync. */
const ANSWER_PRESETS = new Set(['coach', 'instructors']);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bearerOf(request: Request): string {
  const auth = request.headers.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
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

async function writeJson(env: GymCloudEnv, key: string, value: unknown): Promise<void> {
  await env.GYM_MEDIA!.put(key, new TextEncoder().encode(JSON.stringify(value)), {
    httpMetadata: { contentType: 'application/json' },
  });
}

async function listKeys(env: GymCloudEnv, prefix: string, max: number): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20 && keys.length < max; page += 1) {
    const listed = await env.GYM_MEDIA!.list({ prefix, cursor, limit: 1000 });
    for (const object of listed.objects) keys.push(object.key);
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return keys;
}

type StudentPass = { typ: 'student-inbox'; v: 1; gym: string; studentId: string; exp: number };

function asPass(value: unknown): StudentPass | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<StudentPass>;
  if (row.typ !== 'student-inbox' || row.v !== 1) return null;
  if (typeof row.gym !== 'string' || typeof row.studentId !== 'string' || typeof row.exp !== 'number') return null;
  return { typ: 'student-inbox', v: 1, gym: row.gym, studentId: row.studentId, exp: row.exp };
}

/** The assigned instructor on the master roster for this Student Edition id, if any. */
export async function rosterAssignedInstructor(env: GymCloudEnv, license: string, studentId: string): Promise<string | null> {
  const master = await readJson<{ roster?: { students?: unknown } }>(env, `groups/${license}/roster/master.json`);
  const students = Array.isArray(master?.roster?.students) ? (master!.roster!.students as unknown[]) : [];
  for (const row of students) {
    if (!row || typeof row !== 'object') continue;
    const card = row as { linkedStudentId?: unknown; assignedInstructorId?: unknown; guestId?: unknown };
    if (card.linkedStudentId !== studentId || card.guestId) continue;
    if (isInstructorId(card.assignedInstructorId)) return card.assignedInstructorId;
  }
  return null;
}

/** Route one submission: roster first, then the signed connect code, then the owner. */
export async function routeAssessment(
  env: GymCloudEnv,
  keys: readonly { kid: string; jwk: PublicJwk }[],
  license: string,
  studentId: string,
  via: string | undefined,
): Promise<{ instructorId: string; route: AssessmentRoute }> {
  const fromRoster = await rosterAssignedInstructor(env, license, studentId);
  if (fromRoster) return { instructorId: fromRoster, route: 'roster' };
  if (via) {
    const fromCode = await readCoachConnectVia(via, keys, license);
    if (fromCode) return { instructorId: fromCode, route: 'connect-code' };
  }
  return { instructorId: OWNER_INSTRUCTOR_ID, route: 'owner-default' };
}

async function indexRowsFor(env: GymCloudEnv, prefix: string, max: number): Promise<AssessmentIndexRow[]> {
  const rows: AssessmentIndexRow[] = [];
  for (const key of (await listKeys(env, prefix, max)).sort().reverse().slice(0, max)) {
    const row = await readJson<AssessmentIndexRow>(env, key);
    if (row && typeof row.id === 'string' && isAssessmentStatus(row.status) && isInstructorId(row.instructorId)) rows.push(row);
  }
  return rows;
}

/** Owner, or a Coach / Instructors seat. Assistant, program director and custom seats are refused. */
function reader(actor: GymCloudActor): { ok: true; instructorId: string; owner: boolean } | { ok: false; error: string } {
  if (!actor.plusCloud) return { ok: false, error: 'Advantage Cloud is not on this license.' };
  if (actor.kind === 'seat' && !ANSWER_PRESETS.has(actor.preset ?? '')) {
    return { ok: false, error: 'Only an Instructor or Coach seat, or the gym owner, reads student assessments.' };
  }
  const instructorId = instructorIdFor(actor);
  if (!instructorId) return { ok: false, error: 'This seat is not active.' };
  return { ok: true, instructorId, owner: actor.kind === 'owner' };
}

export async function handleInstructorAssessments(
  request: Request,
  env: GymCloudEnv,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (!env.GYM_MEDIA) return json(503, { ok: false, reason: 'unbound', error: 'Advantage Cloud is not connected on this site.' });
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Use POST.' });
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return json(503, { ok: false, error: 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.' });
  const keys = [{ kid: material.kid, jwk: material.publicJwk }];
  const raw = await request.text();
  if (raw.length > BODY_MAX_CHARS) return json(413, { ok: false, error: 'That assessment is too large.' });
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: 'The request was not JSON.' });
  }
  const stamp = now();
  const action = body.action;

  if (action === 'submit' || action === 'student-status') {
    const license = typeof body.license === 'string' ? body.license : '';
    const studentId = typeof body.studentId === 'string' ? body.studentId : '';
    if (!LICENSE_RE.test(license) || !ID_RE.test(studentId)) return json(400, { ok: false, error: 'Missing license or student id.' });
    const token = bearerOf(request);
    const pass = asPass(token ? await readSignedJson(token, keys) : null);
    if (!pass || pass.gym !== license || pass.studentId !== studentId || pass.exp <= Math.floor(stamp.getTime() / 1000)) {
      return json(403, { ok: false, error: 'Only this student can send their assessment to their instructor.' });
    }
    if (await freeStudentGrantClosed(env.ENTITLEMENTS_DB ?? null, studentId, stamp)) {
      return json(403, { ok: false, error: STUDENT_LICENSE_REVOKED_MESSAGE });
    }
    const mine = await indexRowsFor(env, `${assessmentIndexPrefix(license)}${studentId}__`, 400);

    if (action === 'student-status') {
      return json(200, {
        ok: true,
        items: mine.map((row) => ({ id: row.id, status: row.status, date: row.date, receivedAt: row.receivedAt, instructorId: row.instructorId })),
      });
    }

    const submission = readAssessmentSubmission(body.submission);
    if (!submission || submission.studentId !== studentId) {
      return json(400, { ok: false, error: 'That is not a self-assessment for this student.' });
    }
    const id = assessmentItemId(studentId, submission.submissionId);
    const already = mine.find((row) => row.id === id);
    if (already) {
      // The same send again (a retry) answers with what is stored and writes nothing.
      return json(200, { ok: true, id, instructorId: already.instructorId, status: already.status, duplicate: true });
    }
    const open = mine.filter((row) => row.status !== 'responded');
    if (open.length >= ASSESSMENT_STUDENT_OPEN_MAX) {
      return json(429, { ok: false, error: 'Your instructor has several of your assessments waiting. Send more after they answer.' });
    }
    const latest = mine.reduce((max, row) => Math.max(max, row.receivedAt), 0);
    if (latest && stamp.getTime() - latest < ASSESSMENT_MIN_GAP_MS) {
      return json(429, { ok: false, error: 'You just sent one. Wait a minute and try again.' });
    }
    const { instructorId, route } = await routeAssessment(env, keys, license, studentId, submission.via);
    const folder = await listKeys(env, instructorAssessmentPrefix(license, instructorId), ASSESSMENT_INSTRUCTOR_FOLDER_MAX + 1);
    if (folder.length >= ASSESSMENT_INSTRUCTOR_FOLDER_MAX) {
      return json(429, { ok: false, error: 'This instructor\'s assessment inbox is full.' });
    }
    const { via: _proof, ...kept } = submission;
    void _proof;
    const item: InstructorAssessmentItem = {
      kind: 'instructor-assessment-item',
      v: 1,
      id,
      license,
      instructorId,
      route,
      status: 'pending',
      submission: kept,
      receivedAt: stamp.getTime(),
    };
    await writeJson(env, instructorAssessmentKey(license, instructorId, id), item);
    await writeJson(env, assessmentIndexKey(license, id), assessmentIndexRow(item));
    return json(200, { ok: true, id, instructorId, route, status: 'pending' });
  }

  if (action === 'list' || action === 'mark') {
    const actor = await readGymCloudActor(request, env, stamp);
    if (actor instanceof Response) return actor;
    const who = reader(actor);
    if (!who.ok) return json(403, { ok: false, error: who.error });
    const license = actor.licenseId;

    if (action === 'list') {
      const want = body.status === 'all' ? 'all' : 'open';
      let itemKeys: string[];
      if (who.owner) {
        const rows = await indexRowsFor(env, assessmentIndexPrefix(license), 2000);
        itemKeys = rows
          .filter((row) => want === 'all' || row.status !== 'responded')
          .map((row) => instructorAssessmentKey(license, row.instructorId, row.id));
      } else {
        itemKeys = await listKeys(env, instructorAssessmentPrefix(license, who.instructorId), 2000);
      }
      const items: InstructorAssessmentItem[] = [];
      for (const key of itemKeys) {
        const item = readInstructorAssessmentItem(await readJson<unknown>(env, key));
        if (!item || item.license !== license) continue;
        if (!who.owner && item.instructorId !== who.instructorId) continue;
        if (want === 'open' && item.status === 'responded') continue;
        items.push(item);
      }
      items.sort((a, b) => b.receivedAt - a.receivedAt);
      return json(200, { ok: true, instructorId: who.instructorId, owner: who.owner, items: items.slice(0, LIST_MAX) });
    }

    const id = typeof body.id === 'string' && ITEM_ID_RE.test(body.id) ? body.id : '';
    const wanted = body.status === 'seen' || body.status === 'responded' ? body.status : null;
    if (!id || !wanted) return json(400, { ok: false, error: 'Choose an assessment and Seen or Responded.' });
    const responseId = typeof body.responseId === 'string' && ID_RE.test(body.responseId) ? body.responseId : '';
    if (wanted === 'responded' && !responseId) return json(400, { ok: false, error: 'A reply needs the Coach Sync update id.' });
    const indexRow = await readJson<AssessmentIndexRow>(env, assessmentIndexKey(license, id));
    if (!indexRow || !isInstructorId(indexRow.instructorId)) return json(404, { ok: false, error: 'That assessment is not here.' });
    if (!who.owner && indexRow.instructorId !== who.instructorId) {
      return json(403, { ok: false, error: 'That assessment was sent to another instructor.' });
    }
    const key = instructorAssessmentKey(license, indexRow.instructorId, id);
    const item = readInstructorAssessmentItem(await readJson<unknown>(env, key));
    if (!item) return json(404, { ok: false, error: 'That assessment is not here.' });
    const step = nextAssessmentStatus(item.status, wanted);
    if (!step.ok) return json(409, { ok: false, error: step.error, status: item.status });
    if (!step.changed) return json(200, { ok: true, id, status: item.status, changed: false });
    const next: InstructorAssessmentItem = { ...item, status: step.status };
    if (step.status === 'seen') next.seenAt = stamp.getTime();
    if (step.status === 'responded') {
      next.respondedAt = stamp.getTime();
      next.responseId = responseId;
      next.respondedBy = who.instructorId;
      if (!next.seenAt) next.seenAt = stamp.getTime();
    }
    await writeJson(env, key, next);
    await writeJson(env, assessmentIndexKey(license, id), assessmentIndexRow(next));
    return json(200, { ok: true, id, status: next.status, changed: true, responseId: next.responseId ?? null });
  }

  return json(400, { ok: false, error: 'Unknown action.' });
}

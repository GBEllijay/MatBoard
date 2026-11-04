/**
 * Advantage Cloud academy event sync.
 * Push is idempotent on event id. Pull returns events since a cursor.
 * Owner receives every event for the license. A Coach or Instructors seat
 * receives only their own events, plus anonymous totals.
 * Assistant, program director, and custom seats are refused, same as the gym roster.
 */

import {
  anonymousInstructors,
  cloudTotals,
  sanitizeGymEvent,
  type GymCloudTotals,
  type GymEvent,
} from '../lib/gymEvents.ts';
import { readGymCloudActor, type GymCloudActor, type GymCloudEnv } from './gymCloud.ts';
import { rosterRole } from './gymRoster.ts';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const PUSH_MAX = 200;
const PULL_MAX = 500;
const TOTALS_MAX = 5000;
const PAYLOAD_MAX = 4000;

export type GymEventsDb = NonNullable<GymCloudEnv['ENTITLEMENTS_DB']>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

type StoredEvent = { payload: string; recordedAt: number; seatId: string };

function forceActor(event: GymEvent, actor: GymCloudActor): GymEvent {
  if (actor.kind === 'owner') {
    return { ...event, licenseId: actor.licenseId };
  }
  const next: GymEvent = {
    ...event,
    licenseId: actor.licenseId,
    actor: { seatId: actor.seatId, name: event.actor.name || 'Instructor' },
  };
  if (next.type === 'class_taught') next.instructorSeat = actor.seatId;
  return next;
}

async function readLicenseEvents(db: GymEventsDb, licenseId: string): Promise<GymEvent[]> {
  const page = await db
    .prepare(`SELECT payload_json AS payload FROM gym_events WHERE license_id = ? ORDER BY recorded_at ASC LIMIT ?`)
    .bind(licenseId, TOTALS_MAX)
    .all<{ payload: string }>();
  const events: GymEvent[] = [];
  for (const row of page.results) {
    try {
      const event = sanitizeGymEvent(JSON.parse(row.payload) as unknown);
      if (event) events.push(event);
    } catch {
      /* skip a row that is not JSON */
    }
  }
  return events;
}

function totalsFor(events: readonly GymEvent[], actor: GymCloudActor): GymCloudTotals {
  const totals = cloudTotals(events);
  if (actor.kind === 'owner') return totals;
  return { ...totals, instructors: anonymousInstructors(totals.instructors, actor.seatId) };
}

export async function handleGymEvents(request: Request, env: GymCloudEnv, now = () => new Date()): Promise<Response> {
  const db = env.ENTITLEMENTS_DB;
  if (!db) return json(503, { ok: false, error: 'Advantage Cloud is not ready for academy tracking yet.' });
  const actor = await readGymCloudActor(request, env, now());
  if (actor instanceof Response) return actor;
  const role = rosterRole(actor);
  if (!role.canRead) return json(403, { ok: false, error: 'This seat does not use academy tracking.' });

  if (request.method === 'GET') {
    const since = Number(new URL(request.url).searchParams.get('since') ?? '0');
    const cursor = Number.isFinite(since) ? since : 0;
    const page = await db
      .prepare(
        `SELECT payload_json AS payload, recorded_at AS recordedAt, seat_id AS seatId
         FROM gym_events WHERE license_id = ? AND recorded_at > ? ORDER BY recorded_at ASC LIMIT ?`,
      )
      .bind(actor.licenseId, cursor, PULL_MAX)
      .all<StoredEvent>();
    const all = await readLicenseEvents(db, actor.licenseId);
    const events: GymEvent[] = [];
    let next = cursor;
    for (const row of page.results) {
      if (row.recordedAt > next) next = row.recordedAt;
      if (actor.kind === 'seat' && row.seatId !== actor.seatId) continue;
      try {
        const event = sanitizeGymEvent(JSON.parse(row.payload) as unknown);
        if (event) events.push(event);
      } catch {
        /* skip */
      }
    }
    return json(200, { ok: true, events, totals: totalsFor(all, actor), cursor: next });
  }

  if (request.method !== 'POST') return json(405, { ok: false, error: 'Use GET or POST.' });
  let body: { events?: unknown };
  try {
    body = (await request.json()) as { events?: unknown };
  } catch {
    return json(400, { ok: false, error: 'Send academy events as JSON.' });
  }
  const incoming = Array.isArray(body.events) ? body.events.slice(0, PUSH_MAX) : null;
  if (!incoming) return json(400, { ok: false, error: 'Send academy events as a list.' });

  const accepted: string[] = [];
  for (const raw of incoming) {
    const clean = sanitizeGymEvent(raw);
    if (!clean) continue;
    const event = forceActor(clean, actor);
    const payload = JSON.stringify(event);
    if (payload.length > PAYLOAD_MAX) continue;
    await db
      .prepare(
        `INSERT OR IGNORE INTO gym_events (id, license_id, seat_id, type, at, payload_json, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(event.id, actor.licenseId, event.actor.seatId, event.type, event.at, payload, event.recordedAt)
      .run();
    accepted.push(event.id);
  }
  return json(200, { ok: true, accepted });
}

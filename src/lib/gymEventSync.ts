/**
 * Push this device's academy events and pull the license copy.
 * A failed call leaves the on-device log as it is.
 */

import { readCloudBearer } from './advantageCloudMedia.ts';
import {
  appendGymEvents,
  readGymEvents,
  readGymMeta,
  writeGymMeta,
} from './gymEventLog.ts';
import type { GymCloudTotals, GymEvent } from './gymEvents.ts';
import { sanitizeGymEvent } from './gymEvents.ts';
import { readCurrentSeat } from './instructorSeats.ts';
import { proPlusCloudUnlocked } from './proPlusCloud.ts';
import { archiveStudent, removeStudent, restoreStudent } from './rosterStore.ts';

const PAGE = 500;

export function shouldSyncGymEvents(): boolean {
  if (!readCloudBearer()) return false;
  if (proPlusCloudUnlocked()) return true;
  const preset = readCurrentSeat()?.presetId;
  return preset === 'coach' || preset === 'instructors';
}

type PullBody = { ok?: boolean; events?: unknown; totals?: GymCloudTotals; cursor?: number };
type PushBody = { ok?: boolean; accepted?: string[] };

async function pushEvents(token: string, pull: typeof fetch): Promise<boolean> {
  let guard = 0;
  while (guard < 20) {
    guard += 1;
    const cursor = readGymMeta().pushCursor;
    const batch = readGymEvents()
      .filter((event) => event.recordedAt >= cursor)
      .slice(0, 200);
    if (!batch.length) return true;
    const response = await pull('/api/gym/events', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ events: batch }),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as PushBody;
    if (!body.ok) return false;
    const max = batch.reduce((peak, event) => Math.max(peak, event.recordedAt), cursor);
    writeGymMeta({ pushCursor: max + 1 });
    if (batch.length < 200) return true;
  }
  return true;
}

function applyRosterEffects(events: readonly GymEvent[]): void {
  for (const event of events) {
    if (event.type === 'student_archived') archiveStudent(event.studentId, event.reason ?? 'left', { record: false });
    else if (event.type === 'student_restored') restoreStudent(event.studentId, { record: false });
    else if (event.type === 'student_deleted') removeStudent(event.studentId, { record: false });
  }
}

async function pullEvents(token: string, pull: typeof fetch): Promise<boolean> {
  let guard = 0;
  let totals: GymCloudTotals | null = null;
  while (guard < 20) {
    guard += 1;
    const since = readGymMeta().pullCursor;
    const response = await pull(`/api/gym/events?since=${since}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return false;
    const body = (await response.json()) as PullBody;
    if (!body.ok || !Array.isArray(body.events)) return false;
    const events = body.events
      .map((row) => sanitizeGymEvent(row))
      .filter((event): event is GymEvent => Boolean(event));
    const before = new Set(readGymEvents().map((event) => event.id));
    appendGymEvents(events);
    applyRosterEffects(events.filter((event) => !before.has(event.id)));
    if (body.totals && typeof body.totals.classes === 'number') totals = body.totals;
    const cursor = typeof body.cursor === 'number' ? body.cursor : since;
    writeGymMeta({ pullCursor: cursor, cloudSynced: true, ...(totals ? { cloudTotals: totals } : {}) });
    if (body.events.length < PAGE) return true;
  }
  return true;
}

/** Share this device's log with Advantage Cloud when this seat can. */
export async function syncGymEvents(pull: typeof fetch = fetch): Promise<boolean> {
  if (!shouldSyncGymEvents()) return false;
  const token = readCloudBearer();
  if (!token) return false;
  try {
    const pushed = await pushEvents(token, pull);
    if (!pushed) return false;
    return await pullEvents(token, pull);
  } catch {
    return false;
  }
}

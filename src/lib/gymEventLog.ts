/**
 * Local append-only academy log (`matboard.gymEvents.v1`).
 * Writers live next to the roster, the coach belt save, check-in, and the lesson plan.
 * The same id is stored once. Check-in is once per person per day.
 */

import {
  classMinutes,
  gymEventId,
  localDay,
  planTaught,
  rankFacts,
  sanitizeGymEvent,
  sanitizeGymEvents,
  type ArchiveReason,
  type GymActor,
  type GymEvent,
  type GymSource,
  type MinutePlan,
  type RankSnap,
} from './gymEvents.ts';

export const GYM_EVENTS_KEY = 'matboard.gymEvents.v1';
export const GYM_EVENTS_META_KEY = 'matboard.gymEvents.meta.v1';

export type GymMeta = {
  v: 1;
  backfillDone: boolean;
  pushCursor: number;
  pullCursor: number;
  cloudSynced: boolean;
};

export type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

type ActorContext = GymActor & { licenseId: string };

const listeners = new Set<() => void>();
let cache: GymEvent[] | null = null;
let snapshot: GymEvent[] = [];
let metaCache: GymMeta | null = null;
let bound: MemoryStore | null = null;
let actorReader: () => ActorContext = () => ({ licenseId: 'local', seatId: 'owner', name: 'Owner' });

function emptyMeta(): GymMeta {
  return { v: 1, backfillDone: false, pushCursor: 0, pullCursor: 0, cloudSynced: false };
}

function storage(): MemoryStore | null {
  try {
    const store = bound ?? (typeof localStorage === 'undefined' ? null : localStorage);
    if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function') return null;
    return store;
  } catch {
    return null;
  }
}

export function setGymEventStorageForTests(store: MemoryStore | null): void {
  bound = store;
  cache = null;
  metaCache = null;
  snapshot = [];
}

export function setGymActorReader(reader: () => ActorContext): void {
  actorReader = reader;
}

export function setGymActorReaderForTests(reader: (() => ActorContext) | null): void {
  actorReader = reader ?? (() => ({ licenseId: 'local', seatId: 'owner', name: 'Owner' }));
}

function actorNow(): ActorContext {
  try {
    const actor = actorReader();
    return {
      licenseId: actor.licenseId || 'local',
      seatId: actor.seatId || 'owner',
      name: actor.name || 'Owner',
    };
  } catch {
    return { licenseId: 'local', seatId: 'owner', name: 'Owner' };
  }
}

function notify(): void {
  snapshot = cache ? cache.slice() : [];
  listeners.forEach((fn) => fn());
}

function load(): GymEvent[] {
  if (cache) return cache;
  try {
    const raw = storage()?.getItem(GYM_EVENTS_KEY);
    cache = raw ? sanitizeGymEvents(JSON.parse(raw) as unknown) : [];
  } catch {
    cache = [];
  }
  snapshot = cache.slice();
  return cache;
}

function persist(events: GymEvent[]): void {
  cache = events;
  try {
    storage()?.setItem(GYM_EVENTS_KEY, JSON.stringify(events));
  } catch {
    /* quota or private mode: the in-memory log still stands for this session */
  }
  notify();
}

export function readGymMeta(): GymMeta {
  if (metaCache) return metaCache;
  try {
    const raw = storage()?.getItem(GYM_EVENTS_META_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<GymMeta>) : {};
    metaCache = {
      v: 1,
      backfillDone: parsed.backfillDone === true,
      pushCursor: typeof parsed.pushCursor === 'number' ? parsed.pushCursor : 0,
      pullCursor: typeof parsed.pullCursor === 'number' ? parsed.pullCursor : 0,
      cloudSynced: parsed.cloudSynced === true,
    };
  } catch {
    metaCache = emptyMeta();
  }
  return metaCache;
}

export function writeGymMeta(patch: Partial<GymMeta>): GymMeta {
  const next = { ...readGymMeta(), ...patch, v: 1 as const };
  metaCache = next;
  try {
    storage()?.setItem(GYM_EVENTS_META_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function readGymEvents(): GymEvent[] {
  return load().slice();
}

export function getGymEventsSnapshot(): GymEvent[] {
  load();
  return snapshot;
}

export function subscribeGymEvents(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetGymEvents(): void {
  cache = [];
  snapshot = [];
  metaCache = emptyMeta();
  try {
    storage()?.removeItem?.(GYM_EVENTS_KEY);
    storage()?.removeItem?.(GYM_EVENTS_META_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

/** Insert events whose ids are not already stored. Unknown fields are dropped. Returns how many were new. */
export function appendGymEvents(events: readonly unknown[]): number {
  const current = load();
  const seen = new Set(current.map((event) => event.id));
  const next = current.slice();
  let added = 0;
  for (const event of events) {
    const clean = sanitizeGymEvent(event);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    next.push(clean);
    added += 1;
  }
  if (added) persist(next);
  return added;
}

function stamp(input: Record<string, unknown>, source: GymSource = 'live'): GymEvent | null {
  const actor = actorNow();
  const now = Date.now();
  return sanitizeGymEvent(
    {
      id: gymEventId(),
      at: new Date(now).toISOString(),
      recordedAt: now,
      licenseId: actor.licenseId,
      actor: { seatId: actor.seatId, name: actor.name },
      source,
      v: 1,
      ...input,
    },
    now,
  );
}

export function recordStudentAdded(
  student: { id: string; belt: string; rosterList?: 'student'; startedOn?: string },
  source: GymSource = 'live',
): void {
  const id = source === 'backfill' ? `backfill:added:${student.id}` : gymEventId();
  const event = stamp(
    {
      id,
      type: 'student_added',
      studentId: student.id,
      rosterList: student.rosterList === 'student' ? 'student' : 'competitor',
      belt: student.belt,
      ...(student.startedOn ? { startedOn: student.startedOn } : {}),
    },
    source,
  );
  if (event) appendGymEvents([event]);
}

export function recordStudentArchived(studentId: string, reason?: ArchiveReason): void {
  const event = stamp({ type: 'student_archived', studentId, ...(reason ? { reason } : {}) });
  if (event) appendGymEvents([event]);
}

export function recordStudentRestored(studentId: string): void {
  const event = stamp({ type: 'student_restored', studentId });
  if (event) appendGymEvents([event]);
}

export function recordStudentDeleted(studentId: string): void {
  const tomb = stamp({ id: `deleted:${studentId}`, type: 'student_deleted', studentId });
  if (tomb) appendGymEvents([tomb]);
}

export function recordCheckIn(studentId: string, personKey: string, date = localDay()): void {
  const key = personKey || studentId;
  if (load().some((event) => event.type === 'check_in' && event.personKey === key && event.date === date)) return;
  const event = stamp({ id: `checkin:${key}:${date}`, type: 'check_in', studentId, personKey: key, date, at: `${date}T12:00:00.000Z` });
  if (event) appendGymEvents([event]);
}

/** One estimated promotion per student. Stripes stay 0: this device has no stripe history. */
export function recordBackfillPromotion(studentId: string, belt: string, date: string): void {
  const event = stamp(
    {
      id: `backfill:promotion:${studentId}`,
      type: 'promotion',
      studentId,
      from: { belt: '', stripes: 0 },
      to: { belt, stripes: 0 },
      date,
      at: `${date}T12:00:00.000Z`,
    },
    'backfill',
  );
  if (event) appendGymEvents([event]);
}

export function recordRankFacts(studentId: string, before: RankSnap, saved: RankSnap, date: string): void {
  for (const fact of rankFacts(before, saved, date)) {
    if (fact.kind === 'promotion') {
      const event = stamp({
        type: 'promotion',
        studentId,
        from: { belt: fact.fromBelt, stripes: fact.fromStripes },
        to: { belt: fact.toBelt, stripes: fact.toStripes },
        date: fact.date,
        at: `${fact.date}T12:00:00.000Z`,
      });
      if (event) appendGymEvents([event]);
    } else {
      const event = stamp({
        type: 'stripe.awarded',
        studentId,
        belt: fact.belt,
        stripeFrom: fact.stripeFrom,
        stripeTo: fact.stripeTo,
        date: fact.date,
        at: `${fact.date}T12:00:00.000Z`,
      });
      if (event) appendGymEvents([event]);
    }
  }
}

export function setPlanTaught(input: {
  planId: string;
  date: string;
  taught: boolean;
  template: string;
  classDesignation: string;
  minutes: number;
  source?: GymSource;
}): void {
  const events = load();
  const on = planTaught(events, input.planId, input.date);
  if (input.taught === on) return;
  const actor = actorNow();
  const event = input.taught
    ? stamp(
        {
          type: 'class_taught',
          planId: input.planId,
          date: input.date,
          template: input.template || 'adult',
          classDesignation: input.classDesignation,
          minutes: input.minutes || 60,
          instructorSeat: actor.seatId,
          at: `${input.date}T12:00:00.000Z`,
        },
        input.source ?? 'live',
      )
    : stamp({ type: 'class_untaught', planId: input.planId, date: input.date, at: `${input.date}T12:00:00.000Z` });
  if (event) appendGymEvents([event]);
}

export function taughtPlan(planId: string, date: string): boolean {
  return planTaught(load(), planId, date);
}

export function minutesForPlan(plan: MinutePlan): number {
  return classMinutes(plan);
}

export type { GymEvent };

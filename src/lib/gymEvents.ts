/**
 * Academy event facts for Advantage. Append-only. Names stay on the roster
 * and are resolved when a screen draws them. This module is pure: no storage,
 * no Student Edition journal, injury, hiatus, body scan, mat hours, or
 * self-assessment, and no private coach notes.
 */

import { parseExpectedMinutes } from './expectedDuration.ts';

export const GYM_EVENT_VERSION = 1 as const;

export const ARCHIVE_REASONS = ['left', 'paused', 'moved', 'other'] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];

export type GymActor = { seatId: string; name: string };
export type GymSource = 'live' | 'backfill';

export type GymEventBase = {
  id: string;
  at: string;
  recordedAt: number;
  licenseId: string;
  actor: GymActor;
  source: GymSource;
  v: typeof GYM_EVENT_VERSION;
};

export type GymEvent = GymEventBase &
  (
    | { type: 'student_added'; studentId: string; rosterList: 'student' | 'competitor'; belt: string; startedOn?: string }
    | { type: 'student_archived'; studentId: string; reason?: ArchiveReason }
    | { type: 'student_restored'; studentId: string }
    | { type: 'student_deleted'; studentId: string }
    | {
        type: 'promotion';
        studentId: string;
        from: { belt: string; stripes: number };
        to: { belt: string; stripes: number };
        date: string;
      }
    | { type: 'stripe.awarded'; studentId: string; belt: string; stripeFrom: number; stripeTo: number; date: string }
    | { type: 'check_in'; studentId: string; personKey: string; date: string }
    | {
        type: 'class_taught';
        planId: string;
        date: string;
        template: string;
        classDesignation: string;
        minutes: number;
        instructorSeat: string;
      }
    | { type: 'class_untaught'; planId: string; date: string }
  );

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9._:|-]{1,120}$/;
const SHORT_RE = /^[\s\S]{0,80}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.+-Z]+)?$/;

export function localDay(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function gymEventId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return cryptoRef.randomUUID();
  return `ge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function text(value: unknown, max = 80): string {
  if (typeof value !== 'string') return '';
  const clipped = value.trim().slice(0, max);
  return SHORT_RE.test(clipped) ? clipped : clipped.slice(0, max);
}

function stripesOf(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(4, Math.trunc(n)));
}

function minutesOf(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const halves = Math.round(n * 2) / 2;
  return Math.max(0, Math.min(480, halves));
}

function dayOf(value: unknown, fallback: string): string {
  return typeof value === 'string' && DATE_RE.test(value) ? value : fallback;
}

function idOf(value: unknown): string {
  if (typeof value !== 'string') return '';
  const id = value.trim();
  return ID_RE.test(id) ? id : '';
}

/** Copy only known fields. Anything else, including notes and journal text, is dropped. */
export function sanitizeGymEvent(raw: unknown, now = Date.now()): GymEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const type = row.type;
  const id = idOf(row.id);
  if (!id) return null;
  const actorRaw = row.actor && typeof row.actor === 'object' ? (row.actor as Record<string, unknown>) : {};
  const seatId = idOf(actorRaw.seatId) || 'owner';
  const base: GymEventBase = {
    id,
    at: typeof row.at === 'string' && ISO_RE.test(row.at) ? row.at : new Date(now).toISOString(),
    recordedAt: typeof row.recordedAt === 'number' && Number.isFinite(row.recordedAt) ? row.recordedAt : now,
    licenseId: idOf(row.licenseId) || 'local',
    actor: { seatId, name: text(actorRaw.name, 40) || 'Owner' },
    source: row.source === 'backfill' ? 'backfill' : 'live',
    v: GYM_EVENT_VERSION,
  };
  const studentId = idOf(row.studentId);
  if (type === 'student_added') {
    if (!studentId) return null;
    const startedOn = typeof row.startedOn === 'string' && DATE_RE.test(row.startedOn) ? row.startedOn : '';
    return {
      ...base,
      type: 'student_added',
      studentId,
      rosterList: row.rosterList === 'student' ? 'student' : 'competitor',
      belt: text(row.belt, 40) || 'White',
      ...(startedOn ? { startedOn } : {}),
    };
  }
  if (type === 'student_archived') {
    if (!studentId) return null;
    const reason = ARCHIVE_REASONS.find((item) => item === row.reason);
    return { ...base, type: 'student_archived', studentId, ...(reason ? { reason } : {}) };
  }
  if (type === 'student_restored' || type === 'student_deleted') {
    if (!studentId) return null;
    return { ...base, type, studentId };
  }
  if (type === 'promotion') {
    if (!studentId) return null;
    const from = row.from && typeof row.from === 'object' ? (row.from as Record<string, unknown>) : {};
    const to = row.to && typeof row.to === 'object' ? (row.to as Record<string, unknown>) : {};
    return {
      ...base,
      type: 'promotion',
      studentId,
      from: { belt: text(from.belt, 40), stripes: stripesOf(from.stripes) },
      to: { belt: text(to.belt, 40) || 'White', stripes: stripesOf(to.stripes) },
      date: dayOf(row.date, base.at.slice(0, 10)),
    };
  }
  if (type === 'stripe.awarded') {
    if (!studentId) return null;
    const stripeFrom = stripesOf(row.stripeFrom);
    const stripeTo = stripesOf(row.stripeTo);
    if (stripeTo <= stripeFrom) return null;
    return {
      ...base,
      type: 'stripe.awarded',
      studentId,
      belt: text(row.belt, 40) || 'White',
      stripeFrom,
      stripeTo,
      date: dayOf(row.date, base.at.slice(0, 10)),
    };
  }
  if (type === 'check_in') {
    if (!studentId) return null;
    const date = dayOf(row.date, base.at.slice(0, 10));
    return {
      ...base,
      type: 'check_in',
      studentId,
      personKey: idOf(row.personKey) || studentId,
      date,
    };
  }
  if (type === 'class_taught') {
    const planId = idOf(row.planId);
    if (!planId) return null;
    return {
      ...base,
      type: 'class_taught',
      planId,
      date: dayOf(row.date, base.at.slice(0, 10)),
      template: text(row.template, 40) || 'adult',
      classDesignation: text(row.classDesignation, 80),
      minutes: minutesOf(row.minutes) || 60,
      instructorSeat: idOf(row.instructorSeat) || seatId,
    };
  }
  if (type === 'class_untaught') {
    const planId = idOf(row.planId);
    if (!planId) return null;
    return { ...base, type: 'class_untaught', planId, date: dayOf(row.date, base.at.slice(0, 10)) };
  }
  return null;
}

export function sanitizeGymEvents(raw: unknown, now = Date.now()): GymEvent[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const events: GymEvent[] = [];
  for (const item of raw) {
    const event = sanitizeGymEvent(item, now);
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);
    events.push(event);
  }
  return events;
}

export type RankSnap = { belt: string; stripes?: number; lastPromotion: string };

/**
 * A belt change is one promotion, including a promotion that resets stripes to 0.
 * More stripes on the same belt are stripe.awarded. Fewer stripes on the same belt are not logged.
 */
export function rankFacts(before: RankSnap, saved: RankSnap, date: string): Array<
  | { kind: 'promotion'; fromBelt: string; fromStripes: number; toBelt: string; toStripes: number; date: string }
  | { kind: 'stripes'; belt: string; stripeFrom: number; stripeTo: number; date: string }
> {
  const fromStripes = stripesOf(before.stripes);
  const toStripes = stripesOf(saved.stripes);
  const when = DATE_RE.test(date) ? date : localDay();
  if (saved.belt !== before.belt) {
    return [{ kind: 'promotion', fromBelt: before.belt, fromStripes, toBelt: saved.belt, toStripes, date: when }];
  }
  if (toStripes > fromStripes) {
    return [{ kind: 'stripes', belt: saved.belt, stripeFrom: fromStripes, stripeTo: toStripes, date: when }];
  }
  return [];
}

const MINUTE_WORD = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i;
const MINUTE_MIN = /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/i;

export function minutesFromExpected(value: string): number {
  const textValue = value.trim();
  if (!textValue) return 0;
  const hours = MINUTE_WORD.exec(textValue);
  if (hours) return Math.min(480, Math.round(Number(hours[1]) * 60));
  const parsed = parseExpectedMinutes(textValue);
  if (parsed != null) return Math.min(480, parsed);
  const mins = MINUTE_MIN.exec(textValue);
  if (mins) {
    const n = Math.round(Number(mins[1]) * 4) / 4;
    return n > 0 ? Math.min(480, n) : 0;
  }
  if (/^\d+(?:\.\d+)?$/.test(textValue)) {
    const n = Math.round(Number(textValue) * 4) / 4;
    return n > 0 && n <= 240 ? n : 0;
  }
  return 0;
}

export type MinutePlan = {
  introExpected?: string;
  warmupExpected?: string;
  specificExpected?: string;
  cooldownExpected?: string;
  techniques?: { expected?: string }[];
  games?: { expected?: string }[];
};

/** Sum of expected durations on a lesson plan, including 15-second rows. 60 when nothing on the plan parses. */
export function classMinutes(plan: MinutePlan): number {
  const parts = [
    plan.introExpected ?? '',
    plan.warmupExpected ?? '',
    plan.specificExpected ?? '',
    plan.cooldownExpected ?? '',
    ...(plan.techniques ?? []).map((block) => block.expected ?? ''),
    ...(plan.games ?? []).map((block) => block.expected ?? ''),
  ];
  const sum = parts.reduce((total, part) => total + minutesFromExpected(part), 0);
  return sum > 0 ? Math.min(480, sum) : 60;
}

export function planTaught(events: readonly GymEvent[], planId: string, date: string): boolean {
  let taught = false;
  for (const event of events) {
    if ((event.type === 'class_taught' || event.type === 'class_untaught') && event.planId === planId && event.date === date) {
      taught = event.type === 'class_taught';
    }
  }
  return taught;
}

export function netClasses(events: readonly GymEvent[]): { count: number; minutes: number } {
  const open = new Map<string, number>();
  for (const event of events) {
    const key = event.type === 'class_taught' || event.type === 'class_untaught' ? `${event.planId}|${event.date}` : '';
    if (!key) continue;
    if (event.type === 'class_taught') open.set(key, event.minutes);
    else open.delete(key);
  }
  let minutes = 0;
  for (const value of open.values()) minutes += value;
  return { count: open.size, minutes };
}

export function promotionEvents(events: readonly GymEvent[]): Extract<GymEvent, { type: 'promotion' }>[] {
  return events.filter((event): event is Extract<GymEvent, { type: 'promotion' }> => event.type === 'promotion');
}

export function stripesGiven(events: readonly GymEvent[], year?: number): number {
  let total = 0;
  for (const event of events) {
    if (event.type !== 'stripe.awarded') continue;
    if (year !== undefined && !event.date.startsWith(String(year))) continue;
    total += event.stripeTo - event.stripeFrom;
  }
  return total;
}

const BELT_ORDER = ['White', 'Blue', 'Purple', 'Brown', 'Black', 'Grey', 'Yellow', 'Orange', 'Green'];

export type BeltTally = { belt: string; count: number; estimate: number };

export function beltsPromoted(events: readonly GymEvent[]): BeltTally[] {
  const map = new Map<string, BeltTally>();
  for (const event of promotionEvents(events)) {
    const belt = event.to.belt || 'White';
    const row = map.get(belt) ?? { belt, count: 0, estimate: 0 };
    row.count += 1;
    if (event.source === 'backfill') row.estimate += 1;
    map.set(belt, row);
  }
  return [...map.values()].sort((a, b) => {
    const ai = BELT_ORDER.indexOf(a.belt);
    const bi = BELT_ORDER.indexOf(b.belt);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.belt.localeCompare(b.belt);
  });
}

export type LifeState = { added: string; startedOn?: string; archived: string | null; deleted: boolean };

export function studentLives(events: readonly GymEvent[]): Map<string, LifeState> {
  const lives = new Map<string, LifeState>();
  for (const event of events) {
    if (event.type === 'student_added') {
      const current = lives.get(event.studentId);
      lives.set(event.studentId, {
        added: current?.added ?? event.at.slice(0, 10),
        startedOn: event.startedOn ?? current?.startedOn,
        archived: current?.archived ?? null,
        deleted: current?.deleted ?? false,
      });
    } else if (event.type === 'student_archived') {
      const current = lives.get(event.studentId) ?? { added: event.at.slice(0, 10), archived: null, deleted: false };
      current.archived = event.at.slice(0, 10);
      lives.set(event.studentId, current);
    } else if (event.type === 'student_restored') {
      const current = lives.get(event.studentId);
      if (current) current.archived = null;
    } else if (event.type === 'student_deleted') {
      const current = lives.get(event.studentId) ?? { added: event.at.slice(0, 10), archived: null, deleted: false };
      current.deleted = true;
      lives.set(event.studentId, current);
    }
  }
  return lives;
}

export function activeStudentCount(events: readonly GymEvent[]): number {
  let count = 0;
  for (const life of studentLives(events).values()) if (!life.deleted && !life.archived) count += 1;
  return count;
}

function daySpan(start: string, end: string): number {
  const a = Date.parse(start.length === 10 ? `${start}T12:00:00Z` : start);
  const b = Date.parse(end.length === 10 ? `${end}T12:00:00Z` : end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export type TenureStats = { averageDays: number; medianDays: number; longestDays: number; active: number; counted: number };

export function tenureStats(events: readonly GymEvent[], today = localDay()): TenureStats {
  const spans: number[] = [];
  let longest = 0;
  let active = 0;
  for (const life of studentLives(events).values()) {
    if (life.deleted) continue;
    if (!life.archived) active += 1;
    const start = life.startedOn || life.added;
    const end = life.archived || today;
    const span = daySpan(start, end);
    spans.push(span);
    if (!life.archived && span > longest) longest = span;
  }
  spans.sort((a, b) => a - b);
  const counted = spans.length;
  const averageDays = counted ? Math.round(spans.reduce((sum, value) => sum + value, 0) / counted) : 0;
  const medianDays = counted ? spans[Math.floor((counted - 1) / 2)] : 0;
  return { averageDays, medianDays, longestDays: longest, active, counted };
}

export type InstructorTally = {
  seatId: string;
  name: string;
  classes: number;
  minutes: number;
  promotions: number;
  stripes: number;
};

function seatOf(event: GymEvent): string {
  if (event.type === 'class_taught') return event.instructorSeat || event.actor.seatId;
  return event.actor.seatId;
}

export function instructorTallies(events: readonly GymEvent[]): InstructorTally[] {
  const map = new Map<string, InstructorTally>();
  const touch = (seatId: string, name: string) => {
    const row = map.get(seatId) ?? { seatId, name: name || 'Instructor', classes: 0, minutes: 0, promotions: 0, stripes: 0 };
    if (name) row.name = name;
    map.set(seatId, row);
    return row;
  };
  const classes = new Map<string, { seatId: string; minutes: number }>();
  for (const event of events) {
    if (event.type === 'class_taught') {
      classes.set(`${event.planId}|${event.date}`, { seatId: seatOf(event), minutes: event.minutes });
      touch(seatOf(event), event.actor.name);
    } else if (event.type === 'class_untaught') {
      classes.delete(`${event.planId}|${event.date}`);
    } else if (event.type === 'promotion') {
      touch(event.actor.seatId, event.actor.name).promotions += 1;
    } else if (event.type === 'stripe.awarded') {
      touch(event.actor.seatId, event.actor.name).stripes += event.stripeTo - event.stripeFrom;
    }
  }
  for (const row of classes.values()) {
    const tally = touch(row.seatId, '');
    tally.classes += 1;
    tally.minutes += row.minutes;
  }
  return [...map.values()].filter((row) => row.classes || row.promotions || row.stripes).sort((a, b) => b.classes - a.classes || a.name.localeCompare(b.name));
}

export type GymView =
  | { kind: 'owner' }
  | { kind: 'own'; seatId: string; anonymousTotals: boolean }
  | { kind: 'hidden' };

/**
 * Owner sees every event. Coach and Instructors see their own events plus anonymous
 * academy totals. Assistant, program director, and custom seats see only their own
 * unless the owner opts them in. `hidden` is reserved for a sheet that must not render.
 */
export function gymViewFor(input: { seatId: string | null; preset: string | null; optedIn: boolean }): GymView {
  if (!input.seatId || input.seatId === 'owner') return { kind: 'owner' };
  const rosterSeat = input.preset === 'coach' || input.preset === 'instructors';
  if (rosterSeat || input.optedIn) return { kind: 'own', seatId: input.seatId, anonymousTotals: true };
  return { kind: 'own', seatId: input.seatId, anonymousTotals: false };
}

/** Gym-wide sheet: owner, Coach, Instructors, or a preset the owner opted in. */
export function academySheetOpen(input: { seatId: string | null; preset: string | null; optedIn: boolean }): boolean {
  if (!input.seatId || input.seatId === 'owner') return true;
  if (input.preset === 'coach' || input.preset === 'instructors') return true;
  return input.optedIn;
}

export function eventsForView(events: readonly GymEvent[], view: GymView): { detail: GymEvent[]; totals: GymEvent[] } {
  if (view.kind === 'owner') return { detail: [...events], totals: [...events] };
  if (view.kind === 'hidden') return { detail: [], totals: [] };
  const own = events.filter((event) => seatOf(event) === view.seatId || event.actor.seatId === view.seatId);
  return { detail: own, totals: view.anonymousTotals ? [...events] : own };
}

export function studentLabel(
  studentId: string,
  students: readonly { id: string; name: string }[],
  events: readonly GymEvent[],
): string {
  if (events.some((event) => event.type === 'student_deleted' && event.studentId === studentId)) return 'Removed student';
  return students.find((student) => student.id === studentId)?.name || 'Student';
}

export type YearBelts = { year: string; belts: BeltTally[] };

/** Belt promotions grouped by the year they were dated. */
export function promotionsByYear(events: readonly GymEvent[]): YearBelts[] {
  const years = new Map<string, GymEvent[]>();
  for (const event of promotionEvents(events)) {
    const year = event.date.slice(0, 4) || 'Unknown';
    const list = years.get(year) ?? [];
    list.push(event);
    years.set(year, list);
  }
  return [...years.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([year, rows]) => ({ year, belts: beltsPromoted(rows) }));
}

export type GymCloudTotals = {
  promotions: number;
  stripes: number;
  stripesThisYear: number;
  classes: number;
  minutes: number;
  activeStudents: number;
  belts: BeltTally[];
  instructors: InstructorTally[];
  tenure: TenureStats;
};

export function cloudTotals(events: readonly GymEvent[], year = new Date().getFullYear(), today = localDay()): GymCloudTotals {
  const classes = netClasses(events);
  return {
    promotions: promotionEvents(events).length,
    stripes: stripesGiven(events),
    stripesThisYear: stripesGiven(events, year),
    classes: classes.count,
    minutes: classes.minutes,
    activeStudents: activeStudentCount(events),
    belts: beltsPromoted(events),
    instructors: instructorTallies(events),
    tenure: tenureStats(events, today),
  };
}

/** Collapse every instructor except the viewer into one anonymous bucket. */
export function anonymousInstructors(rows: readonly InstructorTally[], seatId: string): InstructorTally[] {
  const mine = rows.find((row) => row.seatId === seatId);
  const rest = rows.filter((row) => row.seatId !== seatId);
  const other = rest.reduce<InstructorTally>(
    (sum, row) => ({
      seatId: 'other',
      name: 'Other instructors',
      classes: sum.classes + row.classes,
      minutes: sum.minutes + row.minutes,
      promotions: sum.promotions + row.promotions,
      stripes: sum.stripes + row.stripes,
    }),
    { seatId: 'other', name: 'Other instructors', classes: 0, minutes: 0, promotions: 0, stripes: 0 },
  );
  const out: InstructorTally[] = [];
  if (mine) out.push(mine);
  if (other.classes || other.promotions || other.stripes) out.push(other);
  return out;
}

export function formatDays(days: number): string {
  if (days < 30) return days === 1 ? '1 day' : `${days} days`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years && months) return `${years}y ${months}m`;
  if (years) return years === 1 ? '1 year' : `${years} years`;
  return months === 1 ? '1 month' : `${months} months`;
}

/** Shared on-device gym calendar. Class Schedule writes this; Events can reuse it later. */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** Recurring weekly slot on the Class Schedule board. */
export type WeeklyClassSlot = {
  id: string;
  kind: 'class';
  day: Weekday;
  time: string;
  title: string;
};

/**
 * Dated or ongoing notice. Phase 1 shows these on the notices strip.
 * Later, Events flyers can set `flyerId` to a photoStore Events-folder id
 * and the same row can appear on that calendar day.
 */
export type SpecialDate = {
  id: string;
  kind: 'special';
  /** ISO `YYYY-MM-DD`. Empty = ongoing / this-week notice with no pinned day. */
  date: string;
  title: string;
  body: string;
  /** Reserved for Events: `photoStore` item id in the Events folder. */
  flyerId: string | null;
};

export type GymCalendarState = {
  version: 1;
  title: string;
  qrUrl: string;
  /** Free-text strip. Still the fastest way to post a gym-TV notice. */
  notes: string;
  classes: WeeklyClassSlot[];
  specials: SpecialDate[];
};

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'string' && (WEEKDAYS as readonly string[]).includes(value);
}

export function weekdayFromJsDay(jsDay: number): Weekday {
  const index = ((Math.trunc(jsDay) % 7) + 7) % 7;
  return WEEKDAYS[(index + 6) % 7] ?? 'mon';
}

export function todayWeekday(now = new Date()): Weekday {
  return weekdayFromJsDay(now.getDay());
}

export function normalizeQrUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function parseTimeMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return Number.POSITIVE_INFINITY;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.POSITIVE_INFINITY;
  return hours * 60 + minutes;
}

/** Gym-TV clock: 18:00 → 6:00 PM. */
export function formatClassTime(time: string): string {
  const minutes = parseTimeMinutes(time);
  if (!Number.isFinite(minutes)) return time.trim() || '—';
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

export function normalizeIsoDate(raw: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const next = new Date(year, month - 1, day);
  if (next.getFullYear() !== year || next.getMonth() !== month - 1 || next.getDate() !== day) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function formatSpecialDate(date: string): string {
  const iso = normalizeIsoDate(date);
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const next = new Date(year, (month ?? 1) - 1, day ?? 1);
  return next.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function weekdayFromIsoDate(date: string): Weekday | null {
  const iso = normalizeIsoDate(date);
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return weekdayFromJsDay(new Date(year, (month ?? 1) - 1, day ?? 1).getDay());
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function mondayOf(value: Date): Date {
  const start = startOfDay(value);
  const jsDay = start.getDay();
  const offset = jsDay === 0 ? -6 : 1 - jsDay;
  start.setDate(start.getDate() + offset);
  return start;
}

export function specialsThisWeek(specials: readonly SpecialDate[], now = new Date()): SpecialDate[] {
  const start = mondayOf(now);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return specials.filter((item) => {
    const iso = normalizeIsoDate(item.date);
    if (!iso) return true;
    const [year, month, day] = iso.split('-').map(Number);
    const when = new Date(year, (month ?? 1) - 1, day ?? 1);
    return when >= start && when < end;
  });
}

export function compareClasses(a: WeeklyClassSlot, b: WeeklyClassSlot): number {
  const day = WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day);
  if (day !== 0) return day;
  const time = parseTimeMinutes(a.time) - parseTimeMinutes(b.time);
  if (time !== 0) return time;
  return a.title.localeCompare(b.title);
}

export function sortClasses(classes: readonly WeeklyClassSlot[]): WeeklyClassSlot[] {
  return [...classes].sort(compareClasses);
}

export function classesOnDay(classes: readonly WeeklyClassSlot[], day: Weekday): WeeklyClassSlot[] {
  return sortClasses(classes.filter((row) => row.day === day));
}

export function compareSpecials(a: SpecialDate, b: SpecialDate): number {
  if (!a.date && b.date) return 1;
  if (a.date && !b.date) return -1;
  const date = a.date.localeCompare(b.date);
  if (date !== 0) return date;
  return a.title.localeCompare(b.title);
}

export function sortSpecials(specials: readonly SpecialDate[]): SpecialDate[] {
  return [...specials].sort(compareSpecials);
}

export function noticeLines(notes: string, specials: readonly SpecialDate[], now = new Date()): string[] {
  const lines: string[] = [];
  const trimmed = notes.trim();
  if (trimmed) lines.push(trimmed);
  for (const item of sortSpecials(specialsThisWeek(specials, now))) {
    const label = item.title.trim() || item.body.trim();
    if (!label) continue;
    const when = formatSpecialDate(item.date);
    lines.push(when ? `${when} · ${label}` : label);
  }
  return lines;
}

export function defaultGymCalendar(): GymCalendarState {
  return {
    version: 1,
    title: '',
    qrUrl: '',
    notes: '',
    classes: [],
    specials: [],
  };
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createClassId(): string {
  return newId('class');
}

export function createSpecialId(): string {
  return newId('special');
}

function normalizeClass(raw: unknown, fallbackId: string): WeeklyClassSlot | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (!isWeekday(row.day)) return null;
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  const time = typeof row.time === 'string' ? row.time.trim() : '';
  if (!title && !time) return null;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : fallbackId;
  return { id, kind: 'class', day: row.day, time, title };
}

function normalizeSpecial(raw: unknown, fallbackId: string): SpecialDate | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  const body = typeof row.body === 'string' ? row.body.trim() : '';
  const date = typeof row.date === 'string' ? normalizeIsoDate(row.date) : '';
  if (!title && !body && !date) return null;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : fallbackId;
  const flyerId = typeof row.flyerId === 'string' && row.flyerId.trim() ? row.flyerId.trim() : null;
  return { id, kind: 'special', date, title, body, flyerId };
}

export function normalizeGymCalendar(raw: unknown): GymCalendarState {
  const parsed = raw && typeof raw === 'object' ? (raw as Partial<GymCalendarState>) : {};
  const classes: WeeklyClassSlot[] = [];
  const specials: SpecialDate[] = [];
  const seen = new Set<string>();
  if (Array.isArray(parsed.classes)) {
    parsed.classes.forEach((row, index) => {
      const next = normalizeClass(row, `class-${index + 1}`);
      if (!next || seen.has(next.id)) return;
      seen.add(next.id);
      classes.push(next);
    });
  }
  if (Array.isArray(parsed.specials)) {
    parsed.specials.forEach((row, index) => {
      const next = normalizeSpecial(row, `special-${index + 1}`);
      if (!next || seen.has(next.id)) return;
      seen.add(next.id);
      specials.push(next);
    });
  }
  return {
    version: 1,
    title: typeof parsed.title === 'string' ? parsed.title : '',
    qrUrl: typeof parsed.qrUrl === 'string' ? parsed.qrUrl : '',
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    classes: sortClasses(classes),
    specials: sortSpecials(specials),
  };
}

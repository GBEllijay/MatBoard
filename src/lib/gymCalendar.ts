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

/** Saved display. Grid is retired and reads back as Week. Cast uses Week or Month. */
export const SCHEDULE_TEMPLATES = ['week', 'weekly-list', 'week-grid', 'monthly'] as const;
export type ScheduleTemplate = (typeof SCHEDULE_TEMPLATES)[number];
export const DEFAULT_SCHEDULE_TEMPLATE: ScheduleTemplate = 'week';

export const SCHEDULE_TEMPLATE_LABELS: Record<ScheduleTemplate, string> = {
  week: 'Week',
  'weekly-list': 'Phone list',
  'week-grid': 'Week',
  monthly: 'Month',
};

export const SCHEDULE_TEMPLATE_HINTS: Record<ScheduleTemplate, string> = {
  week: 'Stacked days, Monday–Sunday. One readable type size, with time, mat, class name, and a short detail. Scrolls when a day runs long.',
  'weekly-list': 'Day banners for editing on a phone. The TV still casts Week or Month.',
  'week-grid': 'The old grid is retired. This board uses the full week.',
  monthly: 'This month at a glance. Color chips by the level picked in Edit, and a class count. Not full class titles.',
};

/** What the screen should draw. The overlapping grid never comes back. */
export function displayTemplate(template: ScheduleTemplate): 'week' | 'monthly' | 'weekly-list' {
  if (template === 'monthly') return 'monthly';
  if (template === 'weekly-list') return 'weekly-list';
  return 'week';
}

export function isScheduleTemplate(value: unknown): value is ScheduleTemplate {
  return typeof value === 'string' && (SCHEDULE_TEMPLATES as readonly string[]).includes(value);
}

function coerceScheduleTemplate(value: unknown): ScheduleTemplate {
  if (value === 'week-grid') return 'week';
  if (value === 'weekly-list' || value === 'monthly' || value === 'week') return value;
  return DEFAULT_SCHEDULE_TEMPLATE;
}

export type MonthDay = {
  iso: string;
  dayNumber: number;
  inMonth: boolean;
  weekday: Weekday;
};

function isoFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Monday-start weeks covering `now`'s month. Leading and trailing days stay in the grid. */
export function monthWeeks(now = new Date()): MonthDay[][] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const cursor = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const weeks: MonthDay[][] = [];
  do {
    const week: MonthDay[] = [];
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(cursor);
      week.push({
        iso: isoFromDate(date),
        dayNumber: date.getDate(),
        inMonth: date.getMonth() === month,
        weekday: WEEKDAYS[(date.getDay() + 6) % 7],
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === month);
  return weeks;
}

/** Owner-picked belt level. Card color comes only from this, never from the class title. */
export const CLASS_LEVELS = [
  'none',
  'fundamentals',
  'intermediate',
  'advanced',
  'expert',
  'kids',
  'kids-advanced',
] as const;
export type ClassLevel = (typeof CLASS_LEVELS)[number];

export function isClassLevel(value: unknown): value is ClassLevel {
  return typeof value === 'string' && (CLASS_LEVELS as readonly string[]).includes(value);
}

export const CLASS_LEVEL_META: Record<
  ClassLevel,
  { label: string; short: string; group: 'adults' | 'kids' | 'other'; blurb: string }
> = {
  fundamentals: { label: 'Fundamentals', short: 'Fundamentals', group: 'adults', blurb: 'Open to everyone' },
  intermediate: { label: 'Intermediate', short: 'Intermediate', group: 'adults', blurb: '3 stripes and up' },
  advanced: { label: 'Advanced', short: 'Advanced', group: 'adults', blurb: 'Blue belt and up' },
  expert: { label: 'Expert', short: 'Expert', group: 'adults', blurb: 'Black belt program / invite only' },
  kids: { label: 'All Levels', short: 'Kids', group: 'kids', blurb: 'Kids of all ages and skill levels' },
  'kids-advanced': { label: 'Advanced', short: 'Kids Advanced', group: 'kids', blurb: 'Advanced kids' },
  none: { label: 'No level', short: 'No level', group: 'other', blurb: 'Open Mat, events — not level-gated' },
};

/**
 * Id or owner-facing label. Blank and unknown values are `null` so a bad edit
 * does not wipe a level that was already saved. "No level" is `none`.
 */
export function coerceClassLevel(value: unknown): ClassLevel | null {
  if (isClassLevel(value)) return value;
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/_+/g, ' ').replace(/\s+/g, ' ');
  if (!key) return null;
  if (isClassLevel(key)) return key;
  const dashed = key.replace(/ /g, '-');
  if (isClassLevel(dashed)) return dashed;
  for (const id of CLASS_LEVELS) {
    const meta = CLASS_LEVEL_META[id];
    if (meta.short.toLowerCase() === key || meta.label.toLowerCase() === key) return id;
  }
  return null;
}

/** Legend and picker order. No level stays last. */
export const CLASS_LEVEL_ORDER: readonly ClassLevel[] = [
  'fundamentals',
  'intermediate',
  'advanced',
  'expert',
  'kids',
  'kids-advanced',
  'none',
];

/** Recurring weekly slot on the Class Schedule board. */
export type WeeklyClassSlot = {
  id: string;
  kind: 'class';
  day: Weekday;
  time: string;
  title: string;
  /** Mat / room for this slot. Same day + time on MAT 1 and MAT 2 are two rows. */
  location: string;
  /** Optional detail under the title, e.g. "Blue belt & up". */
  subtitle: string;
  /**
   * Belt level for the TV board. Missing on saves from before this field
   * existed; readers use `slot.level ?? 'none'`.
   */
  level?: ClassLevel;
};

export type ClassTimeGroup = {
  time: string;
  items: WeeklyClassSlot[];
};

/** Common gym mats. Owners can still type a custom room. */
export const DEFAULT_MATS = ['MAT 1', 'MAT 2'] as const;

export function compareMatLocation(a: string, b: string): number {
  const num = (value: string) => {
    const match = /(\d+)/.exec(value.trim());
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  };
  const byNum = num(a) - num(b);
  if (byNum !== 0) return byNum;
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/** Next unused MAT n for a same-time group (MAT 1 → MAT 2 → MAT 3…). */
export function suggestNextMat(used: readonly string[]): string {
  const taken = new Set(used.map((value) => value.trim().toUpperCase()).filter(Boolean));
  for (const mat of DEFAULT_MATS) {
    if (!taken.has(mat)) return mat;
  }
  let n = DEFAULT_MATS.length + 1;
  while (taken.has(`MAT ${n}`)) n += 1;
  return `MAT ${n}`;
}

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
  /** Display template for the phone preview. The cast week board ignores this. */
  template: ScheduleTemplate;
  /** When true, Media Console plays the week board after Gallery. */
  castEnabled: boolean;
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
  const location = compareMatLocation(a.location, b.location);
  if (location !== 0) return location;
  return a.title.localeCompare(b.title);
}

export function sortClasses(classes: readonly WeeklyClassSlot[]): WeeklyClassSlot[] {
  return [...classes].sort(compareClasses);
}

export function classesOnDay(classes: readonly WeeklyClassSlot[], day: Weekday): WeeklyClassSlot[] {
  return sortClasses(classes.filter((row) => row.day === day));
}

/** Days that actually have a class. Empty board falls back to Mon–Sun so the layout still reads. */
export function boardWeekdays(classes: readonly WeeklyClassSlot[]): Weekday[] {
  const present = new Set(classes.map((row) => row.day));
  const days = WEEKDAYS.filter((day) => present.has(day));
  return days.length ? days : [...WEEKDAYS];
}

/** Clock times that appear anywhere in the week, earliest first. */
export function weekTimeRows(classes: readonly WeeklyClassSlot[]): string[] {
  const times = new Set<string>();
  for (const row of classes) {
    const time = row.time.trim();
    if (time) times.add(time);
  }
  return [...times].sort((a, b) => parseTimeMinutes(a) - parseTimeMinutes(b) || a.localeCompare(b));
}

/**
 * One lane per hour from the earliest class to the latest.
 * 6:00 AM and 7:00 PM become 6:00 through 19:00, including empty hours.
 */
export function weekHourLanes(classes: readonly WeeklyClassSlot[]): string[] {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const row of classes) {
    const minutes = parseTimeMinutes(row.time);
    if (!Number.isFinite(minutes)) continue;
    earliest = Math.min(earliest, minutes);
    latest = Math.max(latest, minutes);
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return [];
  const start = Math.floor(earliest / 60);
  const end = Math.floor(latest / 60);
  const lanes: string[] = [];
  for (let hour = start; hour <= end; hour += 1) {
    lanes.push(`${String(hour).padStart(2, '0')}:00`);
  }
  return lanes;
}

/** Classes on this day whose clock falls in the hour that starts at `lane` (`HH:00`). */
export function classesInHour(
  classes: readonly WeeklyClassSlot[],
  day: Weekday,
  lane: string,
): WeeklyClassSlot[] {
  const start = parseTimeMinutes(lane);
  if (!Number.isFinite(start)) return [];
  const end = start + 60;
  return classesOnDay(classes, day).filter((row) => {
    const minutes = parseTimeMinutes(row.time);
    return minutes >= start && minutes < end;
  });
}

/** Classes that share one day and clock time (MAT 1 beside MAT 2). */
export function classesAt(
  classes: readonly WeeklyClassSlot[],
  day: Weekday,
  time: string,
): WeeklyClassSlot[] {
  return classesOnDay(classes, day).filter((row) => row.time === time);
}

/** Group a day's classes under shared clock times (5:00 PM → MAT 1 / MAT 2). */
export function groupClassesByTime(classes: readonly WeeklyClassSlot[]): ClassTimeGroup[] {
  const groups: ClassTimeGroup[] = [];
  for (const item of sortClasses(classes)) {
    const last = groups[groups.length - 1];
    if (last && last.time === item.time && last.items[0]?.day === item.day) {
      last.items.push(item);
    } else {
      groups.push({ time: item.time, items: [item] });
    }
  }
  return groups;
}

/** Gym-TV / monthly recap: "5:00 PM MAT 1 Kids BJJ / MAT 2 Advanced Kids". */
export function formatTimeGroupLine(group: ClassTimeGroup): string {
  const when = formatClassTime(group.time);
  const classes = group.items
    .map((item) => {
      const mat = item.location.trim();
      const title = item.title.trim() || 'Class';
      const detail = item.subtitle.trim();
      const name = detail ? `${title} (${detail})` : title;
      return mat ? `${mat} ${name}` : name;
    })
    .join(' / ');
  return `${when} ${classes}`.trim();
}

/** "SEPTEMBER 2026" for the board header stamp. */
export function formatBoardStamp(now = new Date()): string {
  const month = now.toLocaleString('en-US', { month: 'long' }).toUpperCase();
  return `${month} ${now.getFullYear()}`;
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
    const line = specialEventLine(item);
    if (line) lines.push(line);
  }
  return lines;
}

/** Dated specials in the calendar month `now` is in, plus undated ongoing notices. */
export function specialsThisMonth(specials: readonly SpecialDate[], now = new Date()): SpecialDate[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  return sortSpecials(
    specials.filter((item) => {
      const iso = normalizeIsoDate(item.date);
      if (!iso) return true;
      const [y, m, d] = iso.split('-').map(Number);
      const when = new Date(y, (m ?? 1) - 1, d ?? 1);
      return when.getFullYear() === year && when.getMonth() === month;
    }),
  );
}

/** One readable strip line. Empty when the special has no title or body. */
export function specialEventLine(item: SpecialDate): string {
  const label = item.title.trim() || item.body.trim();
  if (!label) return '';
  const when = formatSpecialDate(item.date);
  return when ? `${when} · ${label}` : label;
}

/**
 * Specials the bottom strip can show.
 * This month, plus a this-week date that spills into the neighboring month,
 * plus undated notices. Nothing already on the strip is dropped.
 */
export function specialsOnStrip(specials: readonly SpecialDate[], now = new Date()): SpecialDate[] {
  const seen = new Set<string>();
  const rows: SpecialDate[] = [];
  for (const item of [...specialsThisMonth(specials, now), ...specialsThisWeek(specials, now)]) {
    if (seen.has(item.id) || !specialEventLine(item)) continue;
    seen.add(item.id);
    rows.push(item);
  }
  return sortSpecials(rows);
}

export type SpecialEventSlide = {
  id: string;
  text: string;
  kind: 'note' | 'event';
};

/** Notes stay first so a free-text notice is not dropped when events rotate. */
export function specialEventSlides(
  notes: string,
  specials: readonly SpecialDate[],
  now = new Date(),
): SpecialEventSlide[] {
  const slides: SpecialEventSlide[] = [];
  const note = notes.trim();
  if (note) slides.push({ id: 'strip-note', text: note, kind: 'note' });
  for (const item of specialsOnStrip(specials, now)) {
    const text = specialEventLine(item);
    if (!text) continue;
    slides.push({ id: item.id, text, kind: 'event' });
  }
  return slides;
}

export function specialEventCount(slides: readonly SpecialEventSlide[]): number {
  return slides.reduce((count, slide) => count + (slide.kind === 'event' ? 1 : 0), 0);
}

/** Cross-fade dwell for the special-events strip. One event never starts this timer. */
export const SPECIAL_EVENT_DWELL_MS = 3000;

export function defaultGymCalendar(): GymCalendarState {
  return {
    version: 1,
    title: '',
    qrUrl: '',
    notes: '',
    template: DEFAULT_SCHEDULE_TEMPLATE,
    castEnabled: true,
    classes: [],
    specials: [],
  };
}

export const SAMPLE_WEEK_TITLE = 'Sample Academy';
export const SAMPLE_WEEK_QR = 'https://example.com/class-schedule';
export const SAMPLE_WEEK_NOTES =
  'Sample week — not your gym. Export a CSV backup before you reset this device.';

/** Sample week of a typical class mix. Not a real gym’s schedule. Sunday is empty on purpose. */
export const SAMPLE_WEEK_SLOTS: ReadonlyArray<Omit<WeeklyClassSlot, 'id' | 'kind'>> = [
  { day: 'mon', time: '06:00', title: 'Morning Gi', location: 'MAT 1', subtitle: '', level: 'none' },
  { day: 'mon', time: '12:00', title: 'Advanced', location: 'MAT 2', subtitle: '', level: 'advanced' },
  { day: 'mon', time: '17:00', title: 'Kids 3-5', location: 'MAT 1', subtitle: '3-5 Years Old', level: 'kids' },
  { day: 'mon', time: '17:00', title: 'Blue Belt and Up', location: 'MAT 2', subtitle: '', level: 'advanced' },
  { day: 'mon', time: '18:00', title: 'Youth Class', location: 'MAT 1', subtitle: '5-10 Years Old', level: 'kids' },
  { day: 'mon', time: '18:00', title: 'Fundamentals', location: 'MAT 2', subtitle: 'All Levels', level: 'fundamentals' },
  { day: 'tue', time: '06:00', title: 'Morning Gi', location: 'MAT 1', subtitle: '', level: 'none' },
  { day: 'tue', time: '17:00', title: 'Beginner', location: 'MAT 1', subtitle: '', level: 'fundamentals' },
  { day: 'tue', time: '17:00', title: 'Fundamentals', location: 'MAT 2', subtitle: 'All Levels', level: 'fundamentals' },
  { day: 'tue', time: '18:00', title: 'Youth Class', location: 'MAT 1', subtitle: '5-10 Years Old', level: 'kids' },
  { day: 'tue', time: '18:00', title: 'Advanced Kids', location: 'MAT 2', subtitle: 'Grey & White+', level: 'kids-advanced' },
  { day: 'wed', time: '10:00', title: 'Homeschool Gi', location: 'MAT 1', subtitle: '', level: 'none' },
  { day: 'wed', time: '12:00', title: 'Advanced', location: 'MAT 2', subtitle: '', level: 'advanced' },
  { day: 'wed', time: '17:00', title: 'Kids 3-5', location: 'MAT 1', subtitle: '3-5 Years Old', level: 'kids' },
  { day: 'wed', time: '18:00', title: 'Youth Class', location: 'MAT 1', subtitle: '5-10 Years Old', level: 'kids' },
  { day: 'wed', time: '18:00', title: 'No-Gi', location: 'MAT 2', subtitle: 'All Levels', level: 'none' },
  { day: 'thu', time: '06:00', title: 'Morning Gi', location: 'MAT 1', subtitle: '', level: 'none' },
  { day: 'thu', time: '17:00', title: 'Fundamentals', location: 'MAT 1', subtitle: 'All Levels', level: 'fundamentals' },
  { day: 'thu', time: '17:00', title: 'Blue Belt and Up', location: 'MAT 2', subtitle: '', level: 'advanced' },
  { day: 'thu', time: '18:00', title: 'Competition Class', location: 'MAT 1', subtitle: '', level: 'none' },
  { day: 'thu', time: '19:00', title: 'Open Rolling', location: 'MAT 1', subtitle: 'All Levels', level: 'none' },
  { day: 'fri', time: '12:00', title: 'Advanced', location: 'MAT 2', subtitle: '', level: 'advanced' },
  { day: 'fri', time: '17:00', title: 'Kids BJJ', location: 'MAT 1', subtitle: '', level: 'kids' },
  { day: 'fri', time: '18:00', title: 'Youth Class', location: 'MAT 1', subtitle: '5-10 Years Old', level: 'kids' },
  { day: 'fri', time: '18:00', title: 'Fundamentals', location: 'MAT 2', subtitle: 'All Levels', level: 'fundamentals' },
  { day: 'sat', time: '10:00', title: 'Kids BJJ', location: 'MAT 1', subtitle: '', level: 'kids' },
  { day: 'sat', time: '11:00', title: 'Open Mat', location: 'MAT 1', subtitle: 'All Levels', level: 'none' },
];

export function sampleWeekClasses(): WeeklyClassSlot[] {
  return SAMPLE_WEEK_SLOTS.map((slot) => ({
    ...slot,
    id: createClassId(),
    kind: 'class',
  }));
}

export function sampleWeekSpecials(): SpecialDate[] {
  return [
    {
      id: createSpecialId(),
      kind: 'special',
      date: '',
      title: 'Seminar — ask at the desk',
      body: '',
      flyerId: null,
    },
  ];
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
  const location = typeof row.location === 'string' ? row.location.trim() : '';
  const subtitle = typeof row.subtitle === 'string' ? row.subtitle.trim() : '';
  const level = coerceClassLevel(row.level) ?? 'none';
  return { id, kind: 'class', day: row.day, time, title, location, subtitle, level };
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
    template: coerceScheduleTemplate(parsed.template),
    castEnabled: parsed.castEnabled === false ? false : true,
    classes: sortClasses(classes),
    specials: sortSpecials(specials),
  };
}

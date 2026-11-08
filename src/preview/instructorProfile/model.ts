/**
 * Isolated instructor-profile concept. Memory only.
 * Counts and the sample week are computed here. Nothing writes the student
 * file, the academy log, or a lesson plan.
 *
 * Class length uses the student mat-time wheel (`matQuarterOptions`): 0, then
 * every 15 minutes. That is not the lesson-plan Expected Duration wheel
 * (30-second steps) and not the round-timer second wheel.
 */
import { defaultTechniquePolicy } from '../../lib/studentBenchmarks';
import { clockMatTime, matQuarterOptions } from '../../lib/matHours';
import { defaultProfileMarks } from '../../lib/profileMarks';

export const PREVIEW_PATH = '/preview/instructor-profile';
export const SHEET_TITLE = 'Instructor Profile and Stat Sheet';
export const PREVIEW_BANNER =
  'Fictional preview. Nothing on this page is saved, sent, approved, or applied to a student.';

/** Preview clock. The sample "roughly 13 years" is 2026 − 2013. */
export const PREVIEW_YEAR = 2026;
export const TEACHING_AROUND_YEAR = 2013;
export const OFFICIAL_START_YEAR = 2023;
export const EXAMPLE_CLASS_MINUTES = 60;
export const DEFAULT_CLASSES_PER_WEEK = 3;
export const DEFAULT_ACTIVE_WEEKS = 52;
export const SAMPLE_WEEK_START = '2026-11-02';

export const PREVIEW_STORAGE_KEYS = [
  'matboard.studentEdition.v1',
  'matboard.gymEvents.v1',
  'matboard.gymProfile.v1',
  'matboard.coach.trainingNotes.v1',
  'matboard.studentEdition.parentGate.v1',
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type UpdateStatus = 'pending' | 'applied' | 'declined';
export type UpdateKind = 'stripe' | 'belt';
export type UpdateResolution =
  | 'waiting-student'
  | 'waiting-parent'
  | 'parent-declined'
  | 'student-dismissed'
  | 'student-accepted';

export type FictionUpdate = {
  id: string;
  studentId: string;
  studentName: string;
  kind: UpdateKind;
  /** Belt after a promotion, or the belt that received stripes. */
  belt: string;
  stripeFrom: number;
  stripeTo: number;
  date: string;
  status: UpdateStatus;
  /** This student's device gate in the fiction. Off means no parent step. */
  parentGateOn: boolean;
  resolution: UpdateResolution;
  attempt: number;
};

export type TeachingClass = {
  id: string;
  date: string;
  name: string;
  minutes: number;
  source: 'journal' | 'lesson-plan';
  planId?: string;
};

export type EstimateInput = {
  teachingAroundYear: number;
  classesPerWeek: number;
  activeWeeksPerYear: number;
  /** Example assumption. 60 is 1 hour. Not a measured class. */
  minutesPerClass: number;
};

export type LessonPlanSample = {
  planId: string;
  date: string;
  name: string;
  designation: string;
};

export function teachingDurationOptions() {
  return matQuarterOptions();
}

export function snapQuarterMinutes(value: number): number {
  const options = teachingDurationOptions();
  if (!Number.isFinite(value)) return 0;
  let nearest = options[0]?.value ?? 0;
  for (const option of options) {
    if (Math.abs(option.value - value) < Math.abs(nearest - value)) nearest = option.value;
  }
  return nearest;
}

export function durationLabel(minutes: number): string {
  const snapped = snapQuarterMinutes(minutes);
  return teachingDurationOptions().find((option) => option.value === snapped)?.label ?? clockMatTime(snapped);
}

/** Same student, same kind, same belt target, same stripe target, same date. */
export function promotionKey(row: Pick<FictionUpdate, 'studentId' | 'kind' | 'belt' | 'stripeTo' | 'date'>): string {
  return [row.studentId, row.kind, row.belt, String(row.stripeTo), row.date].join('|');
}

/**
 * Completed teaching only. Pending and declined add nothing.
 * Two applied attempts with the same key count once. The later attempt wins,
 * so a retry does not add the stripe or the belt a second time.
 * A belt change is one promotion. Stripes on the new belt are not also stripes given.
 */
export function teachingTallies(rows: readonly FictionUpdate[]): { stripes: number; belts: number } {
  const winners = new Map<string, FictionUpdate>();
  for (const row of rows) {
    if (row.status !== 'applied') continue;
    const key = promotionKey(row);
    const prior = winners.get(key);
    if (!prior || row.attempt > prior.attempt) winners.set(key, row);
  }
  let stripes = 0;
  let belts = 0;
  for (const row of winners.values()) {
    if (row.kind === 'belt') belts += 1;
    else stripes += Math.max(0, row.stripeTo - row.stripeFrom);
  }
  return { stripes, belts };
}

export function statusLabel(row: FictionUpdate): string {
  if (row.status === 'pending' && row.resolution === 'waiting-parent') return 'Pending · parent, then student';
  if (row.status === 'pending') return 'Pending · student accept';
  if (row.status === 'declined' && row.resolution === 'parent-declined') return 'Declined · parent';
  if (row.status === 'declined') return 'Declined · student dismissed';
  if (row.parentGateOn) return 'Approved and applied';
  return 'Applied · no parent step';
}

export function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Years from teaching-around to the preview clock. Official start is not an input. */
export function teachingYears(teachingAroundYear: number, previewYear = PREVIEW_YEAR): number {
  const around = clampInt(teachingAroundYear, 1950, previewYear, TEACHING_AROUND_YEAR);
  return previewYear - around;
}

export function estimatedClasses(input: EstimateInput, previewYear = PREVIEW_YEAR): number {
  const years = teachingYears(input.teachingAroundYear, previewYear);
  const weeks = clampInt(input.activeWeeksPerYear, 1, 52, DEFAULT_ACTIVE_WEEKS);
  const perWeek = clampInt(input.classesPerWeek, 1, 14, DEFAULT_CLASSES_PER_WEEK);
  return years * weeks * perWeek;
}

/** Hours only. A 60-minute assumption makes hours equal classes. */
export function estimatedHours(classes: number, minutesPerClass: number): number {
  return classes * (snapQuarterMinutes(minutesPerClass) / 60);
}

export function weekStartMonday(iso: string): string {
  if (!DATE_RE.test(iso)) return SAMPLE_WEEK_START;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const delta = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - delta);
  return date.toISOString().slice(0, 10);
}

export function weekDays(monday: string): string[] {
  const start = weekStartMonday(monday);
  const [year, month, day] = start.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(date);
    next.setUTCDate(date.getUTCDate() + index);
    return next.toISOString().slice(0, 10);
  });
}

export function dayLabel(iso: string): string {
  if (!DATE_RE.test(iso)) return iso;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${WEEKDAYS[date.getUTCDay()]} ${day}`;
}

export function loggedMinutes(classes: readonly TeachingClass[]): number {
  return classes.reduce((sum, row) => sum + (row.minutes > 0 ? row.minutes : 0), 0);
}

export function weekMinutes(classes: readonly TeachingClass[], monday: string): number {
  const days = new Set(weekDays(monday));
  return loggedMinutes(classes.filter((row) => days.has(row.date)));
}

export function planLog(classes: readonly TeachingClass[], planId: string, date: string): TeachingClass | null {
  return classes.find((row) => row.planId === planId && row.date === date) ?? null;
}

/**
 * One row per plan and date. The first positive length adds it.
 * The same length again does not add a second class.
 * A new length replaces the minutes. Untimed removes the row.
 */
export function logLessonHours(
  classes: readonly TeachingClass[],
  input: { planId: string; date: string; name: string; minutes: number },
): { classes: TeachingClass[]; outcome: 'added' | 'replaced' | 'unchanged' | 'removed' } {
  const minutes = snapQuarterMinutes(input.minutes);
  const index = classes.findIndex((row) => row.planId === input.planId && row.date === input.date);
  if (minutes <= 0) {
    if (index < 0) return { classes: [...classes], outcome: 'unchanged' };
    return { classes: classes.filter((_, slot) => slot !== index), outcome: 'removed' };
  }
  if (index < 0) {
    return {
      classes: [
        ...classes,
        {
          id: `plan-${input.planId}`,
          date: input.date,
          name: input.name,
          minutes,
          source: 'lesson-plan',
          planId: input.planId,
        },
      ],
      outcome: 'added',
    };
  }
  const current = classes[index];
  if (current.minutes === minutes) return { classes: [...classes], outcome: 'unchanged' };
  const next = classes.map((row, slot) => (slot === index ? { ...row, minutes, name: input.name } : row));
  return { classes: next, outcome: 'replaced' };
}

export function setClassMinutes(classes: readonly TeachingClass[], id: string, minutes: number): TeachingClass[] {
  const snapped = snapQuarterMinutes(minutes);
  if (snapped <= 0) return classes.filter((row) => row.id !== id);
  return classes.map((row) => (row.id === id ? { ...row, minutes: snapped } : row));
}

export function sampleUpdates(): FictionUpdate[] {
  return [
    {
      id: 'sam-stripe-2',
      studentId: 'stu-sam',
      studentName: 'Sam Okonkwo (fictional)',
      kind: 'stripe',
      belt: 'Blue',
      stripeFrom: 1,
      stripeTo: 2,
      date: '2026-08-14',
      status: 'applied',
      parentGateOn: false,
      resolution: 'student-accepted',
      attempt: 1,
    },
    {
      id: 'noah-stripe-1-declined',
      studentId: 'stu-noah',
      studentName: 'Noah Patel (fictional)',
      kind: 'stripe',
      belt: 'Blue',
      stripeFrom: 0,
      stripeTo: 1,
      date: '2026-06-01',
      status: 'declined',
      parentGateOn: true,
      resolution: 'parent-declined',
      attempt: 1,
    },
    {
      id: 'noah-stripe-1-applied',
      studentId: 'stu-noah',
      studentName: 'Noah Patel (fictional)',
      kind: 'stripe',
      belt: 'Blue',
      stripeFrom: 0,
      stripeTo: 1,
      date: '2026-06-01',
      status: 'applied',
      parentGateOn: true,
      resolution: 'student-accepted',
      attempt: 2,
    },
    {
      id: 'sam-stripe-3-pending',
      studentId: 'stu-sam',
      studentName: 'Sam Okonkwo (fictional)',
      kind: 'stripe',
      belt: 'Blue',
      stripeFrom: 2,
      stripeTo: 3,
      date: '2026-10-02',
      status: 'pending',
      parentGateOn: false,
      resolution: 'waiting-student',
      attempt: 1,
    },
    {
      id: 'riley-purple',
      studentId: 'stu-riley',
      studentName: 'Riley Chen (fictional)',
      kind: 'belt',
      belt: 'Purple',
      stripeFrom: 4,
      stripeTo: 0,
      date: '2026-05-20',
      status: 'applied',
      parentGateOn: false,
      resolution: 'student-accepted',
      attempt: 1,
    },
    {
      id: 'avery-purple-dismissed',
      studentId: 'stu-avery',
      studentName: 'Avery Brooks (fictional)',
      kind: 'belt',
      belt: 'Purple',
      stripeFrom: 4,
      stripeTo: 0,
      date: '2026-09-01',
      status: 'declined',
      parentGateOn: false,
      resolution: 'student-dismissed',
      attempt: 1,
    },
    {
      id: 'noah-stripe-2-pending',
      studentId: 'stu-noah',
      studentName: 'Noah Patel (fictional)',
      kind: 'stripe',
      belt: 'Blue',
      stripeFrom: 1,
      stripeTo: 2,
      date: '2026-10-18',
      status: 'pending',
      parentGateOn: true,
      resolution: 'waiting-parent',
      attempt: 1,
    },
  ];
}

export function sampleClasses(): TeachingClass[] {
  return [
    { id: 'class-mon', date: '2026-11-02', name: 'Fundamentals gi', minutes: 60, source: 'journal' },
    { id: 'class-wed', date: '2026-11-04', name: 'No-gi', minutes: 75, source: 'journal' },
    { id: 'class-fri', date: '2026-11-06', name: 'Kids class', minutes: 60, source: 'journal' },
  ];
}

export function samplePlan(): LessonPlanSample {
  return {
    planId: 'plan-sun-gi',
    date: '2026-11-08',
    name: 'Sunday gi (fictional)',
    designation: 'Adult gi',
  };
}

export function sampleEstimate(): EstimateInput {
  return {
    teachingAroundYear: TEACHING_AROUND_YEAR,
    classesPerWeek: DEFAULT_CLASSES_PER_WEEK,
    activeWeeksPerYear: DEFAULT_ACTIVE_WEEKS,
    minutesPerClass: EXAMPLE_CLASS_MINUTES,
  };
}

export const INSTRUCTOR = {
  name: 'Mara Ellison (fictional)',
  gym: 'Northshore Jiu-Jitsu (fictional)',
  startedOn: '2014-03-01',
  birthYear: 1992,
  ageBand: 'Adult',
  belt: 'Brown',
  stripes: 2,
  beltAwardedOn: '2023-02-18',
  stripeDates: ['2024-06-01', '2025-09-04'],
  trains: 'Gi and No-Gi',
  competitor: 'Off',
  noPhotos: 'Off',
  teachingAroundYear: TEACHING_AROUND_YEAR,
  officialStartYear: OFFICIAL_START_YEAR,
  seatNote: 'Sample path: an instructor seat issued by the academy owner. A purchased Instructor Edition would open the same sheet. This preview checks neither.',
  history: [
    { belt: 'White', detail: '2014-03-01' },
    { belt: 'Blue', detail: '2016-11-12' },
    { belt: 'Purple', detail: '2019-06-08' },
    { belt: 'Brown', detail: '2023-02-18 · 2 stripes' },
  ],
  lineage: ['Professor Lena Cho (fictional)', 'Coach Andre Voss (fictional)', 'Professor Ivo Marin (fictional)'],
} as const;

export function profilePolicyLines(): { label: string; on: boolean; note: string }[] {
  const policy = defaultTechniquePolicy('brown', PREVIEW_YEAR - INSTRUCTOR.birthYear, 'adult');
  const marks = defaultProfileMarks().adult;
  return [
    { label: 'Straight ankle lock', on: policy.straightAnkleLock, note: 'Adult default at 16 and older, when no override is stored.' },
    { label: 'Wrist lock', on: policy.wristLocks, note: 'Adult default from blue belt, when no override is stored.' },
    { label: 'Leg locks', on: policy.legLocks, note: 'Off until turned on. Never on a gi list.' },
    { label: 'Heel hooks', on: policy.heelHooks, note: 'Off until turned on. No-gi only, and a brown or black choice in the live list.' },
    { label: 'Competition prompt', on: policy.competition, note: 'Off until added. It does not count toward a stripe or a promotion.' },
    { label: 'Photo on reports and backups', on: marks.selfie, note: 'Off for an adult until it is turned on.' },
    { label: 'Gym logo on reports and backups', on: marks.logo, note: 'On unless it is turned off. The gym name stays either way.' },
  ];
}

/** Names a later printable sheet can share. This preview does not make the PDF. */
export const DOCUMENT_FIELDS = [
  { name: 'title', value: SHEET_TITLE },
  { name: 'coachingHours.loggedMinutes', value: 'Sum of teaching-journal minutes. Untimed rows add 0.' },
  { name: 'coachingHours.estimatedClasses', value: 'teachingYears × activeWeeksPerYear × classesPerWeek.' },
  { name: 'coachingHours.estimatedHours', value: 'estimatedClasses × example minutes / 60. Equals classes only at 60 minutes.' },
  { name: 'coachingHours.teachingAroundYear', value: 'About when teaching started. Sample 2013. Not the official start.' },
  { name: 'coachingHours.officialStartYear', value: 'Official start. Sample 2023. Kept, and left out of the estimate.' },
  { name: 'coachingHours.activeWeeksPerYear', value: 'Default 52. A year-length approximation, editable.' },
  { name: 'coachingHours.minutesPerClass', value: 'Example assumption on the 15-minute wheel. Default 60. Not a measured class.' },
  { name: 'stripesGiven', value: 'Applied stripe updates only, one count per promotion key.' },
  { name: 'promotionsGiven', value: 'Applied belt updates only, one count per promotion key.' },
  { name: 'promotionUpdates.status', value: 'pending, applied, or declined.' },
  { name: 'promotionUpdates.parentGateOn', value: 'Per student device. Off means that row has no parent step.' },
] as const;

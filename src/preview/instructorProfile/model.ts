/**
 * Isolated instructor-profile concept. Memory only.
 * Counts and the sample week are computed here. Nothing writes the student
 * file, the academy log, or a lesson plan.
 *
 * Class length uses the student mat-time wheel (`matQuarterOptions`): 0, then
 * every 15 minutes. That is not the lesson-plan Expected Duration wheel
 * (15-second steps, labeled m:ss) and not the round-timer duration wheel.
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
/** Eleven earlier sample weeks, 3 classes at 1 hour, already in the logged block. */
export const PRIOR_LOGGED_CLASSES = 33;
export const PRIOR_LOGGED_MINUTES = PRIOR_LOGGED_CLASSES * EXAMPLE_CLASS_MINUTES;
export const INSTRUCTOR_BACKUP_KIND = 'instructor-teaching-backup';
export const STUDENT_JOURNAL_BACKUP_KIND = 'student-journal-backup';

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
  /** False when the row is only in the fictional total, not the sample table. */
  listed?: boolean;
  /** Short change line for the sample table. */
  change?: string;
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
  if (row.status === 'pending' && row.resolution === 'waiting-parent') return 'Pending · awaiting parent';
  if (row.status === 'pending') return 'Pending · student accept';
  if (row.status === 'declined' && row.resolution === 'parent-declined') return 'Declined · parent';
  if (row.status === 'declined') return 'Declined · student dismissed';
  if (row.parentGateOn) return 'Completed · parent approved';
  return 'Completed · parent not required';
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

/** Logged block: earlier sample weeks plus the visible week. The estimate is not included. */
export function loggedMinutesTotal(classes: readonly TeachingClass[]): number {
  return PRIOR_LOGGED_MINUTES + loggedMinutes(classes);
}

export function loggedClassCount(classes: readonly TeachingClass[]): number {
  return PRIOR_LOGGED_CLASSES + classes.filter((row) => row.minutes > 0).length;
}

/** Example sum of two separate periods. Not a third stored bank. */
export function combinedHours(estimateHours: number, loggedTotalMinutes: number): number {
  return estimateHours + loggedTotalMinutes / 60;
}

export function formatHourCount(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const [whole, frac] = abs.toString().split('.');
  const text = `${Number(whole).toLocaleString('en-US')}${frac ? `.${frac}` : ''}`;
  return negative ? `-${text}` : text;
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

function hiddenCompleted(kind: UpdateKind, count: number): FictionUpdate[] {
  return Array.from({ length: count }, (_, index) => {
    const day = String((index % 27) + 1).padStart(2, '0');
    const month = String((index % 12) + 1).padStart(2, '0');
    return {
      id: `done-${kind}-${index}`,
      studentId: `stu-done-${kind}-${index}`,
      studentName: 'Other completed (fictional)',
      kind,
      belt: 'Blue',
      stripeFrom: 0,
      stripeTo: kind === 'stripe' ? 1 : 0,
      date: `2025-${month}-${day}`,
      status: 'applied' as const,
      parentGateOn: false,
      resolution: 'student-accepted' as const,
      attempt: index === 0 ? 2 : 1,
      listed: false,
    };
  });
}

export function sampleUpdates(): FictionUpdate[] {
  const listed: FictionUpdate[] = [
    {
      id: 'student-a',
      studentId: 'stu-a',
      studentName: 'Student A (fictional minor)',
      kind: 'stripe',
      belt: 'Grey-white',
      stripeFrom: 1,
      stripeTo: 2,
      date: '2026-10-01',
      status: 'applied',
      parentGateOn: true,
      resolution: 'student-accepted',
      attempt: 1,
      listed: true,
      change: 'Grey-white · 1 to 2 stripes',
    },
    {
      id: 'student-b',
      studentId: 'stu-b',
      studentName: 'Student B (fictional adult)',
      kind: 'belt',
      belt: 'Blue',
      stripeFrom: 0,
      stripeTo: 0,
      date: '2026-09-02',
      status: 'applied',
      parentGateOn: false,
      resolution: 'student-accepted',
      attempt: 1,
      listed: true,
      change: 'White to Blue',
    },
    {
      id: 'student-c',
      studentId: 'stu-c',
      studentName: 'Student C (fictional minor)',
      kind: 'belt',
      belt: 'Yellow',
      stripeFrom: 0,
      stripeTo: 0,
      date: '2026-09-20',
      status: 'pending',
      parentGateOn: true,
      resolution: 'waiting-parent',
      attempt: 1,
      listed: true,
      change: 'Grey to Yellow',
    },
    {
      id: 'student-d',
      studentId: 'stu-d',
      studentName: 'Student D (fictional minor)',
      kind: 'stripe',
      belt: 'Yellow',
      stripeFrom: 0,
      stripeTo: 1,
      date: '2026-08-04',
      status: 'declined',
      parentGateOn: true,
      resolution: 'parent-declined',
      attempt: 1,
      listed: true,
      change: 'Yellow · 0 to 1 stripe',
    },
    {
      id: 'student-e',
      studentId: 'stu-e',
      studentName: 'Student E (fictional adult)',
      kind: 'stripe',
      belt: 'Blue',
      stripeFrom: 1,
      stripeTo: 2,
      date: '2026-08-18',
      status: 'applied',
      parentGateOn: false,
      resolution: 'student-accepted',
      attempt: 1,
      listed: true,
      change: 'Blue · 1 to 2 stripes',
    },
  ];
  const hiddenStripes = hiddenCompleted('stripe', 22);
  const hiddenBelts = hiddenCompleted('belt', 6);
  const retry = hiddenStripes[0];
  const declinedRetry: FictionUpdate = {
    ...retry,
    id: `${retry.id}-declined`,
    status: 'declined',
    resolution: 'parent-declined',
    parentGateOn: true,
    attempt: 1,
    listed: false,
  };
  return [...listed, declinedRetry, ...hiddenStripes, ...hiddenBelts];
}

export function listedUpdates(rows: readonly FictionUpdate[] = sampleUpdates()): FictionUpdate[] {
  return rows.filter((row) => row.listed !== false);
}

export function sampleClasses(): TeachingClass[] {
  return [
    { id: 'class-mon', date: '2026-11-02', name: 'Adult fundamentals', minutes: 60, source: 'journal' },
    { id: 'class-wed', date: '2026-11-04', name: 'Kids class', minutes: 60, source: 'journal' },
    { id: 'class-sat', date: '2026-11-07', name: 'Advanced / open mat', minutes: 60, source: 'journal' },
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
  name: 'Example Instructor (fictional)',
  gym: 'Example Academy (fictional)',
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
  programs: 'Adult fundamentals · Kids · Open mat',
  teachingAroundYear: TEACHING_AROUND_YEAR,
  officialStartYear: OFFICIAL_START_YEAR,
  seatNote: 'Sample path: an instructor seat issued by the academy owner. A purchased Instructor Edition would open the same sheet. This preview checks neither.',
  history: [
    { belt: 'White', detail: '2014-03-01' },
    { belt: 'Blue', detail: '2016-11-12' },
    { belt: 'Purple', detail: '2019-06-08' },
    { belt: 'Brown', detail: '2023-02-18 · 2 stripes' },
  ],
  lineage: [
    'Mestre Aurelio Vance (fictional) · Black belt, 6th degree',
    'Prof. Dana Okafor (fictional) · Black belt, 3rd degree',
    'Coach Lena Mirov (fictional) · Head instructor, Example Academy',
    'Example Instructor (fictional) · Brown belt',
  ],
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

/** Names shared with the locked printable sheet. This preview does not make the PDF. */
export const DOCUMENT_FIELDS = [
  { name: 'title', value: SHEET_TITLE },
  { name: 'teachingSince', value: 'Started instructing. Sample c. 2013. Not the training start.' },
  { name: 'officialStartYear', value: 'Official start. Sample 2023. Shown beside teaching since, left out of the estimate.' },
  { name: 'studentProfile.startedOn', value: 'Training start on the student file. Sample 2014-03-01. Not overwritten by instruction data.' },
  { name: 'coachingHours.estimatedHours', value: 'Pre-app estimate. Ends when logging begins. 2,028 h only at 1 hour, 52 weeks, 3 classes, 13 years.' },
  { name: 'coachingHours.loggedHours', value: 'Hours logged after that. Sample 36 h over 12 weeks. Not added into the estimate.' },
  { name: 'coachingHours.combinedExample', value: 'Estimate plus logged, labeled example. Not a third stored bank.' },
  { name: 'stripesGiven', value: 'Completed stripe updates only, one count per promotion key. Sample 24.' },
  { name: 'promotionsGiven', value: 'Completed belt updates only, one count per promotion key. Sample 7.' },
  { name: 'promotionUpdates.status', value: 'pending, applied (shown as Completed), or declined.' },
  { name: 'promotionUpdates.parentGateOn', value: 'Per record. Off means that row has no parent step. Not a universal adult rule.' },
  { name: 'notes', value: 'Write-in. The locked sheet labels this Notes.' },
  { name: 'backup.kind', value: 'instructor-teaching-backup. JSON concept. The stat-sheet PDF is not this file.' },
] as const;

export type InstructionBackup = {
  advantage: typeof INSTRUCTOR_BACKUP_KIND;
  version: 1;
  fictional: true;
  studentId: 'example-instructor';
  teachingAroundYear: number;
  officialStartYear: number;
  estimate: EstimateInput;
  loggedMinutes: number;
  classes: TeachingClass[];
  stripesGiven: number;
  promotionsGiven: number;
  notes: string;
};

export type StudentIdentity = {
  name: string;
  gym: string;
  trainingStart: string;
  belt: string;
  stripes: number;
};

export function studentIdentity(): StudentIdentity {
  return {
    name: INSTRUCTOR.name,
    gym: INSTRUCTOR.gym,
    trainingStart: INSTRUCTOR.startedOn,
    belt: INSTRUCTOR.belt,
    stripes: INSTRUCTOR.stripes,
  };
}

/** In-memory shape only. Nothing is downloaded or written. */
export function instructionBackupPreview(input: {
  estimate: EstimateInput;
  classes: readonly TeachingClass[];
  notes: string;
  stripesGiven: number;
  promotionsGiven: number;
}): InstructionBackup {
  return {
    advantage: INSTRUCTOR_BACKUP_KIND,
    version: 1,
    fictional: true,
    studentId: 'example-instructor',
    teachingAroundYear: input.estimate.teachingAroundYear,
    officialStartYear: INSTRUCTOR.officialStartYear,
    estimate: { ...input.estimate },
    loggedMinutes: loggedMinutesTotal(input.classes),
    classes: input.classes.map((row) => ({ ...row })),
    stripesGiven: input.stripesGiven,
    promotionsGiven: input.promotionsGiven,
    notes: input.notes,
  };
}

export type RestorePreview = {
  ok: boolean;
  title: string;
  detail: string;
  kept: StudentIdentity;
};

/**
 * Says what a restore would do. It does not write.
 * A stat-sheet PDF and a student journal backup are refused.
 * An instruction file may describe teaching fields only. A different name in that file is ignored.
 */
export function previewInstructionRestore(raw: string, identity: StudentIdentity = studentIdentity()): RestorePreview {
  const kept = { ...identity };
  const text = raw.trim();
  if (!text) return { ok: false, title: 'No file', detail: 'Nothing to read.', kept };
  if (text.startsWith('%PDF') || /INSTRUCTOR PROFILE AND STAT SHEET/i.test(text)) {
    return {
      ok: false,
      title: 'Printable sheet',
      detail: 'This is a printable Instructor Profile and Stat Sheet. A PDF does not restore data.',
      kept,
    };
  }
  let record: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, title: 'Not a backup', detail: 'That text is not an instruction backup.', kept };
    }
    record = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, title: 'Not a backup', detail: 'That text is not an instruction backup.', kept };
  }
  if (record.advantage === STUDENT_JOURNAL_BACKUP_KIND || record.kind === 'student-progress-report') {
    return {
      ok: false,
      title: 'Student backup',
      detail: 'That is a Student Edition journal backup. It stays closed here, and the student record is not replaced.',
      kept,
    };
  }
  if (record.advantage !== INSTRUCTOR_BACKUP_KIND) {
    return { ok: false, title: 'Not an instruction backup', detail: 'This preview only describes an instruction backup. Nothing was written.', kept };
  }
  const otherName = typeof record.displayName === 'string' ? record.displayName.trim() : '';
  const ignored = otherName && otherName !== identity.name ? ` Ignored a different name in the file (${otherName}).` : '';
  return {
    ok: true,
    title: 'Instruction fields only',
    detail: `Would restore teaching since, the estimate, logged hours, the teaching journal, promotion totals, and notes.${ignored} Would keep ${identity.name}, training start ${identity.trainingStart}, and the ${identity.belt} belt. Nothing was written.`,
    kept,
  };
}

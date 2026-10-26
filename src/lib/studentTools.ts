/**
 * Calendar, belt checkpoints, goals, and coach sharing for Student Edition.
 * Everything here is the progress file in src/lib/progress. Advantage does not host it.
 * A criterion has a met mark and a note. When the student dates a mark, the note
 * starts with YYYY-MM-DD and an em dash. That is still the note field.
 */

import { classesOnDay, formatClassTime, normalizeGymCalendar, WEEKDAY_LABELS, weekdayFromJsDay } from './gymCalendar.ts';
import { competitionOf } from './progress/competition.ts';
import { addTournament, removeTournament, updateTournament } from './studentCompetition.ts';
import { applyTournamentEventDraft, tournamentMatchingName } from './sharedTournaments.ts';
import {
  exportProgressCsv,
  exportProgressPacket,
  fitRankPictures,
  importCoachSuggestion,
  mergeCoachPacket,
  mergeStudentProgress,
  parseProgressPacket,
  progressHandoffFileName,
  sharedCheckpointId,
  sharedCriterionId,
} from './progress/format.ts';
import {
  PROGRESS_CALENDAR_MAX,
  PROGRESS_CHECKPOINTS_MAX,
  PROGRESS_GOALS_MAX,
  PROGRESS_ID_MAX,
  PROGRESS_NAME_MAX,
  PROGRESS_NOTE_MAX,
  CALENDAR_REPEATS,
  type CalendarEvent,
  type CalendarKind,
  type CalendarRepeat,
  type CoachFeedbackPacket,
  type CoachPlanFocus,
  type CoachPlanPacket,
  type CoachSuggestion,
  type ProgressBelt,
  type RubricCheckpoint,
  type RubricCriterion,
  type RubricLevel,
  type StudentGoal,
  type StudentProgressReport,
} from './progress/types.ts';
import { FUNDAMENTAL_LIVE_LEVEL, fundamentalLevelOf } from './fundamentals.ts';
import { todayIso } from './studentEdition.ts';
import { setRankBelt } from './studentRank.ts';
import { loadRankPictures, picturesFromStore } from './rankPhotos.ts';

export const COACH_PLAN_STORAGE_KEY = 'matboard.studentEdition.coachPlan.v1';
export const COACH_FEEDBACK_STORAGE_KEY = 'matboard.studentEdition.coachFeedback.v1';
export const GYM_SCHEDULE_STORAGE_KEY = 'matboard.schedule.v1';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MARK_NOTE = /^(\d{4}-\d{2}-\d{2})(?: — ([\s\S]*))?$/;

const ADULT_BELTS = ['white', 'blue', 'purple', 'brown', 'black'] as const;
const KIDS_BELTS = ['grey', 'yellow', 'orange', 'green'] as const;

export const BELT_LABELS: Record<ProgressBelt, string> = {
  white: 'White',
  blue: 'Blue',
  purple: 'Purple',
  brown: 'Brown',
  black: 'Black',
  grey: 'Grey',
  yellow: 'Yellow',
  orange: 'Orange',
  green: 'Green',
  coral: 'Coral',
  redWhite: 'Red and white',
  red: 'Red',
};

/** The four events a student adds. Kinds are the progress-file calendar kinds. */
export const CALENDAR_KIND_CHOICES: { kind: CalendarKind; label: string }[] = [
  { kind: 'class', label: 'Class' },
  { kind: 'training', label: 'Open mat' },
  { kind: 'other', label: 'Tournament' },
  { kind: 'promotion', label: 'Promotion test' },
];

/** Repeat choices on the add-event form. `none` is not written onto the event. */
export const CALENDAR_REPEAT_CHOICES: { repeat: CalendarRepeat; label: string }[] = [
  { repeat: 'none', label: 'None' },
  { repeat: 'weekly', label: 'Weekly' },
  { repeat: 'biweekly', label: 'Every 2 weeks' },
  { repeat: 'monthly', label: 'Monthly' },
];

const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type CoachShelf = {
  plan: CoachPlanPacket | null;
  feedback: CoachFeedbackPacket | null;
};

export type MonthCell = {
  iso: string;
  inMonth: boolean;
  day: number;
};

export type GymHint = {
  id: string;
  label: string;
};

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function calendarKindLabel(kind: CalendarKind): string {
  return CALENDAR_KIND_CHOICES.find((choice) => choice.kind === kind)?.label ?? (kind === 'note' ? 'Note' : 'Other');
}

/** Adult belts, white through black, plus coral and red only once the student wears one. Kids stay on their own line. */
export function beltTrack(belt: ProgressBelt): readonly ProgressBelt[] {
  if ((KIDS_BELTS as readonly string[]).includes(belt)) return KIDS_BELTS;
  if (belt === 'coral') return [...ADULT_BELTS, 'coral'];
  if (belt === 'redWhite') return [...ADULT_BELTS, 'coral', 'redWhite'];
  if (belt === 'red') return [...ADULT_BELTS, 'coral', 'redWhite', 'red'];
  return ADULT_BELTS;
}

/**
 * Kids belts and stripes do not use the adult checkpoint path.
 * The rubric stays on the file. Switching back to adult shows it again.
 */
export function showsAdultCheckpoints(report: StudentProgressReport): boolean {
  return report.beltBook?.mode !== 'kids';
}

/** Next colored belt. Black has degrees, not a jump to coral. */
export function nextBelt(belt: ProgressBelt): ProgressBelt | null {
  const line: readonly ProgressBelt[] = (KIDS_BELTS as readonly string[]).includes(belt) ? KIDS_BELTS : ADULT_BELTS;
  const index = line.indexOf(belt);
  if (index < 0 || index >= line.length - 1) return null;
  return line[index + 1] ?? null;
}

export function splitMarkNote(note: string): { date: string; text: string } {
  const match = MARK_NOTE.exec(note);
  if (!match || !isIsoDate(match[1])) return { date: '', text: note };
  return { date: match[1], text: match[2] ?? '' };
}

export function joinMarkNote(date: string, text: string): string {
  const body = text.trim();
  const dated = isIsoDate(date) ? date : '';
  if (dated && body) return `${dated} — ${body}`.slice(0, PROGRESS_NOTE_MAX);
  if (dated) return dated;
  return body.slice(0, PROGRESS_NOTE_MAX);
}

function newId(prefix: string, now: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${now.toString(36)}.${rand}`.slice(0, PROGRESS_ID_MAX);
}

function touch(report: StudentProgressReport, now: number): StudentProgressReport {
  return { ...report, updatedAt: now };
}

export function journalDates(report: StudentProgressReport): string[] {
  return [...new Set(report.journal.map((entry) => entry.date))].sort();
}

export function entriesOnDate(report: StudentProgressReport, date: string) {
  return report.journal
    .filter((entry) => entry.date === date)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function calendarRepeatOf(event: CalendarEvent): CalendarRepeat {
  return event.repeat && (CALENDAR_REPEATS as readonly string[]).includes(event.repeat) ? event.repeat : 'none';
}

export function calendarRepeatLabel(repeat: CalendarRepeat): string {
  return CALENDAR_REPEAT_CHOICES.find((choice) => choice.repeat === repeat)?.label ?? 'None';
}

function utcDay(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function daysAfter(start: string, date: string): number {
  return Math.round((utcDay(date) - utcDay(start)) / 86400000);
}

/** True when `date` is the event day or a later repeat of it. Dates before the start are not. */
export function eventOccursOn(event: CalendarEvent, date: string): boolean {
  if (!isIsoDate(date) || !isIsoDate(event.date)) return false;
  if (date < event.date) return false;
  const repeat = calendarRepeatOf(event);
  if (repeat === 'none' || event.date === date) return event.date === date;
  if (repeat === 'weekly' || repeat === 'biweekly') {
    const days = daysAfter(event.date, date);
    return days > 0 && days % (repeat === 'weekly' ? 7 : 14) === 0;
  }
  const [, , startDay] = event.date.split('-');
  const [year, month, day] = date.split('-').map(Number);
  if (String(day).padStart(2, '0') !== startDay) return false;
  const [startYear, startMonth] = event.date.split('-').map(Number);
  const months = (year - startYear) * 12 + (month - startMonth);
  return months > 0;
}

export function eventsOnDate(report: StudentProgressReport, date: string): CalendarEvent[] {
  return report.calendar.filter((event) => eventOccursOn(event, date));
}

/** Sunday-first month grid. Days outside the month stay in the grid so the columns line up. */
export function monthGrid(year: number, month: number): MonthCell[][] {
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const weeks: MonthCell[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const row: MonthCell[] = [];
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + week * 7 + day);
      const iso = todayIso(date);
      row.push({ iso, inMonth: date.getMonth() === month - 1, day: date.getDate() });
    }
    weeks.push(row);
  }
  return weeks;
}

export function addCalendarEvent(
  report: StudentProgressReport,
  draft: { date: string; title: string; kind: CalendarKind; note: string; time?: string; repeat?: CalendarRepeat },
  now = Date.now(),
): StudentProgressReport {
  if (!isIsoDate(draft.date)) throw new Error('Date must be YYYY-MM-DD.');
  const title = draft.title.trim();
  if (!title) throw new Error('Add a title.');
  const time = (draft.time ?? '').trim();
  if (time && !CLOCK_RE.test(time)) throw new Error('Time must be HH:MM.');
  const repeat = draft.repeat ?? 'none';
  if (!(CALENDAR_REPEATS as readonly string[]).includes(repeat)) throw new Error('Pick how often it repeats.');
  const name = title.slice(0, PROGRESS_NAME_MAX);
  const note = draft.note.trim().slice(0, PROGRESS_NOTE_MAX);
  if (draft.kind === 'other') {
    const existing = tournamentMatchingName(report, name, draft.date);
    const hasMirror = existing
      ? report.calendar.some(
          (event) =>
            event.kind === 'other' &&
            (event.tournamentId === existing.id ||
              (event.date === existing.date && event.title.trim().toLowerCase() === existing.name.trim().toLowerCase())),
        )
      : false;
    if (!hasMirror && report.calendar.length >= PROGRESS_CALENDAR_MAX) throw new Error('The calendar is full.');
    let next = report;
    if (!existing) {
      next = addTournament(
        next,
        {
          name,
          date: draft.date,
          location: note,
          division: '',
          weightClass: '',
          deadline: '',
          link: '',
          status: 'considering',
          targetWeight: '',
          targetUnit: competitionOf(report).weightUnit,
        },
        now,
      );
    } else if (!existing.location.trim() && note) {
      next = updateTournament(
        next,
        existing.id,
        {
          name: existing.name,
          date: existing.date,
          location: note,
          division: existing.division,
          weightClass: existing.weightClass ?? '',
          deadline: existing.deadline,
          link: existing.link,
          status: existing.status,
          targetWeight: existing.targetWeight == null ? '' : String(existing.targetWeight),
          targetUnit: existing.targetUnit,
        },
        now,
      );
    }
    return applyTournamentEventDraft(next, { date: draft.date, title: name, note, time, repeat }, now);
  }
  if (report.calendar.length >= PROGRESS_CALENDAR_MAX) throw new Error('The calendar is full.');
  const event: CalendarEvent = {
    id: newId('cal', now),
    date: draft.date,
    title: name,
    kind: draft.kind,
    note,
  };
  if (time) event.time = time;
  if (repeat !== 'none') event.repeat = repeat;
  return touch({ ...report, calendar: [...report.calendar, event] }, now);
}

export function removeCalendarEvent(report: StudentProgressReport, id: string, now = Date.now()): StudentProgressReport {
  const event = report.calendar.find((item) => item.id === id);
  if (!event) return report;
  if (event.kind === 'other') {
    const tournament =
      competitionOf(report).tournaments.find((item) => item.id === event.tournamentId) ??
      tournamentMatchingName(report, event.title, event.date);
    if (tournament) return removeTournament(report, tournament.id, now);
  }
  return touch({ ...report, calendar: report.calendar.filter((item) => item.id !== id) }, now);
}

export function readGymSchedule(raw: string | null): { hints: GymHint[] } | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const schedule = normalizeGymCalendar(parsed);
  const hints: GymHint[] = [];
  for (const slot of schedule.classes) {
    const when = formatClassTime(slot.time);
    const day = WEEKDAY_LABELS[slot.day];
    const title = slot.title.trim() || 'Class';
    hints.push({ id: slot.id, label: `${day} · ${when} · ${title}` });
  }
  for (const special of schedule.specials) {
    if (!special.date) continue;
    const title = special.title.trim() || special.body.trim();
    if (!title) continue;
    hints.push({ id: special.id, label: `${special.date} · ${title}` });
  }
  if (!hints.length) return null;
  return { hints };
}

export function gymClassesOnDate(raw: string | null, iso: string): string[] {
  if (!raw || !isIsoDate(iso)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const schedule = normalizeGymCalendar(parsed);
  const [year, month, day] = iso.split('-').map(Number);
  const weekday = weekdayFromJsDay(new Date(year, month - 1, day).getDay());
  const classes = classesOnDay(schedule.classes, weekday).map((slot) => {
    const title = slot.title.trim() || 'Class';
    return `${formatClassTime(slot.time)} ${title}`;
  });
  const specials = schedule.specials
    .filter((item) => item.date === iso)
    .map((item) => item.title.trim() || item.body.trim())
    .filter(Boolean);
  return [...classes, ...specials];
}

function criterion(belt: ProgressBelt, slug: string, requirement: string, techniqueId: string, techniqueName: string): RubricCriterion {
  return {
    id: sharedCriterionId(belt, slug),
    requirement,
    techniqueRefs: [{ id: techniqueId, name: techniqueName }],
    met: null,
    note: '',
  };
}

function checkpoint(belt: ProgressBelt, slug: string, name: string, criteria: RubricCriterion[]): RubricCheckpoint {
  return { id: sharedCheckpointId(belt, slug), name, met: null, note: '', criteria };
}

function level(belt: ProgressBelt, name: string, checkpoints: RubricCheckpoint[]): RubricLevel {
  return { id: `level.${belt}`, name, belt, checkpoints };
}

/**
 * Brown used to arrive with a technique list. That list is not a default anymore.
 * An unmarked copy of it is cleared. A mark, a note, or a renamed row stays.
 */
const LEGACY_BROWN_CHECKPOINTS: RubricCheckpoint[] = [
  checkpoint('brown', 'top', 'Top', [
    criterion('brown', 'mount', 'Hold mount.', 'pos.mount', 'Mount'),
    criterion('brown', 'knee on belly', 'Hold knee on belly.', 'pos.knee-on-belly', 'Knee on belly'),
  ]),
  checkpoint('brown', 'standing', 'Standing', [
    criterion('brown', 'standing', 'Work standing.', 'pos.standing', 'Standing'),
    criterion('brown', 'double leg', 'Finish a double leg.', 'td.double-leg', 'Double leg'),
    criterion('brown', 'hip throw', 'Finish a hip throw.', 'td.hip-throw', 'Hip throw'),
  ]),
  checkpoint('brown', 'chokes', 'Chokes', [
    criterion('brown', 'guillotine', 'Finish a guillotine.', 'sub.guillotine', 'Guillotine'),
    criterion('brown', 'cross collar', 'Finish a cross collar choke.', 'sub.cross-collar', 'Cross collar choke'),
  ]),
];

/** Names from the fundamentals catalog. The student marks these. The file has no stripes. */
export const STARTER_RUBRIC_LEVELS: RubricLevel[] = [
  level('white', 'White', [
    checkpoint('white', 'guard', 'Guard', [
      criterion('white', 'closed guard', 'Hold closed guard.', 'pos.closed-guard', 'Closed guard'),
      criterion('white', 'scissor sweep', 'Finish a scissor sweep.', 'sweep.scissor', 'Scissor sweep'),
    ]),
    checkpoint('white', 'escapes', 'Escapes', [
      criterion('white', 'mount escape', 'Escape mount.', 'escape.mount', 'Mount escape'),
      criterion('white', 'side control escape', 'Escape side control.', 'escape.side-control', 'Side control escape'),
    ]),
    checkpoint('white', 'passes', 'Passes', [
      criterion('white', 'knee slice', 'Finish a knee slice pass.', 'pass.knee-slice', 'Knee slice pass'),
      criterion('white', 'torreando', 'Finish a torreando pass.', 'pass.torreando', 'Torreando pass'),
    ]),
  ]),
  level('blue', 'Blue', [
    checkpoint('blue', 'half-guard', 'Half guard', [
      criterion('blue', 'half guard', 'Play half guard.', 'pos.half-guard', 'Half guard'),
      criterion('blue', 'tripod sweep', 'Finish a tripod sweep.', 'sweep.tripod', 'Tripod sweep'),
    ]),
    checkpoint('blue', 'submissions', 'Submissions', [
      criterion('blue', 'kimura', 'Finish a kimura.', 'sub.kimura', 'Kimura'),
      criterion('blue', 'triangle', 'Finish a triangle.', 'sub.triangle', 'Triangle'),
    ]),
    checkpoint('blue', 'takedowns', 'Takedowns', [
      criterion('blue', 'single leg', 'Finish a single leg.', 'td.single-leg', 'Single leg'),
      criterion('blue', 'arm drag', 'Finish an arm drag.', 'td.arm-drag', 'Arm drag'),
    ]),
  ]),
  level('purple', 'Purple', [
    checkpoint('purple', 'back', 'Back', [
      criterion('purple', 'back control', 'Take the back.', 'pos.back-control', 'Back control'),
      criterion('purple', 'rear naked choke', 'Finish a rear naked choke.', 'sub.rear-naked-choke', 'Rear naked choke'),
    ]),
    checkpoint('purple', 'open-guard', 'Open guard', [
      criterion('purple', 'open guard', 'Play open guard.', 'pos.open-guard', 'Open guard'),
      criterion('purple', 'flower sweep', 'Finish a flower sweep.', 'sweep.flower', 'Flower sweep'),
    ]),
    checkpoint('purple', 'passing', 'Passing', [
      criterion('purple', 'leg drag', 'Finish a leg drag.', 'pass.leg-drag', 'Leg drag'),
      criterion('purple', 'stack pass', 'Finish a stack pass.', 'pass.stack', 'Stack pass'),
    ]),
  ]),
  level('brown', 'Brown', []),
  level('black', 'Black', []),
  level('coral', 'Coral', []),
  level('redWhite', 'Red and white', []),
  level('red', 'Red', []),
  level('grey', 'Grey', [
    checkpoint('grey', 'positions', 'Positions', [
      criterion('grey', 'closed guard', 'Hold closed guard.', 'pos.closed-guard', 'Closed guard'),
      criterion('grey', 'mount', 'Hold mount.', 'pos.mount', 'Mount'),
    ]),
  ]),
  level('yellow', 'Yellow', [
    checkpoint('yellow', 'sweeps', 'Sweeps', [
      criterion('yellow', 'hip bump', 'Finish a hip bump sweep.', 'sweep.hip-bump', 'Hip bump sweep'),
      criterion('yellow', 'pendulum', 'Finish a pendulum sweep.', 'sweep.pendulum', 'Pendulum sweep'),
    ]),
  ]),
  level('orange', 'Orange', [
    checkpoint('orange', 'escapes', 'Escapes', [
      criterion('orange', 'mount escape', 'Escape mount.', 'escape.mount', 'Mount escape'),
      criterion('orange', 'headlock', 'Escape a headlock.', 'escape.headlock', 'Headlock escape'),
    ]),
  ]),
  level('green', 'Green', [
    checkpoint('green', 'takedowns', 'Takedowns', [
      criterion('green', 'double leg', 'Finish a double leg.', 'td.double-leg', 'Double leg'),
      criterion('green', 'single leg', 'Finish a single leg.', 'td.single-leg', 'Single leg'),
    ]),
  ]),
];

function criterionUntouched(row: RubricCriterion, starter: RubricCriterion): boolean {
  if (row.id !== starter.id || row.requirement !== starter.requirement || row.met != null || row.note.trim()) return false;
  if (row.techniqueRefs.length !== starter.techniqueRefs.length) return false;
  return row.techniqueRefs.every((ref, index) => ref.id === starter.techniqueRefs[index]?.id && ref.name === starter.techniqueRefs[index]?.name);
}

/** True when brown still has the old prefilled list and the student has not edited it. */
export function isUntouchedLegacyBrown(level: RubricLevel): boolean {
  if (level.belt !== 'brown' || level.checkpoints.length !== LEGACY_BROWN_CHECKPOINTS.length) return false;
  return level.checkpoints.every((row, index) => {
    const starter = LEGACY_BROWN_CHECKPOINTS[index];
    if (!starter || row.id !== starter.id || row.name !== starter.name || row.met != null || row.note.trim()) return false;
    if (row.criteria.length !== starter.criteria.length) return false;
    return row.criteria.every((item, criterionIndex) => criterionUntouched(item, starter.criteria[criterionIndex]!));
  });
}

/** Add any starter level this file does not already have. Existing marks stay. */
export function withStarterRubric(report: StudentProgressReport, now = Date.now()): StudentProgressReport {
  const present = new Set(report.rubric.levels.map((item) => item.id));
  const missing = STARTER_RUBRIC_LEVELS.filter((item) => !present.has(item.id));
  let cleared = false;
  const levels = (missing.length ? [...report.rubric.levels, ...structuredClone(missing)] : report.rubric.levels).map((level) => {
    if (!isUntouchedLegacyBrown(level)) return level;
    cleared = true;
    return { ...level, checkpoints: [] };
  });
  if (!missing.length && !cleared) return report;
  return touch({ ...report, rubric: { ...report.rubric, levels } }, now);
}

export function learnedCatalogIds(report: StudentProgressReport): Set<string> {
  return new Set(
    report.checklist
      .filter((entry) => entry.catalogItemId && !entry.hidden && fundamentalLevelOf(entry) >= FUNDAMENTAL_LIVE_LEVEL)
      .map((entry) => entry.catalogItemId),
  );
}

export function criterionCounts(criterionRow: RubricCriterion, learned: ReadonlySet<string>): boolean {
  if (criterionRow.met === true) return true;
  return criterionRow.techniqueRefs.some((ref) => ref.id !== '' && learned.has(ref.id));
}

export function criterionFromFundamentals(criterionRow: RubricCriterion, learned: ReadonlySet<string>): boolean {
  if (criterionRow.met === true) return false;
  return criterionRow.techniqueRefs.some((ref) => ref.id !== '' && learned.has(ref.id));
}

/** A checkpoint is filled when the student marked it, or every requirement counts. Not a stripe. */
export function checkpointFilled(row: RubricCheckpoint, learned: ReadonlySet<string>): boolean {
  if (row.met === true) return true;
  if (!row.criteria.length) return false;
  return row.criteria.every((item) => criterionCounts(item, learned));
}

/** 1 when the checkpoint is filled, otherwise the share of requirements that count. */
export function checkpointShare(row: RubricCheckpoint, learned: ReadonlySet<string>): number {
  if (checkpointFilled(row, learned)) return 1;
  if (!row.criteria.length) return 0;
  const counted = row.criteria.filter((item) => criterionCounts(item, learned)).length;
  return counted / row.criteria.length;
}

export function checkpointState(row: RubricCheckpoint, learned: ReadonlySet<string>): 'filled' | 'partly filled' | 'open' {
  const share = checkpointShare(row, learned);
  if (share >= 1) return 'filled';
  if (share > 0) return 'partly filled';
  return 'open';
}

export type BeltRequirementProgress = {
  requirements: number;
  counted: number;
  fromFundamentals: number;
  checkpoints: number;
  checkpointsFilled: number;
};

/** Requirements on this belt. A fundamentals level of 3 or higher counts. */
export function beltRequirementProgress(level: RubricLevel | null, learned: ReadonlySet<string>): BeltRequirementProgress {
  const checkpoints = level?.checkpoints ?? [];
  let requirements = 0;
  let counted = 0;
  let fromFundamentals = 0;
  for (const row of checkpoints) {
    for (const item of row.criteria) {
      requirements += 1;
      if (criterionCounts(item, learned)) counted += 1;
      if (criterionFromFundamentals(item, learned)) fromFundamentals += 1;
    }
  }
  return {
    requirements,
    counted,
    fromFundamentals,
    checkpoints: checkpoints.length,
    checkpointsFilled: checkpoints.filter((row) => checkpointFilled(row, learned)).length,
  };
}

export function beltProgressSummary(level: RubricLevel | null, learned: ReadonlySet<string>): string {
  const progress = beltRequirementProgress(level, learned);
  const parts: string[] = [];
  if (progress.checkpoints) parts.push(`${progress.checkpointsFilled} of ${progress.checkpoints} practical benchmarks filled.`);
  if (progress.requirements) {
    const from = progress.fromFundamentals ? ` ${progress.fromFundamentals} from fundamentals.` : '';
    parts.push(`${progress.counted} of ${progress.requirements} requirements counted.${from}`);
  }
  return parts.join(' ');
}

/** Higher belts start without a benchmark list. Personal goals are added from these prompts. */
export const OPEN_GOAL_BELTS = ['brown', 'black', 'coral', 'redWhite', 'red'] as const;

export const PRACTICAL_BENCHMARKS_HEADING = 'Practical Benchmarks';
export const PRACTICAL_BENCHMARKS_LINE = 'Skills the coach or template expects before the next belt.';
export const PERSONAL_GOALS_HEADING = 'Personal Goals';
export const PERSONAL_GOALS_LINE = 'Your own goals, which never affect belt or degree milestones.';
export const NO_PRACTICAL_BENCHMARKS = 'No practical benchmarks yet.';
export const NO_PERSONAL_GOALS = 'No personal goals yet.';

export const OPEN_GOAL_PROMPTS = [
  'Teaching: lead a class',
  'Competition or rolling goals',
  'Giving back to the gym',
  'Personal game refinement',
  'Lineage and history',
] as const;

export const OPEN_GOAL_LINE = 'Set the personal goals that matter to you at this stage';
export const INSTRUCTOR_FINAL_SAY = 'Your instructor always has the final say.';
export const TIME_BASED_PROGRESS =
  'Progress at this rank is time at the belt. Personal goals do not change a degree, coral, or red.';

export function openGoalBelt(belt: ProgressBelt): boolean {
  return (OPEN_GOAL_BELTS as readonly string[]).includes(belt);
}

/** Coach checkpoints are locked only when the template says students cannot edit them. */
export function checkpointReadOnly(report: StudentProgressReport, row: RubricCheckpoint): boolean {
  return row.source === 'coach' && report.rubric.studentsCanEdit === false;
}

/** A coach checkpoint the student changed shows an asterisk. Own checkpoints do not. */
export function checkpointTitle(row: RubricCheckpoint): string {
  return row.source === 'coach' && row.edited === true ? `${row.name}*` : row.name;
}

function editedCoach(row: RubricCheckpoint, changed: boolean): RubricCheckpoint {
  if (!changed || row.source !== 'coach') return row;
  return { ...row, edited: true };
}

function requireCheckpointEdit(report: StudentProgressReport, checkpointId: string): void {
  for (const level of report.rubric.levels) {
    const row = level.checkpoints.find((item) => item.id === checkpointId);
    if (row && checkpointReadOnly(report, row)) throw new Error('This practical benchmark comes from your coach.');
  }
}

/** Black, coral, and red move by time. Checkpoints on those belts are focus, not milestones. */
export function degreeProgressIsTimeBased(belt: ProgressBelt): boolean {
  return belt === 'black' || belt === 'coral' || belt === 'redWhite' || belt === 'red';
}

export function beltLevel(report: StudentProgressReport, belt: ProgressBelt): RubricLevel | null {
  return report.rubric.levels.find((item) => item.belt === belt) ?? null;
}

function mapCriteria(
  report: StudentProgressReport,
  criterionId: string,
  update: (row: RubricCriterion) => RubricCriterion,
  now: number,
): StudentProgressReport {
  let found = false;
  const levels = report.rubric.levels.map((item) => ({
    ...item,
    checkpoints: item.checkpoints.map((row) => ({
      ...row,
      criteria: row.criteria.map((criterionRow) => {
        if (criterionRow.id !== criterionId) return criterionRow;
        found = true;
        return update(criterionRow);
      }),
    })),
  }));
  if (!found) return report;
  return touch({ ...report, rubric: { ...report.rubric, levels } }, now);
}

export function setCriterionMark(
  report: StudentProgressReport,
  criterionId: string,
  met: boolean,
  date: string,
  note: string,
  now = Date.now(),
): StudentProgressReport {
  const dated = date.trim();
  if (dated && !isIsoDate(dated)) throw new Error('Date must be YYYY-MM-DD.');
  const when = met && !dated ? todayIso(new Date(now)) : dated;
  return mapCriteria(report, criterionId, (row) => ({ ...row, met, note: joinMarkNote(when, note) }), now);
}

export function setCheckpointMark(
  report: StudentProgressReport,
  checkpointId: string,
  met: boolean,
  note: string,
  now = Date.now(),
): StudentProgressReport {
  let found = false;
  const levels = report.rubric.levels.map((item) => ({
    ...item,
    checkpoints: item.checkpoints.map((row) => {
      if (row.id !== checkpointId) return row;
      found = true;
      if (checkpointReadOnly(report, row) && note.trim() !== row.note) {
        throw new Error('This practical benchmark comes from your coach.');
      }
      const nextNote = note.trim().slice(0, PROGRESS_NOTE_MAX);
      return editedCoach({ ...row, met, note: nextNote }, nextNote !== row.note);
    }),
  }));
  if (!found) return report;
  return touch({ ...report, rubric: { ...report.rubric, levels } }, now);
}

function ensureBeltLevel(report: StudentProgressReport, belt: ProgressBelt): StudentProgressReport {
  if (beltLevel(report, belt)) return report;
  const starter = STARTER_RUBRIC_LEVELS.find((item) => item.belt === belt);
  const next = starter
    ? structuredClone(starter)
    : { id: `level.${belt}`, name: BELT_LABELS[belt], belt, checkpoints: [] };
  return { ...report, rubric: { ...report.rubric, levels: [...report.rubric.levels, next] } };
}

function checkpointIdFor(levels: readonly RubricLevel[], belt: ProgressBelt, name: string, now: number): string {
  const used = new Set(levels.flatMap((level) => level.checkpoints.map((row) => row.id)));
  const base = sharedCheckpointId(belt, name);
  if (!used.has(base)) return base;
  let id = newId(`checkpoint.${belt}`, now);
  while (used.has(id)) id = newId(`checkpoint.${belt}`, now + 1);
  return id.slice(0, PROGRESS_ID_MAX);
}

function replaceBeltCheckpoints(
  report: StudentProgressReport,
  belt: ProgressBelt,
  checkpoints: RubricCheckpoint[],
  now: number,
): StudentProgressReport {
  return touch(
    {
      ...report,
      rubric: {
        ...report.rubric,
        levels: report.rubric.levels.map((level) => (level.belt === belt ? { ...level, checkpoints } : level)),
      },
    },
    now,
  );
}

/** Add a checkpoint on an adult belt. The new row has no requirements until the student writes them. */
export function addCheckpoint(
  report: StudentProgressReport,
  belt: ProgressBelt,
  name: string,
  now = Date.now(),
): StudentProgressReport {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Add a practical benchmark name.');
  const prepared = ensureBeltLevel(report, belt);
  const level = beltLevel(prepared, belt);
  if (!level) return prepared;
  if (level.checkpoints.length >= PROGRESS_CHECKPOINTS_MAX) throw new Error('The practical benchmark list is full.');
  const row: RubricCheckpoint = {
    id: checkpointIdFor(prepared.rubric.levels, belt, trimmed, now),
    name: trimmed.slice(0, PROGRESS_NAME_MAX),
    met: null,
    note: '',
    criteria: [],
  };
  return replaceBeltCheckpoints(prepared, belt, [...level.checkpoints, row], now);
}

export function renameCheckpoint(
  report: StudentProgressReport,
  checkpointId: string,
  name: string,
  now = Date.now(),
): StudentProgressReport {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Add a practical benchmark name.');
  requireCheckpointEdit(report, checkpointId);
  let found = false;
  const levels = report.rubric.levels.map((level) => ({
    ...level,
    checkpoints: level.checkpoints.map((row) => {
      if (row.id !== checkpointId) return row;
      found = true;
      const name = trimmed.slice(0, PROGRESS_NAME_MAX);
      return editedCoach({ ...row, name }, name !== row.name);
    }),
  }));
  if (!found) return report;
  return touch({ ...report, rubric: { ...report.rubric, levels } }, now);
}

export function removeCheckpoint(report: StudentProgressReport, checkpointId: string, now = Date.now()): StudentProgressReport {
  requireCheckpointEdit(report, checkpointId);
  let found = false;
  const levels = report.rubric.levels.map((level) => ({
    ...level,
    checkpoints: level.checkpoints.filter((row) => {
      if (row.id !== checkpointId) return true;
      found = true;
      return false;
    }),
  }));
  if (!found) return report;
  return touch({ ...report, rubric: { ...report.rubric, levels } }, now);
}

/** Move a checkpoint one place. `-1` is up, `1` is down. The ends stay put. */
export function moveCheckpoint(
  report: StudentProgressReport,
  checkpointId: string,
  direction: -1 | 1,
  now = Date.now(),
): StudentProgressReport {
  let found = false;
  const levels = report.rubric.levels.map((level) => {
    const index = level.checkpoints.findIndex((row) => row.id === checkpointId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= level.checkpoints.length) return level;
    const row = level.checkpoints[index];
    if (!row) return level;
    if (checkpointReadOnly(report, row)) throw new Error('This practical benchmark comes from your coach.');
    found = true;
    const checkpoints = [...level.checkpoints];
    checkpoints.splice(index, 1);
    checkpoints.splice(nextIndex, 0, editedCoach(row, true));
    return { ...level, checkpoints };
  });
  if (!found) return report;
  return touch({ ...report, rubric: { ...report.rubric, levels } }, now);
}

/** The belt the student wears. A saved belt comes back with its stripes, degrees, bars, and dates. */
export function setStudentBelt(report: StudentProgressReport, belt: ProgressBelt, now = Date.now()): StudentProgressReport {
  return setRankBelt(report, belt, now);
}

/** Goals for this belt, plus older goals that were saved before goals had a belt. */
export function goalsForBelt(report: StudentProgressReport, belt: ProgressBelt): StudentGoal[] {
  return report.goals.filter((goal) => !goal.belt || goal.belt === belt);
}

export function addGoal(
  report: StudentProgressReport,
  name: string,
  note: string,
  now = Date.now(),
  belt?: ProgressBelt,
): StudentProgressReport {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Add a personal goal name.');
  if (report.goals.length >= PROGRESS_GOALS_MAX) throw new Error('The personal goal list is full.');
  const goal: StudentGoal = {
    id: newId('goal', now),
    name: trimmed.slice(0, PROGRESS_NAME_MAX),
    note: note.trim().slice(0, PROGRESS_NOTE_MAX),
    met: false,
  };
  if (belt) goal.belt = belt;
  return touch({ ...report, goals: [...report.goals, goal] }, now);
}

export function removeGoal(report: StudentProgressReport, id: string, now = Date.now()): StudentProgressReport {
  if (!report.goals.some((goal) => goal.id === id)) return report;
  return touch({ ...report, goals: report.goals.filter((goal) => goal.id !== id) }, now);
}

export function updateGoal(
  report: StudentProgressReport,
  id: string,
  name: string,
  note: string,
  now = Date.now(),
): StudentProgressReport {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Add a personal goal name.');
  let found = false;
  const goals = report.goals.map((goal) => {
    if (goal.id !== id) return goal;
    found = true;
    return { ...goal, name: trimmed.slice(0, PROGRESS_NAME_MAX), note: note.trim().slice(0, PROGRESS_NOTE_MAX) };
  });
  if (!found) return report;
  return touch({ ...report, goals }, now);
}

export function setGoalMet(report: StudentProgressReport, id: string, met: boolean, now = Date.now()): StudentProgressReport {
  let found = false;
  const goals = report.goals.map((goal) => {
    if (goal.id !== id) return goal;
    found = true;
    return { ...goal, met };
  });
  if (!found) return report;
  return touch({ ...report, goals }, now);
}

function copyGoal(report: StudentProgressReport, sourceId: string, name: string, note: string, now: number): StudentProgressReport {
  const trimmed = name.trim();
  if (!trimmed) return report;
  const id = `goal.${sourceId}`.slice(0, PROGRESS_ID_MAX);
  if (report.goals.some((goal) => goal.id === id)) return report;
  if (report.goals.length >= PROGRESS_GOALS_MAX) throw new Error('The personal goal list is full.');
  return touch(
    {
      ...report,
      goals: [
        ...report.goals,
        { id, name: trimmed.slice(0, PROGRESS_NAME_MAX), note: note.trim().slice(0, PROGRESS_NOTE_MAX), met: false },
      ],
    },
    now,
  );
}

export function copyFocusToGoal(report: StudentProgressReport, focus: CoachPlanFocus, now = Date.now()): StudentProgressReport {
  const name = focus.name.trim() || focus.note.trim();
  return copyGoal(report, focus.id, name, focus.note, now);
}

export function copySuggestionToGoal(
  report: StudentProgressReport,
  suggestion: CoachSuggestion,
  now = Date.now(),
): StudentProgressReport {
  return copyGoal(report, suggestion.id, suggestion.note, suggestion.note, now);
}

export function goalCopied(report: StudentProgressReport, sourceId: string): boolean {
  const id = `goal.${sourceId}`.slice(0, PROGRESS_ID_MAX);
  return report.goals.some((goal) => goal.id === id);
}

export function loadCoachShelf(storage: Pick<MemoryStore, 'getItem'>): CoachShelf {
  return {
    plan: readCoachPacket(storage.getItem(COACH_PLAN_STORAGE_KEY), 'coach-plan'),
    feedback: readCoachPacket(storage.getItem(COACH_FEEDBACK_STORAGE_KEY), 'coach-feedback'),
  };
}

function readCoachPacket<T extends 'coach-plan' | 'coach-feedback'>(raw: string | null, kind: T) {
  if (!raw) return null;
  const parsed = parseProgressPacket(raw);
  if (!parsed.ok || parsed.value.kind !== kind) return null;
  return parsed.value as T extends 'coach-plan' ? CoachPlanPacket : CoachFeedbackPacket;
}

export function saveCoachShelf(storage: MemoryStore, shelf: CoachShelf): void {
  writeCoachPacket(storage, COACH_PLAN_STORAGE_KEY, shelf.plan);
  writeCoachPacket(storage, COACH_FEEDBACK_STORAGE_KEY, shelf.feedback);
}

function writeCoachPacket(storage: MemoryStore, key: string, packet: CoachPlanPacket | CoachFeedbackPacket | null): void {
  if (!packet) {
    if (storage.removeItem) storage.removeItem(key);
    else storage.setItem(key, '');
    return;
  }
  storage.setItem(key, exportProgressPacket(packet));
}

export type CoachImportResult = {
  report: StudentProgressReport;
  shelf: CoachShelf;
  message: string;
  error: string;
  /** The student's own Send to coach file. Merge only after the student confirms. */
  pendingReport?: StudentProgressReport;
};

export const SEND_TO_COACH_MERGE_PROMPT =
  'This is a Student Edition progress file, the same kind Send to coach downloads. Merge it into the journal on this phone? Records that are only on this phone stay. A backup restores from Connections.';

export const BACKUP_PICKER_MESSAGE =
  'This is a Student Edition backup. Restore it from Connections. Send to coach files merge here after you confirm. A coach plan or coach feedback file is a suggestion and does not change your marks.';

export const COACH_PICKER_MESSAGE =
  'This picker takes a coach plan, coach feedback, or the progress file from Send to coach. A backup restores from Connections.';

/**
 * Read a coach-plan, coach-feedback, or the student's own Send to coach file.
 * A Send to coach file is returned as pendingReport and is not merged until mergeOwnStudentFile.
 * importCoachSuggestion returns the student report unchanged.
 */
export function applyCoachFile(report: StudentProgressReport, shelf: CoachShelf, text: string): CoachImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { report, shelf, message: '', error: 'This file is not JSON.' };
  }
  if (raw && typeof raw === 'object' && (raw as { advantage?: unknown }).advantage === 'student-journal-backup') {
    return { report, shelf, message: '', error: BACKUP_PICKER_MESSAGE };
  }
  const parsed = parseProgressPacket(text);
  if (!parsed.ok) return { report, shelf, message: '', error: `${parsed.errors.join(' ')} ${COACH_PICKER_MESSAGE}` };
  if (parsed.value.kind === 'student-progress-report') {
    return {
      report,
      shelf,
      message: SEND_TO_COACH_MERGE_PROMPT,
      error: '',
      pendingReport: parsed.value,
    };
  }
  if (parsed.value.kind === 'coach-plan') {
    const merged = mergeCoachPacket(shelf.plan, parsed.value);
    const suggestion = importCoachSuggestion(report, merged.packet);
    return {
      report: suggestion.report,
      shelf: { ...shelf, plan: merged.packet },
      message: merged.replaced
        ? `${merged.packet.plan.title || 'Work on before next promotion'} is on this phone. Your rubric, journal, and personal goals were not changed.`
        : merged.conflicts.join(' '),
      error: '',
    };
  }
  const merged = mergeCoachPacket(shelf.feedback, parsed.value);
  const suggestion = importCoachSuggestion(report, merged.packet);
  return {
    report: suggestion.report,
    shelf: { ...shelf, feedback: merged.packet },
    message: merged.replaced
      ? 'Coach feedback is on this phone. Your rubric, journal, and personal goals were not changed.'
      : merged.conflicts.join(' '),
    error: '',
  };
}

function studentFileIsBlank(report: StudentProgressReport): boolean {
  const rank = report.rank;
  const rankBlank =
    !rank || (rank.tapeCount === 0 && !rank.awardedOn && rank.history.length === 0 && !(rank.lineage?.length));
  const competition = report.competition;
  const games = competition?.games;
  const gamesBlank =
    !games || (['a', 'b', 'c'] as const).every((tag) => !games[tag].techniques.trim() && !games[tag].notes.trim());
  const competitionBlank =
    !competition ||
    (gamesBlank &&
      competition.tournaments.length === 0 &&
      competition.weighIns.length === 0 &&
      competition.results.length === 0 &&
      competition.goalWeight == null &&
      !competition.weighDate);
  const rubricBlank = report.rubric.levels.every((level) =>
    level.checkpoints.every(
      (checkpoint) =>
        checkpoint.met == null &&
        !checkpoint.note.trim() &&
        checkpoint.criteria.every((item) => item.met == null && !item.note.trim()),
    ),
  );
  return (
    report.profile.belt === 'white' &&
    !report.profile.displayName.trim() &&
    !report.profile.gymName.trim() &&
    !report.profile.startedOn &&
    report.journal.length === 0 &&
    report.checklist.length === 0 &&
    report.goals.length === 0 &&
    report.calendar.length === 0 &&
    !(report.clips?.length) &&
    rankBlank &&
    competitionBlank &&
    rubricBlank
  );
}

/** Merge a Send to coach progress file into the journal on this phone. A blank phone takes the file. */
export function mergeOwnStudentFile(
  local: StudentProgressReport,
  incoming: StudentProgressReport,
): { report: StudentProgressReport; message: string; error: string } {
  if (studentFileIsBlank(local)) {
    return {
      report: structuredClone(incoming),
      message: 'Merged this progress file into the journal on this phone.',
      error: '',
    };
  }
  if (local.studentId !== incoming.studentId) {
    return {
      report: local,
      message: '',
      error: 'This progress file is for a different student. It was not merged. The journal on this phone was left as it is. A backup restores from Connections.',
    };
  }
  const merged = mergeStudentProgress(local, incoming);
  const profile = { ...merged.report.profile };
  if (!profile.displayName.trim()) profile.displayName = incoming.profile.displayName;
  if (!profile.gymName.trim()) profile.gymName = incoming.profile.gymName;
  if (!profile.startedOn) profile.startedOn = incoming.profile.startedOn;
  if (!profile.licenseSource) profile.licenseSource = incoming.profile.licenseSource;
  const rank = local.rank;
  const beltUntouched =
    local.profile.belt === 'white' && (!rank || (rank.tapeCount === 0 && !rank.awardedOn && rank.history.length === 0));
  if (beltUntouched) profile.belt = incoming.profile.belt;
  return {
    report: { ...merged.report, profile },
    message: 'Merged this progress file into the journal on this phone. Records that were only on this phone were kept.',
    error: '',
  };
}

export const SHARE_SUBJECT = 'Advantage progress report';

export function progressReportFiles(report: StudentProgressReport, pictures = picturesFromStore(loadRankPictures())): {
  jsonName: string;
  json: string;
  csvName: string;
  csv: string;
  subject: string;
  mailto: string;
} {
  const withPhotos = report.rank && pictures.length ? { ...report, rank: { ...report.rank, pictures } } : report;
  const fitted = fitRankPictures(withPhotos);
  const jsonName = progressHandoffFileName(fitted);
  const json = exportProgressPacket(fitted);
  const csvName = jsonName.replace(/\.json$/, '.csv');
  const csv = exportProgressCsv(fitted);
  const body = `The progress file ${jsonName} is on this phone. Attach that JSON. Advantage does not host the file.`;
  const mailto = `mailto:?subject=${encodeURIComponent(SHARE_SUBJECT)}&body=${encodeURIComponent(body)}`;
  return { jsonName, json, csvName, csv, subject: SHARE_SUBJECT, mailto };
}

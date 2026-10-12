/**
 * Calendar, belt checkpoints, goals, and coach sharing for Student Edition.
 * Everything here is the progress file in src/lib/progress. Advantage does not host it.
 * A criterion has a met mark and a note. When the student dates a mark, the note
 * starts with YYYY-MM-DD and an em dash. That is still the note field.
 */

import { classesOnDay, formatClassTime, normalizeGymCalendar, WEEKDAY_LABELS, weekdayFromJsDay } from './gymCalendar.ts';
import {
  exportProgressCsv,
  exportProgressPacket,
  importCoachSuggestion,
  mergeCoachPacket,
  parseProgressPacket,
  progressHandoffFileName,
  sharedCheckpointId,
  sharedCriterionId,
} from './progress/format.ts';
import {
  PROGRESS_CALENDAR_MAX,
  PROGRESS_GOALS_MAX,
  PROGRESS_ID_MAX,
  PROGRESS_NAME_MAX,
  PROGRESS_NOTE_MAX,
  type CalendarEvent,
  type CalendarKind,
  type CoachFeedbackPacket,
  type CoachPlanFocus,
  type CoachPlanPacket,
  type CoachSuggestion,
  type ProgressBelt,
  type RubricCheckpoint,
  type RubricCriterion,
  type RubricLevel,
  type StudentProgressReport,
} from './progress/types.ts';
import { todayIso } from './studentEdition.ts';

export const COACH_PLAN_STORAGE_KEY = 'matboard.studentEdition.coachPlan.v1';
export const COACH_FEEDBACK_STORAGE_KEY = 'matboard.studentEdition.coachFeedback.v1';
export const GYM_SCHEDULE_STORAGE_KEY = 'matboard.schedule.v1';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MARK_NOTE = /^(\d{4}-\d{2}-\d{2})(?: — ([\s\S]*))?$/;

const ADULT_BELTS = ['white', 'blue', 'purple', 'brown', 'black', 'coral'] as const;
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
};

/** The four events a student adds. Kinds are the progress-file calendar kinds. */
export const CALENDAR_KIND_CHOICES: { kind: CalendarKind; label: string }[] = [
  { kind: 'class', label: 'Class' },
  { kind: 'training', label: 'Open mat' },
  { kind: 'other', label: 'Tournament' },
  { kind: 'promotion', label: 'Promotion test' },
];

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

/** Next belt on the adult line, or the kids line when the current belt is a kids belt. */
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

export function eventsOnDate(report: StudentProgressReport, date: string): CalendarEvent[] {
  return report.calendar.filter((event) => event.date === date);
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
  draft: { date: string; title: string; kind: CalendarKind; note: string },
  now = Date.now(),
): StudentProgressReport {
  if (!isIsoDate(draft.date)) throw new Error('Date must be YYYY-MM-DD.');
  const title = draft.title.trim();
  if (!title) throw new Error('Add a title.');
  if (report.calendar.length >= PROGRESS_CALENDAR_MAX) throw new Error('The calendar is full.');
  const event: CalendarEvent = {
    id: newId('cal', now),
    date: draft.date,
    title: title.slice(0, PROGRESS_NAME_MAX),
    kind: draft.kind,
    note: draft.note.trim().slice(0, PROGRESS_NOTE_MAX),
  };
  return touch({ ...report, calendar: [...report.calendar, event] }, now);
}

export function removeCalendarEvent(report: StudentProgressReport, id: string, now = Date.now()): StudentProgressReport {
  if (!report.calendar.some((event) => event.id === id)) return report;
  return touch({ ...report, calendar: report.calendar.filter((event) => event.id !== id) }, now);
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
  level('brown', 'Brown', [
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
  ]),
  level('black', 'Black', [
    checkpoint('black', 'pressure', 'Pressure', [
      criterion('black', 'side control', 'Hold side control.', 'pos.side-control', 'Side control'),
      criterion('black', 'mount', 'Hold mount.', 'pos.mount', 'Mount'),
    ]),
    checkpoint('black', 'guard', 'Guard', [
      criterion('black', 'closed guard', 'Recover closed guard.', 'pos.closed-guard', 'Closed guard'),
      criterion('black', 'hip bump', 'Finish a hip bump sweep.', 'sweep.hip-bump', 'Hip bump sweep'),
    ]),
  ]),
  level('coral', 'Coral', [
    checkpoint('coral', 'review', 'Review', [
      criterion('coral', 'scissor sweep', 'Teach a scissor sweep.', 'sweep.scissor', 'Scissor sweep'),
      criterion('coral', 'armbar', 'Teach an armbar from guard.', 'sub.armbar-guard', 'Armbar from guard'),
    ]),
  ]),
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

/** Add any starter level this file does not already have. Existing marks stay. */
export function withStarterRubric(report: StudentProgressReport, now = Date.now()): StudentProgressReport {
  const present = new Set(report.rubric.levels.map((item) => item.id));
  const missing = STARTER_RUBRIC_LEVELS.filter((item) => !present.has(item.id));
  if (!missing.length) return report;
  return touch(
    {
      ...report,
      rubric: { ...report.rubric, levels: [...report.rubric.levels, ...structuredClone(missing)] },
    },
    now,
  );
}

export function learnedCatalogIds(report: StudentProgressReport): Set<string> {
  return new Set(
    report.checklist
      .filter((entry) => entry.catalogItemId && entry.learnedOn && !entry.hidden)
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
      return { ...row, met, note: note.trim().slice(0, PROGRESS_NOTE_MAX) };
    }),
  }));
  if (!found) return report;
  return touch({ ...report, rubric: { ...report.rubric, levels } }, now);
}

export function setStudentBelt(report: StudentProgressReport, belt: ProgressBelt, now = Date.now()): StudentProgressReport {
  if (report.profile.belt === belt) return report;
  return touch({ ...report, profile: { ...report.profile, belt } }, now);
}

export function addGoal(report: StudentProgressReport, name: string, note: string, now = Date.now()): StudentProgressReport {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Add a goal name.');
  if (report.goals.length >= PROGRESS_GOALS_MAX) throw new Error('The goal list is full.');
  return touch(
    {
      ...report,
      goals: [
        ...report.goals,
        { id: newId('goal', now), name: trimmed.slice(0, PROGRESS_NAME_MAX), note: note.trim().slice(0, PROGRESS_NOTE_MAX), met: false },
      ],
    },
    now,
  );
}

export function updateGoal(
  report: StudentProgressReport,
  id: string,
  name: string,
  note: string,
  now = Date.now(),
): StudentProgressReport {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Add a goal name.');
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
  if (report.goals.length >= PROGRESS_GOALS_MAX) throw new Error('The goal list is full.');
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
};

/**
 * Read a coach-plan or coach-feedback file.
 * importCoachSuggestion returns the student report unchanged.
 */
export function applyCoachFile(report: StudentProgressReport, shelf: CoachShelf, text: string): CoachImportResult {
  const parsed = parseProgressPacket(text);
  if (!parsed.ok) return { report, shelf, message: '', error: parsed.errors.join(' ') };
  if (parsed.value.kind === 'student-progress-report') {
    return { report, shelf, message: '', error: 'This picker takes a coach plan or coach feedback file.' };
  }
  if (parsed.value.kind === 'coach-plan') {
    const merged = mergeCoachPacket(shelf.plan, parsed.value);
    const suggestion = importCoachSuggestion(report, merged.packet);
    return {
      report: suggestion.report,
      shelf: { ...shelf, plan: merged.packet },
      message: merged.replaced
        ? `${merged.packet.plan.title || 'Work on before next promotion'} is on this phone. Your rubric, journal, and goals were not changed.`
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
      ? 'Coach feedback is on this phone. Your rubric, journal, and goals were not changed.'
      : merged.conflicts.join(' '),
    error: '',
  };
}

export const SHARE_SUBJECT = 'Advantage progress report';

export function progressReportFiles(report: StudentProgressReport): {
  jsonName: string;
  json: string;
  csvName: string;
  csv: string;
  subject: string;
  mailto: string;
} {
  const jsonName = progressHandoffFileName(report);
  const json = exportProgressPacket(report);
  const csvName = jsonName.replace(/\.json$/, '.csv');
  const csv = exportProgressCsv(report);
  const body = `The progress file ${jsonName} is on this phone. Attach that JSON. Advantage does not host the file.`;
  const mailto = `mailto:?subject=${encodeURIComponent(SHARE_SUBJECT)}&body=${encodeURIComponent(body)}`;
  return { jsonName, json, csvName, csv, subject: SHARE_SUBJECT, mailto };
}

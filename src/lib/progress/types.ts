/**
 * Advantage Student Edition progress file. Step 1 is the shared format only.
 * The file is JSON text. Advantage does not host it.
 * Photos and videos never belong in this file.
 */

export const PROGRESS_SCHEMA_VERSION = 1 as const;

export const PROGRESS_BELTS = [
  'white',
  'blue',
  'purple',
  'brown',
  'black',
  'grey',
  'yellow',
  'orange',
  'green',
  'coral',
] as const;

export type ProgressBelt = (typeof PROGRESS_BELTS)[number];

/** A game / B game / C game. Same letters as the coach game-plan layers. */
export const GAME_TAGS = ['a', 'b', 'c'] as const;
export type GameTag = (typeof GAME_TAGS)[number];

export const CALENDAR_KINDS = ['class', 'training', 'promotion', 'note', 'other'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export const PROGRESS_PACKET_KINDS = ['student-progress-report', 'coach-plan', 'coach-feedback'] as const;
export type ProgressPacketKind = (typeof PROGRESS_PACKET_KINDS)[number];

export const PROGRESS_ID_MAX = 80;
export const PROGRESS_NAME_MAX = 80;
export const PROGRESS_NOTE_MAX = 500;
export const PROGRESS_BODY_MAX = 4000;
export const PROGRESS_SYNOPSIS_MAX = 4000;
export const PROGRESS_EXAMPLE_MAX = 200;
export const PROGRESS_EXAMPLES_MAX = 8;
export const PROGRESS_JOURNAL_MAX = 500;
export const PROGRESS_AMENDMENTS_MAX = 50;
export const PROGRESS_CHECKLIST_MAX = 400;
export const PROGRESS_CALENDAR_MAX = 500;
export const PROGRESS_CRITERIA_MAX = 200;
export const PROGRESS_FOCUS_MAX = 100;

/**
 * Belt plus an open level key. The owner has not chosen stripes versus a
 * next-belt gate, so this file stores the key as text and does not count stripes.
 */
export type BeltLevel = {
  belt: ProgressBelt;
  levelKey: string;
};

export type StudentProfile = {
  id: string;
  displayName: string;
  gymName: string;
  beltLevel: BeltLevel;
  /** YYYY-MM-DD, or empty when the student has not set a start date. */
  startedOn: string;
};

/**
 * One line on the coach rubric and the student rubric.
 * `id` is the match key. Labels may be edited. Ids may not.
 */
export type RubricCriterion = {
  id: string;
  belt: ProgressBelt;
  levelKey: string;
  label: string;
  category: string;
};

/** The student's mark against one shared criterion id. */
export type StudentCriterionMark = {
  criterionId: string;
  label: string;
  category: string;
  met: boolean | null;
  note: string;
};

export type StudentRubric = {
  id: string;
  beltLevel: BeltLevel;
  /** Next belt or level, in words. Empty until someone sets it. */
  toward: string;
  criteria: StudentCriterionMark[];
};

/** One fundamentals name. `examples` stays empty while the sheet is names only. */
export type FundamentalsItem = {
  id: string;
  name: string;
  examples: string[];
};

export type FundamentalsCategory = {
  id: string;
  name: string;
  items: FundamentalsItem[];
};

export type FundamentalsCatalog = {
  id: string;
  title: string;
  /** True while the owner is still reviewing the list. */
  draft: boolean;
  categories: FundamentalsCategory[];
};

/**
 * One line on the student's fundamentals sheet.
 * A catalog id points at a shared name. An empty catalog id is a line the student added.
 */
export type StudentChecklistEntry = {
  id: string;
  catalogItemId: string;
  categoryId: string;
  name: string;
  /** YYYY-MM-DD, or empty when the student has not dated it. */
  learnedOn: string;
  note: string;
  updatedAt: number;
};

export type TechniqueRef = {
  id: string;
  name: string;
};

/** A later-cycle note on a journal card. Append-only. Never replaces the card. */
export type Amendment = {
  id: string;
  date: string;
  body: string;
  createdAt: number;
};

export type JournalEntry = {
  id: string;
  date: string;
  gameTag: GameTag;
  body: string;
  techniqueRefs: TechniqueRef[];
  amendments: Amendment[];
  createdAt: number;
  updatedAt: number;
};

export type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  kind: CalendarKind;
  note: string;
};

export type CoachPlanFocus = {
  id: string;
  criterionId: string;
  catalogItemId: string;
  name: string;
  note: string;
};

/** Coach → student. "Work on before next promotion." */
export type CoachPlan = {
  title: string;
  issuedOn: string;
  note: string;
  focus: CoachPlanFocus[];
};

export type CoachFeedbackNote = {
  criterionId: string;
  note: string;
  met: boolean | null;
};

/** Coach → student. A short synopsis, plus optional marks on shared criterion ids. */
export type CoachFeedback = {
  planId: string;
  issuedOn: string;
  synopsis: string;
  criteria: CoachFeedbackNote[];
};

type PacketBase = {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  id: string;
  studentId: string;
  updatedAt: number;
};

export type StudentProgressReport = PacketBase & {
  kind: 'student-progress-report';
  profile: StudentProfile;
  rubric: StudentRubric;
  checklist: StudentChecklistEntry[];
  journal: JournalEntry[];
  calendar: CalendarEvent[];
};

export type CoachPlanPacket = PacketBase & {
  kind: 'coach-plan';
  plan: CoachPlan;
};

export type CoachFeedbackPacket = PacketBase & {
  kind: 'coach-feedback';
  feedback: CoachFeedback;
};

export type ProgressPacket = StudentProgressReport | CoachPlanPacket | CoachFeedbackPacket;

export type ProgressParse =
  | { ok: true; value: ProgressPacket }
  | { ok: false; errors: string[] };

export type ProgressMerge = {
  report: StudentProgressReport;
  appendedAmendments: string[];
  addedJournal: string[];
  addedChecklist: string[];
  conflicts: string[];
};

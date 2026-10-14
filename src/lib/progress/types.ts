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
export const PROGRESS_CLIPS_MAX = 200;
export const PROGRESS_CLIP_URL_MAX = 2000;
export const PROGRESS_AMENDMENTS_MAX = 50;
export const PROGRESS_CHECKLIST_MAX = 400;
export const PROGRESS_CALENDAR_MAX = 500;
export const PROGRESS_CRITERIA_MAX = 200;
export const PROGRESS_CHECKPOINTS_MAX = 100;
export const PROGRESS_LEVELS_MAX = 20;
export const PROGRESS_GOALS_MAX = 100;
export const PROGRESS_FOCUS_MAX = 100;

/**
 * How this Student Edition copy was issued. Empty when the file does not say.
 * The code is not tied to the buyer.
 */
export const LICENSE_SOURCES = ['academy-member', 'pro-grant', 'additional'] as const;
export type LicenseSource = '' | (typeof LICENSE_SOURCES)[number];

/** Coach buyers, and coaches seated under Pro, share this 25% code with no use limit. */
export const ACADEMY_MEMBER_CODE_LABEL = 'Academy Member';
export const ACADEMY_MEMBER_DISCOUNT_PERCENT = 25;

/** Free Student Edition licenses included with Pro. The head instructor sends them. */
export const PRO_INCLUDED_STUDENT_LICENSES = 10;

/** Copy for a later screen. Not shown in this step. */
export const STUDENT_LICENSE_MORE_NOTE =
  'Gyms can email advantageappllc@gmail.com to purchase additional Student Edition licenses at a discount.';

export type StudentProfile = {
  id: string;
  displayName: string;
  gymName: string;
  belt: ProgressBelt;
  /** YYYY-MM-DD, or empty when the student has not set a start date. */
  startedOn: string;
  /** Optional. Blank when this file does not record how the license was issued. */
  licenseSource: LicenseSource;
};

/**
 * One requirement inside a checkpoint.
 * `id` matches the coach rubric. The student sets `met`. A coach file cannot.
 */
export type RubricCriterion = {
  id: string;
  requirement: string;
  techniqueRefs: TechniqueRef[];
  met: boolean | null;
  note: string;
};

/** A checkpoint between levels. The student marks it met. */
export type RubricCheckpoint = {
  id: string;
  name: string;
  met: boolean | null;
  note: string;
  criteria: RubricCriterion[];
};

/** One level on the rubric. Checkpoints are the steps inside it. */
export type RubricLevel = {
  id: string;
  name: string;
  belt: ProgressBelt;
  checkpoints: RubricCheckpoint[];
};

export type StudentRubric = {
  id: string;
  levels: RubricLevel[];
};

/** A goal the student owns. Coach files do not write these. */
export type StudentGoal = {
  id: string;
  name: string;
  note: string;
  met: boolean | null;
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
  /** Canonical name. Catalog name, or the name first typed for a custom line. Matching uses this, not the display override. */
  name: string;
  /** Student-facing name. Empty means `name`. */
  displayName: string;
  /** Hidden on this student's list. The row and any journal references stay. */
  hidden: boolean;
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

/**
 * A link the student saved on the journal page.
 * Absent on older files. An empty list means this file has a clipboard and it is empty.
 */
export type JournalClip = {
  id: string;
  url: string;
  description: string;
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

/** A coach note. It names a checkpoint or criterion. It does not mark it met. */
export type CoachSuggestion = {
  id: string;
  /** Shared checkpoint or criterion id, or empty for a general note. */
  targetId: string;
  note: string;
};

/** Coach → student. Notes only. Import does not change the student's rubric, journal, or goals. */
export type CoachFeedback = {
  planId: string;
  issuedOn: string;
  synopsis: string;
  suggestions: CoachSuggestion[];
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
  goals: StudentGoal[];
  /** Optional. Omitted on files written before the clipboard. */
  clips?: JournalClip[];
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

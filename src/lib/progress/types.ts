/**
 * Advantage Student Edition progress file. Step 1 is the shared format only.
 * The file is JSON text. Advantage does not host it.
 * Photos and videos never belong in this file.
 */

/**
 * Version 2 adds competition: tournaments, the standing A/B/C game, and weigh-ins.
 * Version 1 files still import. A missing competition section is filled on read.
 */
export const PROGRESS_SCHEMA_VERSION = 2 as const;
export const PROGRESS_SCHEMA_VERSIONS = [1, 2] as const;

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

export const TOURNAMENT_STATUSES = ['entered', 'considering'] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const WEIGHT_UNITS = ['lb', 'kg'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const MATCH_RESULTS = ['win', 'loss', 'draw'] as const;
export type MatchResult = (typeof MATCH_RESULTS)[number];

export const MATCH_METHODS = ['points', 'sub', 'advantage', 'dq'] as const;
export type MatchMethod = '' | (typeof MATCH_METHODS)[number];

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
export const PROGRESS_TOURNAMENTS_MAX = 80;
export const PROGRESS_TOURNAMENT_GOALS_MAX = 30;
export const PROGRESS_WEIGH_INS_MAX = 400;
export const PROGRESS_RESULTS_MAX = 80;
export const PROGRESS_MATCHES_MAX = 40;
export const PROGRESS_BRACKET_NOTES_MAX = 32;
/** Techniques and sequences on one standing game. */
export const PROGRESS_SEQUENCE_MAX = 1000;
export const PROGRESS_WEIGHT_MAX = 999;

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
  /**
   * a, b, or c on a card saved when the journal asked for a game.
   * Blank on a new card. The standing game lives on `competition.games`.
   */
  gameTag: GameTag | '';
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

/** Standing A, B, or C game. Techniques and sequences, plus notes. One copy for the journal and Competitor. */
export type CompetitionGame = {
  techniques: string;
  notes: string;
};

export type CompetitionGames = Record<GameTag, CompetitionGame>;

/** A goal for one tournament. Separate from belt goals. */
export type TournamentGoal = {
  id: string;
  name: string;
  note: string;
  met: boolean | null;
};

/**
 * A tournament the student is entered in or considering.
 * The student calendar reads this list. It is not copied into calendar events.
 */
export type StudentTournament = {
  id: string;
  name: string;
  /** Event day, YYYY-MM-DD. */
  date: string;
  location: string;
  /** Division and weight class, in the student's words. */
  division: string;
  /** Registration deadline, YYYY-MM-DD, or empty. */
  deadline: string;
  /** http or https link, or empty. */
  link: string;
  status: TournamentStatus;
  /** Target division weight. Null when unset. Stored in `targetUnit`. */
  targetWeight: number | null;
  targetUnit: WeightUnit;
  goals: TournamentGoal[];
};

/** One weigh-in. The number stays in the unit it was entered. */
export type WeighIn = {
  id: string;
  date: string;
  weight: number;
  unit: WeightUnit;
  note: string;
};

/** One match the student recorded after a competition. Not a live score. */
export type CompetitionMatch = {
  id: string;
  opponent: string;
  result: MatchResult;
  method: MatchMethod;
  note: string;
};

/** One name on a personal bracket note. Not a live bracket. */
export type BracketNote = {
  id: string;
  round: string;
  name: string;
};

/**
 * A competition the student recorded after the event.
 * `tournamentId` points at a tracked tournament when they picked one.
 * A bracket photo stays on the phone. This record only says whether one exists.
 */
export type CompetitionResult = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  division: string;
  matches: CompetitionMatch[];
  bracket: BracketNote[];
  bracketPhoto: boolean;
};

/** Competition section of a student progress report. Absent on version 1 files until import fills it. */
export type StudentCompetition = {
  games: CompetitionGames;
  tournaments: StudentTournament[];
  weighIns: WeighIn[];
  /** Recorded matches and personal bracket notes. Absent on older files until import fills it. */
  results: CompetitionResult[];
  /** How the chart and new weigh-ins are shown on this device. */
  weightUnit: WeightUnit;
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
  /**
   * Tournaments, the standing A/B/C game, and weigh-ins.
   * Omitted on version 1 files. Import fills it and does not erase a copy already on the device.
   */
  competition?: StudentCompetition;
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

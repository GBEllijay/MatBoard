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
  'redWhite',
  'red',
] as const;

export type ProgressBelt = (typeof PROGRESS_BELTS)[number];

/** Belts with stripes on My rank. Kids belts stay on the profile when a file already has one. */
export const RANK_BELTS = ['white', 'blue', 'purple', 'brown', 'black'] as const;
/** 7th degree (red and black), 8th (red and white), and 9th (solid red). */
export const FINAL_RANK_BELTS = ['coral', 'redWhite', 'red'] as const;
export type FinalRankBelt = (typeof FINAL_RANK_BELTS)[number];
export type RankBelt = (typeof RANK_BELTS)[number] | FinalRankBelt;
/** Four stripe dates. Empty string means that stripe has no date. Slots past the tape count stay empty. */
export type RankTapeDates = [string, string, string, string];
/** Dates for black-belt degrees 5 and 6. Index 0 is the 5th degree. */
export type HighDegreeDates = [string, string];

/** Most tape slots one belt template can carry. IBJJF monthly kids belts use 11. */
export const BELT_TAPE_SLOT_MAX = 16;
/** Classes toward the next kids stripe, until the student changes it. */
export const DEFAULT_CLASSES_PER_TAPE = 8;
export const CLASSES_PER_TAPE_MAX = 40;
/** Custom belt templates stored on the phone. Built-ins stay in code. */
export const BELT_TEMPLATE_MAX = 12;
export const BELT_TEMPLATE_BELTS_MAX = 40;

export const BELT_SYSTEM_MODES = ['adult', 'kids'] as const;
export type BeltSystemMode = (typeof BELT_SYSTEM_MODES)[number];

export const TAPE_GUIDES = ['classes', 'time'] as const;
export type TapeGuide = (typeof TAPE_GUIDES)[number];

export const BELT_CENTERS = ['solid', 'white', 'black'] as const;
export type BeltCenter = (typeof BELT_CENTERS)[number];

/**
 * One belt on a template. Order in the list is the ladder order.
 * `id` stays stable so history can point at it after a rename.
 */
export type BeltTemplateDef = {
  id: string;
  name: string;
  /** Cloth color, #rrggbb. */
  base: string;
  center: BeltCenter;
  /** Optional cloth color for the center bar. Omitted uses white, black, or the base. */
  centerColor?: string;
  /** Name ink. Navy on light cloth, white on dark cloth. */
  ink: 'navy' | 'white';
  /**
   * One color per tape slot. The last slots are the template's choice.
   * IBJJF monthly defaults the last three to black.
   */
  tapeColors: string[];
  /** Advisory only. The app does not hide or block a belt outside this window. */
  ageMin?: number;
  ageMax?: number;
  group?: string;
  /** Optional guide for a later editor. Not enforced. */
  minMonths?: number;
};

/** A custom template saved on the student's file. Built-ins are not copied here. */
export type BeltTemplateRecord = {
  id: string;
  name: string;
  kind: 'custom';
  version: number;
  /** Built-in id this was copied from, when a later editor copies one. */
  baseId?: string;
  ageMode: 'kids' | 'adult' | 'any';
  belts: BeltTemplateDef[];
};

export type KidsBeltHistory = {
  id: string;
  beltId: string;
  awardedOn: string;
  tapeCount: number;
  tapeDates: string[];
};

/** Kids belt the student wears. Adult stripes and degrees stay on `StudentRank`. */
export type KidsBeltRank = {
  beltId: string;
  awardedOn: string;
  tapeCount: number;
  tapeDates: string[];
  history: KidsBeltHistory[];
  /** Classes logged toward the next tape. Logging a class does not award a tape. */
  classCount: number;
};

/**
 * Which ladder My rank shows.
 * Older files omit this. Adult is the default, and adult stripes stay on `rank`.
 * Kids progress stays here when the student switches back to adult.
 */
export type BeltBook = {
  mode?: BeltSystemMode;
  /** `adult-ibjjf@1`, `kids-ibjjf@1`, or a custom template id. */
  templateId?: string;
  /** Kids template to open again after a switch back to adult. */
  kidsTemplateId?: string;
  /** Calendar year of birth. IBJJF age is the current year minus this year. */
  birthYear?: number;
  /** Classes suggested per tape. Default 8 when omitted. */
  classesPerTape?: number;
  /** How the student tracks the next tape. Default is classes. */
  guide?: TapeGuide;
  kids?: KidsBeltRank;
  /** Custom templates for a later editor. Reorder by array order. */
  templates?: BeltTemplateRecord[];
};

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

/** How often a calendar event repeats. Omitted on older events, which happen once. */
export const CALENDAR_REPEATS = ['none', 'weekly', 'biweekly', 'monthly'] as const;
export type CalendarRepeat = (typeof CALENDAR_REPEATS)[number];

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
/** Earlier belts kept on My rank. */
export const PROGRESS_RANK_HISTORY_MAX = 40;
/** Stripe slots on white through brown. The file stores this as tape count, not a stripes key. */
export const RANK_TAPE_MAX = 4;
/**
 * Degrees on a black belt, stored in the same tape count.
 * A saved count of 0 to 4 is that degree. Degrees 5 and 6 are newer.
 */
export const BLACK_DEGREE_MAX = 6;
/** Instructor, their instructor, and so on. */
export const PROGRESS_LINEAGE_MAX = 16;
/** One compressed promotion photo. */
export const RANK_PHOTO_MAX_CHARS = 48_000;
/** Promotion photos included in one export, measured in characters. The rest stay on the phone. */
export const RANK_EXPORT_BUDGET = 180_000;
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

/** Who wrote a checkpoint. Absent on older files, which means the student. */
export type CheckpointSource = 'own' | 'coach';

/**
 * A checkpoint between levels. The student marks it met.
 * `source` is `coach` when a later coach template sent it. Absent means the student.
 * `edited` is set when the student changes a coach checkpoint they are allowed to edit.
 */
export type RubricCheckpoint = {
  id: string;
  name: string;
  met: boolean | null;
  note: string;
  criteria: RubricCriterion[];
  source?: CheckpointSource;
  edited?: boolean;
};

/** One level on the rubric. Checkpoints are the steps inside it. */
export type RubricLevel = {
  id: string;
  name: string;
  belt: ProgressBelt;
  checkpoints: RubricCheckpoint[];
};

/**
 * The student's rubric.
 * `studentsCanEdit` is the template lock for coach checkpoints.
 * Absent or true: a student who bought Student Edition can edit every checkpoint.
 * False: coach-sourced checkpoints stay read-only. Own checkpoints stay editable.
 * The coach template builder is not in this build.
 */
export type StudentRubric = {
  id: string;
  levels: RubricLevel[];
  studentsCanEdit?: boolean;
};

/**
 * A goal the student owns. Coach files do not write these.
 * Goals never change a belt, a stripe, or a degree.
 * `belt` is the stage the goal was added on. Absent on older goals, which stay visible.
 */
export type StudentGoal = {
  id: string;
  name: string;
  note: string;
  met: boolean | null;
  belt?: ProgressBelt;
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
 * `level` is proficiency from 0 (not started) through 5 (can teach it).
 * Older files omit it. A saved learned date means level 3. No date means 0.
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
  /** 0 Not started, 1 Introduced, 2 Drilling, 3 Live with resistance, 4 Hitting in rolls, 5 Can teach it. */
  level: 0 | 1 | 2 | 3 | 4 | 5;
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
 * A Video Library link. Older files stored these as journal clips.
 * Absent on older files. An empty list means the library is present and empty.
 * `note` is the free-text field under the link. Missing on older clips, read as empty.
 */
export type JournalClip = {
  id: string;
  url: string;
  description: string;
  note: string;
  createdAt: number;
  updatedAt: number;
};

export type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  kind: CalendarKind;
  note: string;
  /**
   * 24-hour HH:MM. Omitted on older events and when the student left the time blank.
   * A missing time is not a midnight event.
   */
  time?: string;
  /**
   * Omitted on older events and when the event does not repeat.
   * `weekly`, `biweekly` (every 2 weeks), or `monthly` from `date`.
   */
  repeat?: Exclude<CalendarRepeat, 'none'>;
  /**
   * Set when this event is the calendar copy of one competition tournament.
   * Omitted on classes, open mats, promotion tests, and older files.
   */
  tournamentId?: string;
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
 * Competitor, Calendar, and Results share this list.
 * Calendar keeps one linked event (kind `other`) for the day, time, and repeat.
 */
export type StudentTournament = {
  id: string;
  name: string;
  /** Event day, YYYY-MM-DD. */
  date: string;
  location: string;
  /**
   * Age group, belt, and gi, in the student's words.
   * Files saved before weight class was its own field may still hold both here.
   * Import splits a usual weight class from the end, with or without a slash:
   * "Adult / Feather" and "Adult Black Medium Heavy".
   * A phrase that is not a division plus a weight class stays here whole.
   */
  division: string;
  /**
   * Weight class, in the student's words.
   * Omitted on older files. An empty string means the student left it blank.
   */
  weightClass?: string;
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
  /**
   * YYYY-MM-DD the match happened. Omitted on older matches.
   * A new match defaults to the day it is saved. A missing date is not today.
   */
  date?: string;
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

/**
 * One earlier belt. Written when the student changes the belt they wear
 * and that belt already had a date, a stripe, or instructor bars.
 * The same promotion is one row: belt, stripe or degree count, and awarded date.
 * Selecting that belt again restores the row instead of logging another.
 */
export type RankHistory = {
  id: string;
  belt: RankBelt;
  /** YYYY-MM-DD, or empty. */
  awardedOn: string;
  tapeCount: number;
  tapeDates: RankTapeDates;
  /** Black-belt degrees 5 and 6. Omitted on older rows and on colored belts. */
  highDegreeDates?: HighDegreeDates;
  /** Optional instructor bars copied with a black belt. Not a rank. Omitted when off. */
  instructorBars?: boolean;
  /** YYYY-MM-DD instructor bars were awarded, or omitted. */
  instructorBarsOn?: string;
};

/**
 * One promotion photo in an export.
 * `tapeIndex` is 0 to 3 for a stripe, or 0 to 5 for a black-belt degree. Omitted for a belt photo.
 */
export type RankPicture = {
  belt: RankBelt;
  tapeIndex?: number;
  image: string;
};

/**
 * Stripes and dates for the belt on `profile.belt`.
 * Optional. Older files omit it. `tapeCount` is 0 to 4 stripes.
 * On a black belt the same count is the degree, 0 to 6. A saved 0 to 4 stays that degree.
 * This object does not use a stripe, stripes, or levelKey field.
 */
export type StudentRank = {
  tapeCount: number;
  /** YYYY-MM-DD the student got the current belt, or empty. */
  awardedOn: string;
  tapeDates: RankTapeDates;
  /** Dates for degrees 5 and 6. Omitted on older files and when the degree is 0 to 4. */
  highDegreeDates?: HighDegreeDates;
  /**
   * Optional instructor bars on a black belt. Some schools award them at about 2 years.
   * Not a degree and not a rank. Omitted on older files and when the student leaves them off.
   */
  instructorBars?: boolean;
  /** YYYY-MM-DD instructor bars were awarded, or omitted when blank. */
  instructorBarsOn?: string;
  history: RankHistory[];
  /**
   * Instructor lineage, one person per entry. The first is the student's instructor.
   * An older file may store the whole list as one newline-separated string.
   * Import splits that string and keeps every name.
   * Absent on older files. An empty list is a lineage the student cleared.
   */
  lineage?: string[];
  /**
   * One optional note per degree, index 0 through 9.
   * 0 is plain black. 1 to 6 are black-belt degrees. 7 is coral, 8 is red and white, 9 is red.
   * A note is not a checklist and does not change a degree. Absent on older files.
   */
  degreeFocus?: string[];
  /**
   * Compressed promotion photos. Present on an export when they fit.
   * The copy on the phone keeps the images in local storage, not in this field.
   */
  pictures?: RankPicture[];
  /** Set when one or more promotion photos were left out of the export. */
  pictureNote?: string;
  /** How many promotion photos the export kept. */
  pictureCount?: number;
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
  /**
   * Goal weight for the chart. Null or absent when unset.
   * Stored in `goalUnit`. Older files omit it.
   */
  goalWeight?: number | null;
  /** Unit `goalWeight` was saved in. Absent means pounds. */
  goalUnit?: WeightUnit;
  /**
   * Competition weigh-in day for the countdown, YYYY-MM-DD.
   * Empty or absent when the student has not set one.
   * The chart then counts down to the next tournament date.
   */
  weighDate?: string;
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
  /**
   * My rank: stripes and promotion dates for `profile.belt`.
   * Omitted on older files. Import does not erase a rank already on the device.
   */
  rank?: StudentRank;
  /**
   * Adult or kids belt ladder. Omitted on older files, which stay on the adult ladder.
   * Switching ladders does not erase the other one.
   */
  beltBook?: BeltBook;
};

/**
 * Gym name and optional logo carried in a coach file.
 * Older files omit this. A student can replace or remove the logo after import.
 */
export type CoachGymBrand = {
  name: string;
  /** Downscaled data URL. Absent when the file has no logo. */
  logo?: string;
};

export type CoachPlanPacket = PacketBase & {
  kind: 'coach-plan';
  plan: CoachPlan;
  /** Optional. Absent on files written before gym branding. */
  gym?: CoachGymBrand;
};

export type CoachFeedbackPacket = PacketBase & {
  kind: 'coach-feedback';
  feedback: CoachFeedback;
  /** Optional. Absent on files written before gym branding. */
  gym?: CoachGymBrand;
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

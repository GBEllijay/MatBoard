/**
 * Isolated Pro-home and Instructor-card preview.
 * Reads live destinations. Does not write journals, ranks, or entitlements.
 */
import { TRAINING_NOTES_LABEL, TECHNIQUE_TREE_LABEL, STUDENT_ROSTER_LABEL } from '../../lib/coachCopy.ts';
import { OPEN_PATH_STUDENT, OPEN_PATH_WHITE } from './ladderPaths.ts';
import {
  COACH_UNLIMITED_PATH,
  COACH_UNLIMITED_TOOLS,
  INSTRUCTOR_COLLAB_HUB_LABEL,
  MATCH_CONTROLLER_PATH,
  MEDIA_CONSOLE_NAME,
  MEDIA_EDITION_MENU,
  PRO_HUBS,
  PRO_INSTRUCTOR_HUB_LABEL,
  ROUND_CONTROLLER_PATH,
  TOURNAMENT_MANAGEMENT_PRO_LABEL,
  withSuiteFrom,
} from '../../lib/productNames.ts';
import { whiteEntryPath } from '../../lib/whiteUnlock.ts';

export const PRO_PREVIEW_PATH = '/preview/pro-home';
export const INSTRUCTOR_CARDS_PREVIEW_PATH = '/preview/instructor-cards';
/** Both suite tools. The match controller does not link to the round timer. */
export const WHITE_HUB_PREVIEW_PATH = '/preview/white-hub';
export const MEDIA_MENU_PREVIEW_PATH = '/preview/media-edition';
export const COACH_CONNECT_PREVIEW_PATH = '/preview/connect-coach';

export const PREVIEW_BANNER =
  'Preview only. Fictional labels. Nothing here is saved, and the live Pro, Instructor, and Media pages are unchanged.';

/** Fictional Media card. Not the instructor sheet and not read from this phone. */
export const MEDIA_EXAMPLE = {
  name: 'Example Media operator (fictional)',
  gym: 'Example Academy (fictional)',
  role: 'Media Edition',
} as const;

/** Student rung on the edition ladder. The blue belt on the shortcut is an accent, not a rank. */
export const JOURNAL_DESTINATION = OPEN_PATH_STUDENT;

/**
 * Scoreboard picker that already lists every skin this browser may use.
 * `from=suite` is the existing board that is not the plain Mock-Tournament-only Live Bout.
 */
export const SKINS_SCOREBOARD = withSuiteFrom(MATCH_CONTROLLER_PATH, true);

/** Round timer opened from that same suite. Timer skins follow the Media door, not a second catalog. */
export const SKINS_TIMER = withSuiteFrom(ROUND_CONTROLLER_PATH, true);

export const MEDIA_PREVIEW_LABEL = 'Advantage Media Edition';

export type HubBelt = 'white' | 'blue' | 'purple' | 'brown' | 'black' | 'tournament';

export type PreviewHub = {
  title: string;
  to: string;
  belt: HubBelt;
  note?: string;
  whitePath?: 'button' | 'ladder' | 'menu';
};

/** The four live Pro hubs, cream tiles, original titles. */
export function referenceProHubs(): PreviewHub[] {
  return PRO_HUBS.map((hub) => ({ title: hub.title, to: hub.to, belt: hub.belt }));
}

/**
 * Preview order: White, then the personal journal, then the purple hub
 * retitled Advantage Media Edition, then the other three hubs unchanged.
 */
export function previewProHubs(): PreviewHub[] {
  const [media, ...rest] = referenceProHubs();
  return [
    {
      title: 'White',
      to: WHITE_HUB_PREVIEW_PATH,
      belt: 'white',
      note: 'Scoreboard and round timer. Opens both skins-enabled suite tools.',
      whitePath: 'button',
    },
    {
      title: 'Student Edition',
      to: JOURNAL_DESTINATION,
      belt: 'blue',
      note: 'Personal journal for the academy owner. Opens /student. Not the roster and not the academy profile.',
    },
    { ...media, title: MEDIA_PREVIEW_LABEL },
    ...rest,
  ];
}

/** The three White entries this preview sends to the same White hub. */
export function previewWhitePaths(): { id: 'button' | 'ladder' | 'menu'; label: string; to: string }[] {
  return [
    { id: 'button', label: 'White button', to: WHITE_HUB_PREVIEW_PATH },
    { id: 'ladder', label: 'Edition ladder White', to: WHITE_HUB_PREVIEW_PATH },
    { id: 'menu', label: 'White menu Scoreboard', to: WHITE_HUB_PREVIEW_PATH },
  ];
}

/** Scoreboard and round timer already used by the suite. The hub only links to them. */
export function whiteHubTools(): { title: string; to: string; note: string }[] {
  return [
    { title: 'Scoreboard', to: SKINS_SCOREBOARD, note: 'Match controller. from=suite keeps the skins-enabled board.' },
    { title: 'Round Timer', to: SKINS_TIMER, note: 'Rounds controller. Same from=suite context.' },
  ];
}

/**
 * Where those three controls go in the live app today.
 * They are not the same URL, and only the suite scoreboard is the all-skins picker.
 */
export function productionWhitePaths(): { id: string; label: string; to: string }[] {
  return [
    { id: 'ladder', label: 'Edition ladder White', to: OPEN_PATH_WHITE },
    { id: 'button', label: 'Products White button, unlocked', to: whiteEntryPath(true) },
    { id: 'menu', label: 'White page Scoreboard', to: '/match' },
  ];
}

export function productionWhitePathsDiffer(): boolean {
  const live = productionWhitePaths().map((path) => path.to);
  return new Set(live).size !== 1 || live[0] !== SKINS_SCOREBOARD;
}

export const PRODUCTION_WHITE_GAP = [
  'Edition ladder White and the unlocked products White button open /white.',
  'The White page Scoreboard opens /match, and its Controller opens /match/control. Without from=suite that board is the plain Live Bout: Mock-Tournament only when any higher tier is open.',
  'Instructor Scoreboard opens /match/control?from=unlimited. That is also a plain board unless a bracket bout is linked.',
  'The skins-enabled scoreboard picker already exists at /match/control?from=suite. The suite round timer is /training/control?from=suite.',
  'The suite scoreboard page does not link to the round timer. Back from it opens the competition suite, not a White hub.',
  'This preview points its three White controls at /preview/white-hub. That hub links to the two existing suite URLs. Live links were not rewired.',
] as const;

export type InstructorCard = {
  title: string;
  to: string;
  note: string;
  mark: 'plan' | 'video' | 'tree' | 'roster' | 'record' | 'board' | 'timer';
};

const INSTRUCTOR_NOTES: Record<string, { note: string; mark: InstructorCard['mark'] }> = {
  [TRAINING_NOTES_LABEL]: { note: 'Today’s class on this phone.', mark: 'plan' },
  'Daily Training Videos': { note: 'Warm-up, technique, and cool-down clips.', mark: 'video' },
  [TECHNIQUE_TREE_LABEL]: { note: 'Positions, branches, and counters.', mark: 'tree' },
  [STUDENT_ROSTER_LABEL]: { note: 'Names and belts on this phone.', mark: 'roster' },
  'Record for Review': { note: 'Film a move for later.', mark: 'record' },
  Scoreboard: { note: 'Match controller. Back returns to Instructor.', mark: 'board' },
  'Round Timer': { note: 'Rounds controller. Back returns to Instructor.', mark: 'timer' },
};

/** Same seven tools and destinations as Coach Unlimited. No belt rail in this concept. */
export type MediaPreviewCard = {
  title: string;
  to: string;
  note: string;
  mark: 'board' | 'timer' | 'console';
};

/** Same three Media Edition destinations and subtitles. No belt rail in this concept. */
export function mediaPreviewCards(): MediaPreviewCard[] {
  const marks = ['board', 'timer', 'console'] as const;
  return MEDIA_EDITION_MENU.map((link, index) => ({
    title: link.title,
    to: link.to,
    note: link.sub ?? '',
    mark: marks[index] ?? 'console',
  }));
}

/** Personal journal. One card, the existing /student page. Not a roster. */
export function mediaStudentCard(): { title: string; to: string; note: string } {
  return {
    title: 'Student Edition / My Journal',
    to: JOURNAL_DESTINATION,
    note: 'Personal journal. Basic skins. Same page as the Pro Student Edition button.',
  };
}

/** Preview decisions only. Live one-time prices and Stripe prices stay where they are. */
export const PREVIEW_STUDENT_PRICE = '$2.99/month';
export const PREVIEW_MEDIA_PLUS_PRICE = '$2.99/month';
export const PREVIEW_INSTRUCTOR_PRICE = '$5.99/month';

export const PREVIEW_PRICE_NOTE =
  'Preview pricing decision. Not live billing. Nothing is charged. These figures do not replace the one-time prices on the edition ladder.';

export const PREVIEW_MEDIA_PLUS_SCOPE = [
  'Cloudflare-hosted Pro Shop images',
  'promotions',
  'belt promotions',
  'media console access',
] as const;

export const PREVIEW_DRIVE_NOTE =
  'Google Drive stays an optional alternative. MediaPlus does not pay a Google bill. Hosted storage means this person does not need to pay for or configure Google Drive.';

/**
 * Preview proposal only. Not enforced.
 * R2 Standard, https://developers.cloudflare.com/r2/pricing/ (page updated 30 Oct 2026):
 * storage $0.015/GB-month, Class A $4.50/million, Class B $0.36/million, egress $0.
 * 5 GB-month of storage is $0.075 at that rate, before Cloudflare's rounding.
 * Reads, writes, and any image or video processing are separate costs.
 */
export const PREVIEW_MEDIA_PLUS_STORED_GB = 5;
export const PREVIEW_QUOTA_LINE = 'Preview proposal: 5 GB stored on our cloud. Not enforced.';
export const PREVIEW_QUOTA_WHY =
  'The 5 GB figure is for images and short TV clips, not class-length video. At Cloudflare R2 Standard, published 30 Oct 2026, storage is $0.015 per GB-month, so 5 GB-month is $0.075 before rounding. Class A writes are $4.50 per million and Class B reads are $0.36 per million. Egress is $0. Those request costs are not included in the stored-GB figure. Image transforms and video processing are not included either. This is not a promise of profit or of unlimited streaming.';

export const PREVIEW_OWN_DRIVE_NOTE =
  'An instructor can use their own Google Drive, or a similar drive, to pass files with students on their roster. MediaPlus is not required. The provider account and its permission costs belong to that person. This preview does not open a drive. The live app can hand a coach file for a student to import. That is not a live two-way folder.';

export const PREVIEW_COACH_STUDENT_NAME = 'Example Student (fictional)';

export const PREVIEW_SKINS_NOTE =
  'Student Edition keeps basic skins. A Media upgrade adds the additional and advanced skins. This preview does not change live skin access.';

export const PREVIEW_INSTRUCTOR_PRICE_NOTE =
  'Instructor Edition $5.99/month is for heavier video traffic. No annual price is set in this preview.';

export function instructorConceptCards(): InstructorCard[] {
  return COACH_UNLIMITED_TOOLS.map((tool) => {
    const extra = INSTRUCTOR_NOTES[tool.title];
    return {
      title: tool.title,
      to: tool.to,
      note: extra?.note ?? tool.title,
      mark: extra?.mark ?? 'plan',
    };
  });
}

export const PRESERVED_PRO_ACCENTS = [
  { title: MEDIA_CONSOLE_NAME, previewTitle: MEDIA_PREVIEW_LABEL, belt: 'purple', to: PRO_HUBS[0].to },
  { title: PRO_INSTRUCTOR_HUB_LABEL, belt: 'brown', to: COACH_UNLIMITED_PATH },
  { title: INSTRUCTOR_COLLAB_HUB_LABEL, belt: 'black', to: '/instructors' },
  { title: TOURNAMENT_MANAGEMENT_PRO_LABEL, belt: 'tournament', to: '/suite' },
] as const;

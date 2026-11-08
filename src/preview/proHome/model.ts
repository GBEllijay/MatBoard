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
  PRO_HUBS,
  PRO_INSTRUCTOR_HUB_LABEL,
  ROUND_CONTROLLER_PATH,
  TOURNAMENT_MANAGEMENT_PRO_LABEL,
  withSuiteFrom,
} from '../../lib/productNames.ts';
import { whiteEntryPath } from '../../lib/whiteUnlock.ts';

export const PRO_PREVIEW_PATH = '/preview/pro-home';
export const INSTRUCTOR_CARDS_PREVIEW_PATH = '/preview/instructor-cards';

export const PREVIEW_BANNER =
  'Preview only. Fictional labels. Nothing here is saved, and the live Pro and Instructor pages are unchanged.';

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
      to: SKINS_SCOREBOARD,
      belt: 'white',
      note: 'Scoreboard and round timer. Opens the skins-enabled scoreboard.',
      whitePath: 'button',
    },
    {
      title: 'Student Edition',
      to: JOURNAL_DESTINATION,
      belt: 'blue',
      note: 'Personal journal. Same destination as the Student rung on the edition ladder. The blue belt is an accent, not a rank change.',
    },
    { ...media, title: MEDIA_PREVIEW_LABEL },
    ...rest,
  ];
}

/** The three White entries this preview sends to one skins-enabled scoreboard. */
export function previewWhitePaths(): { id: 'button' | 'ladder' | 'menu'; label: string; to: string }[] {
  return [
    { id: 'button', label: 'White button', to: SKINS_SCOREBOARD },
    { id: 'ladder', label: 'Edition ladder White', to: SKINS_SCOREBOARD },
    { id: 'menu', label: 'White menu Scoreboard', to: SKINS_SCOREBOARD },
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
  'This preview points its three White controls at that scoreboard. Live links were not rewired.',
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

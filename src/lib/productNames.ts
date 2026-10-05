import { CURRICULUM_LABEL, CURRICULUM_PATH } from './competitionCurriculum.ts';
import { TECHNIQUE_TREE_LABEL, TRAINING_NOTES_LABEL } from './coachCopy.ts';

/** User-facing Advantage Pro console name. Keep this exact apostrophe. */
export const GYM_CONSOLE_NAME = "Gym Owner and Instructor's Console";

/** Home ladder and White hub line after “White —”. */
export const WHITE_LADDER_DETAIL = 'BJJ scoreboard and timer, live match and rounds';

/** Home White card body. The only line under the Advantage White title. */
export const WHITE_HOME_DESCRIPTION =
  'BJJ scoreboard and round timer for live matches and rounds. Display stays on the TV, the controller stays in your hand.';

/** Home Coach card body. The only line under the Advantage Coach title. */
export const COACH_HOME_DESCRIPTION =
  'Daily Lesson Planner with Expandable Technique Trees and Video Looper. Bracketing and Mock Tournament Tool with Competitor Roster.';

/** Line under the black Advantage - PRO belt. Not the Owner Console page title. */
export const PRO_LADDER_DETAIL = 'Gym Owner and Instructors Console';

/** Brand line under the Advantage title on the public home page. */
export const HOME_MOTTO = 'Win by Advantage';

/**
 * Coming Soon ad lead for Pro. Not the homepage card.
 * The homepage button uses PRO_HOME_LINES and does not say Coming Soon.
 */
export const PRO_HOME_DETAIL = `${GYM_CONSOLE_NAME} — Coming Soon`;

/** Home Pro card body, one paragraph per line under Advantage Pro. */
export const PRO_HOME_LINES = [
  "Gym Owner and Instructor's Console",
  'Easily cast class schedules, pro shop inventory, events, recent promotions, and more to your gym TV.',
  'Coordinate and create In-House Tournaments in moments and track the results for review and ranking.',
  'Provide your instructors with access to our collaborative coaching tools and give your gym the ultimate Advantage!',
] as const;

/**
 * Longer Pro appetite copy. Not on the home card and not in the Pro splash.
 * The splash keeps the image and the descriptor boxes.
 */
export const PRO_COMING_SOON_LINES = [
  'Easily Cast to your Gym TV with Media Console: Class Schedules, Recent Promotions, ProShop Inventory, Upcoming Events and Competitions.',
  'Full In-House Tournament Management Suite with Auto-Fill Bracketing and Result Tracking.',
  'Assignable Instructor Licenses with Cross Platform Access to Updates, Shared Training Videos and More.',
] as const;

/** Coach hub keeps practice framing; Owner Console uses real-event tooling. */
export const MOCK_TOURNAMENT_NAME = 'Mock Tournament';

/** Advantage Coach hub. Opens Competitor Management System and Mock Tournament. */
export const COMPETITION_MANAGEMENT_LABEL = 'Competition Team Management';

/** Coach competition folder for bout competitors, roster CSV, and on-device rankings. */
export const COMPETITOR_SYSTEM_NAME = 'Competitor Management System';

/** Advantage Coach folder for the daily practice tools. */
export const COACHING_TOOLS_LABEL = 'Coaching Tools';

/** Coaching Tools folder. Same navigation style as Competition Team Management. */
export const COACHING_TOOLS_PATH = '/coaching-tools';

/**
 * Short line on the Coaching Tools folder.
 * Names what is inside, the way Live Bout names Match Timer & Scoreboard.
 */
export const COACHING_TOOLS_DETAIL =
  'Daily Lesson Plan, Daily Training Videos, and Technique Tree.';

/** One line under that, in the same voice as the Live Bout card body. */
export const COACHING_TOOLS_LEAD =
  "Write today's class, loop training clips, and build a technique tree.";

/**
 * Basic Coaching Tools, top to bottom.
 * Competition Class Curriculum is not on basic Coach.
 */
export const COACHING_TOOLS_MENU = [
  { title: TRAINING_NOTES_LABEL, to: '/notes', belt: 'coach' as const },
  { title: 'Daily Training Videos', to: '/techniques', belt: 'coach' as const },
  { title: TECHNIQUE_TREE_LABEL, to: '/technique-tree', belt: 'coach' as const },
] as const;

/** Basic Coach student list. Same on-phone roster store, student wording, no photo. */
export const STUDENT_ROSTER_PATH = '/roster?from=students';

/**
 * Basic Advantage Coach page, top to bottom.
 * No Coaching Tools folder and no Competition Team Management.
 */
export const COACH_HUBS = [
  { title: TRAINING_NOTES_LABEL, to: '/notes', belt: 'coach' as const },
  { title: 'Daily Training Videos', to: '/techniques', belt: 'coach' as const },
  { title: TECHNIQUE_TREE_LABEL, to: '/technique-tree', belt: 'coach' as const },
  { title: 'Student Roster', to: STUDENT_ROSTER_PATH, belt: 'coach' as const },
  { title: MOCK_TOURNAMENT_NAME, to: '/tournament?from=coach', belt: 'tournament' as const },
] as const;

/**
 * Limited Coach opens `/notes` with no plan flag.
 * Advantage Coach Unlimited opens the same page with this flag so upload and
 * teammate video download stay off the limited lesson plan.
 */
export const UNLIMITED_LESSON_VALUE = 'unlimited';
export const UNLIMITED_LESSON_PATH = `/notes?plan=${UNLIMITED_LESSON_VALUE}`;
export const COACH_UNLIMITED_PATH = '/coach-unlimited';

/** Unlimited opens Daily Lesson Plan on the Unlimited plan. Basic keeps `/notes`. */
export function coachingToolsMenu(unlimited: boolean) {
  if (!unlimited) return COACHING_TOOLS_MENU;
  return COACHING_TOOLS_MENU.map((tool) =>
    tool.to === '/notes' ? { ...tool, to: UNLIMITED_LESSON_PATH } : tool,
  );
}

/**
 * Advantage Coach Unlimited menu, top to bottom.
 * Daily Lesson Plan is the Unlimited plan that can be uploaded for review.
 * Sunday review and Drive cards stay on the page, under this menu.
 */
export const COACH_UNLIMITED_TOOLS = [
  { title: TRAINING_NOTES_LABEL, to: UNLIMITED_LESSON_PATH, belt: 'brown' as const },
  { title: 'Daily Training Videos', to: '/techniques', belt: 'brown' as const },
  { title: TECHNIQUE_TREE_LABEL, to: '/technique-tree', belt: 'brown' as const },
  {
    title: CURRICULUM_LABEL,
    to: `${CURRICULUM_PATH}?plan=${UNLIMITED_LESSON_VALUE}`,
    belt: 'tournament' as const,
  },
] as const;

/**
 * Competition Team Management submenu.
 * CMS, then Mock Tournament, then two shortcuts into screens that already exist.
 * Scoreboard opens the match controller (`/match/control`). With Coach unlocked,
 * that controller's name fields use the full Competitor Roster. It is not the
 * plain White display at `/match`. Round Timer opens the same White rounds
 * timer at `/training`.
 */
export const COMPETITION_MENU = [
  { title: COMPETITOR_SYSTEM_NAME, to: '/competitors', belt: 'tournament' as const },
  { title: MOCK_TOURNAMENT_NAME, to: '/tournament', belt: 'tournament' as const },
  { title: 'Scoreboard', to: '/match/control', belt: 'tournament' as const, clearBout: true as const },
  { title: 'Round Timer', to: '/training', belt: 'tournament' as const },
] as const;

/**
 * Reserved for later Advantage Pro competition tools (ready checklists, game plans,
 * rankings, seeding). Empty on purpose — do not render placeholder buttons.
 * Bout and bracket competitors only, not member progress tracking.
 */
export const COMPETITION_MENU_PRO: readonly {
  title: string;
  to: string;
  belt: 'tournament';
}[] = [];

export const TOURNAMENT_SOFTWARE_NAME = 'Tournament Software';

/** Working title kept for longer appetite copy. Not the Pro hub button or Suite heading. */
export const TOURNAMENT_SUITE_NAME = 'In-House Tournament Management Suite';

/**
 * Fourth Advantage Pro hub button and the heading on the page it opens.
 * The Coming Soon ad keeps COMPETITION_MANAGEMENT_PRO_LABEL.
 */
export const TOURNAMENT_MANAGEMENT_PRO_LABEL = 'Tournament Management Pro';

/**
 * Lead under that heading. Rankings stay on Competitor Management System.
 */
export const TOURNAMENT_MANAGEMENT_PRO_LEAD =
  'Pro Version of Tournament Brackets, Scoreboard and Round Timer - Additional Skins and Animations Included. Rankings stay in Competitor Management System.';

/** Coming Soon ad feature title. Not the Pro hub button or the Suite page heading. */
export const COMPETITION_MANAGEMENT_PRO_LABEL = 'Competition Management Pro';

/** Owner invite page. Access only — Unlimited tools live on Advantage Coach Unlimited. */
export const INSTRUCTOR_COLLAB_NAME = 'Instructor Invitation and Access Management';

/** Pro homepage hub button. Same name as the invite page title. */
export const INSTRUCTOR_COLLAB_HUB_LABEL = 'Instructor Invitation and Access Management';

/** Pro hub that replaced Competitor Management System. Opens Unlimited tools. */
export const INSTRUCTOR_COACH_ENTRY = 'Advantage Coach Unlimited';

/** Pro gym-TV cast hub. Same screen Gallery opens. Not a rename of the Owner Console. */
export const MEDIA_CONSOLE_NAME = 'Media Console';

/**
 * Unlocked Pro console, top to bottom.
 * Belt accent matches the left rail on each hub.
 */
export const PRO_HUBS = [
  { title: MEDIA_CONSOLE_NAME, to: '/slideshow?folder=gallery', belt: 'purple' },
  { title: INSTRUCTOR_COACH_ENTRY, to: COACH_UNLIMITED_PATH, belt: 'brown' },
  { title: INSTRUCTOR_COLLAB_HUB_LABEL, to: '/instructors', belt: 'black' },
  { title: TOURNAMENT_MANAGEMENT_PRO_LABEL, to: '/suite', belt: 'tournament' },
] as const;

/** Existing scoreboard controller. Competition Management Pro opens this; Display stays on that screen. */
export const MATCH_CONTROLLER_PATH = '/match/control';

/** Existing round-timer controller. Competition Management Pro opens this; Rounds stays on that screen. */
export const ROUND_CONTROLLER_PATH = '/training/control';

/** Query flag so Suite destinations keep the Suite page theme and return path. */
export const SUITE_FROM = 'suite';

/** Plain Mock Tournament opened from the Advantage Coach page. */
export const COACH_BOARD_FROM = 'coach';

/**
 * Basic Coach Mock Tournament, including when Pro is also unlocked and the
 * board was opened from the Coach page. Suite brackets stay the Pro board.
 */
export function isPlainCoachTournament(from: string | null, basicCoach: boolean): boolean {
  if (from === SUITE_FROM) return false;
  return from === COACH_BOARD_FROM || basicCoach;
}

/** Keep `from=suite` on links opened from the Suite hub. Other callers stay unchanged. */
export function withSuiteFrom(path: string, fromSuite: boolean): string {
  if (!fromSuite) return path;
  const hashAt = path.indexOf('#');
  const hash = hashAt >= 0 ? path.slice(hashAt) : '';
  const base = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const queryAt = base.indexOf('?');
  const pathname = queryAt >= 0 ? base.slice(0, queryAt) : base;
  const params = new URLSearchParams(queryAt >= 0 ? base.slice(queryAt + 1) : '');
  params.set('from', SUITE_FROM);
  return `${pathname}?${params.toString()}${hash}`;
}

/**
 * Tournament Management Pro folder, top to bottom.
 * Brackets and Competitor Management System use the yellow/green competition belt.
 * Scoreboard and Round Timer use the black belt. Both stay title-only.
 * Brackets opens the same mock-tournament board.
 * Scoreboard opens the existing match controller. Round Timer opens the existing rounds controller.
 * Competitor Management System opens the existing gold-medal menu.
 */
export const COMPETITION_PRO_MENU = [
  {
    title: 'Brackets-Tournament Software',
    to: withSuiteFrom('/tournament', true),
    belt: 'tournament' as const,
    clearBout: false,
  },
  {
    title: COMPETITOR_SYSTEM_NAME,
    to: '/competitors',
    belt: 'tournament' as const,
    clearBout: false,
  },
  {
    title: 'Scoreboard',
    to: withSuiteFrom(MATCH_CONTROLLER_PATH, true),
    belt: 'black' as const,
    clearBout: true,
  },
  {
    title: 'Round Timer',
    to: withSuiteFrom(ROUND_CONTROLLER_PATH, true),
    belt: 'black' as const,
    clearBout: false,
  },
] as const;

/** Bottom-of-page guidance on the Media Console manage screen. */
export const MEDIA_CONSOLE_INSTRUCTIONS = [
  'Gold On means that folder plays on the TV.',
  'Add photos still uses Google Photos or this phone. Google Drive is an extra source.',
  'Tap the left preview on a photo or video to include or skip it. Checked and bright is On. Dimmed is Off.',
  'Off items stay in the list and keep their order.',
  'One On clip loops alone. Several play in list order.',
  'Enabled folders play Gallery, then Pro Shop, then Events.',
  'Class Schedule casts the full week or month after Gallery, before Pro Shop.',
  'Turn Class Schedule Off to keep Gallery, Pro Shop, and Events.',
  'Add class schedule opens the editor. Export a CSV backup before clearing site data.',
  'Photos use the Photo interval. Videos play all the way through, then the next item.',
  'Clips stay muted unless Play video sound is on, so gym music in another tab can keep going.',
  'Shuffle randomizes that combined queue.',
  'Pro Shop: add a photo, a name, and a buy link. The TV builds a QR from that link.',
  'Same slide groups cards on one page. Each card on that page keeps its own QR.',
  'Pro Shop display: Images only, Images + QR, or Images + QR + gym logo.',
  'Pro Shop photos and buy links stay on this device. Nothing is uploaded.',
  'Events: add a photo, a name, and optional QR links. The gym logo stays left of those codes.',
  'One event photo can hold several links: registration, brackets, or tickets.',
  'Events display: Images only, Images + QR, or Images + QR + gym logo.',
  'Events photos and QR links stay on this device. Nothing is uploaded.',
] as const;

export function parentToolboxPath(
  proUnlocked: boolean,
  coachUnlocked: boolean,
  seated = false,
): string {
  if (proUnlocked) return '/pro';
  if (coachUnlocked || seated) return '/coach';
  return '/';
}

export function toolEyebrow(proUnlocked: boolean, coachUnlocked: boolean, seated = false): string {
  if (proUnlocked) return GYM_CONSOLE_NAME;
  if (coachUnlocked || seated) return 'Advantage Coach';
  return GYM_CONSOLE_NAME;
}

/** Owner Console label; Coach keeps Mock Tournament when Pro is off. */
export function tournamentToolLabel(proUnlocked: boolean): string {
  return proUnlocked ? TOURNAMENT_SOFTWARE_NAME : MOCK_TOURNAMENT_NAME;
}

/** Pro includes Coach tools. Coach-only unlock still opens them on its own. */
export function coachToolsOpen(proUnlocked: boolean, coachUnlocked: boolean): boolean {
  return proUnlocked || coachUnlocked;
}

/**
 * Owner purchase lock for the Pro console.
 * A live instructor seat does not open it.
 */
export function proDoorOpen(proUnlocked: boolean): boolean {
  return proUnlocked;
}

/**
 * Coach tools. The owner purchase lock opens them, and so does a live invite seat.
 * The seat still does not open Pro.
 */
export function coachDoorOpen(
  proUnlocked: boolean,
  coachUnlocked: boolean,
  seated: boolean,
): boolean {
  return coachToolsOpen(proUnlocked, coachUnlocked) || seated;
}

/**
 * Advantage Coach without Pro.
 * Coach Unlimited is a Pro route, so a Pro unlock is not basic Coach.
 */
export function isBasicCoach(proUnlocked: boolean, coachUnlocked: boolean): boolean {
  return coachUnlocked && !proUnlocked;
}

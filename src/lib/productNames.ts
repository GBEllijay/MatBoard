/** User-facing Advantage Pro console name. Keep this exact apostrophe. */
export const GYM_CONSOLE_NAME = "Gym Owner and Instructor's Console";

/** Home ladder and White hub line after “White —”. */
export const WHITE_LADDER_DETAIL = 'BJJ scoreboard and timer, live match and rounds';

/** Home White card body. The only line under the Advantage White title. */
export const WHITE_HOME_DESCRIPTION =
  'BJJ scoreboard and round timer for live matches and rounds. Display stays on the TV, the controller stays in your hand.';

/** Home Coach card body. The only line under the Advantage Coach title. */
export const COACH_HOME_DESCRIPTION =
  'daily lesson plan, daily training videos, mock tournament, and competitor roster.';

/** Home ladder and Pro hub line after “Pro —”. Not the Owner Console page title. */
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
export const TOURNAMENT_SOFTWARE_NAME = 'Tournament Software';

/** Working title until the owner picks a consumer name for bracketing software. */
export const TOURNAMENT_SUITE_NAME = 'In-House Tournament Management Suite';

/** Pro hub for bout competitors, roster CSV, and on-device rankings. */
export const COMPETITOR_SYSTEM_NAME = 'Competitor Management System';

/** Plan-only Pro hub page title. No cloud sync in this build. */
export const INSTRUCTOR_COLLAB_NAME = 'Instructor Collaboration and Cloud Access';

/** Pro homepage hub button. The instructor page title stays INSTRUCTOR_COLLAB_NAME. */
export const INSTRUCTOR_COLLAB_HUB_LABEL = 'Instructor Collaboration & Advantage Coach Unlimited';

/** Jump from the instructor hub into Advantage Coach. Keep Unlimited in the label. */
export const INSTRUCTOR_COACH_ENTRY = 'Advantage Coach Unlimited';

/** Pro gym-TV cast hub. Same screen Gallery opens. Not a rename of the Owner Console. */
export const MEDIA_CONSOLE_NAME = 'Media Console';

/**
 * Unlocked Pro console, top to bottom.
 * Belt accent matches the left rail on each hub.
 */
export const PRO_HUBS = [
  { title: MEDIA_CONSOLE_NAME, to: '/slideshow?folder=gallery', belt: 'purple' },
  { title: COMPETITOR_SYSTEM_NAME, to: '/competitors', belt: 'brown' },
  { title: INSTRUCTOR_COLLAB_HUB_LABEL, to: '/instructors', belt: 'black' },
  { title: TOURNAMENT_SUITE_NAME, to: '/suite', belt: 'tournament' },
] as const;

/** Existing White Live Bout controller. The suite deep-links here as Match Controller. */
export const MATCH_CONTROLLER_PATH = '/match/control';

/** Existing White Rounds controller. The suite deep-links here as Round Controller. */
export const ROUND_CONTROLLER_PATH = '/training/control';

/** Bottom-of-page guidance on the Media Console manage screen. */
export const MEDIA_CONSOLE_INSTRUCTIONS = [
  'Gold On means that folder plays on the TV.',
  'Tap the left preview on a photo or video to include or skip it. Checked and bright is On. Dimmed is Off.',
  'Off items stay in the list and keep their order.',
  'One On clip loops alone. Several play in list order.',
  'Enabled folders play Gallery, then Pro Shop, then Events.',
  'Class Schedule casts the full week or month after Gallery, before Pro Shop.',
  'Turn Class Schedule off on that row to keep Gallery, Pro Shop, and Events.',
  'Open Class Schedule to edit classes. Export a CSV backup before clearing site data.',
  'Photos use the Photo interval. Videos play all the way through, then the next item.',
  'Clips stay muted unless Play video sound is on, so gym music in another tab can keep going.',
  'Shuffle randomizes that combined queue.',
  'Pro Shop: add a photo, a name, and a buy link. The TV builds a QR from that link.',
  'Same slide groups cards on one page. Each card on that page keeps its own QR.',
  'Pro Shop display: Images only, Images + QR, or Images + QR + gym logo.',
  'Pro Shop photos and buy links stay on this device. Nothing is uploaded.',
  'Events: add a photo, a name, and optional QR links. Codes sit beside that photo.',
  'One event photo can hold several links: registration, brackets, or tickets.',
  'Events display: Images only, Images + QR, or Images + QR + gym logo.',
  'Events photos and QR links stay on this device. Nothing is uploaded.',
] as const;

export function parentToolboxPath(proUnlocked: boolean, coachUnlocked: boolean): string {
  if (proUnlocked) return '/pro';
  if (coachUnlocked) return '/coach';
  return '/';
}

export function toolEyebrow(proUnlocked: boolean, coachUnlocked: boolean): string {
  if (proUnlocked) return GYM_CONSOLE_NAME;
  if (coachUnlocked) return 'Advantage Coach';
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

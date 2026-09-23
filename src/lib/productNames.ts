/** User-facing Advantage Pro console name. Keep this exact apostrophe. */
export const GYM_CONSOLE_NAME = "Gym Owner and Instructor's Console";

/** Home ladder and White hub line after “White —”. */
export const WHITE_LADDER_DETAIL = 'BJJ scoreboard and timer, live match and rounds';

/** Home ladder and Pro hub line after “Pro —”. Not the Owner Console page title. */
export const PRO_LADDER_DETAIL = 'Gym Owner and Instructors Console';

/**
 * Home Pro card line after “Pro —”.
 * Shown to everyone, including while Pro is still Coming Soon.
 */
export const PRO_HOME_DETAIL = `${GYM_CONSOLE_NAME} — Coming Soon`;

/** Home Pro card body. Distinct short lines under the tier title. */
export const PRO_HOME_LINES = [
  'Easily Cast to your Gym TV: Class Schedules, Recent Promotions, ProShop Inventory, Upcoming Events and Competitions.',
  'Full In-House Tournament Management Suite with Auto-Fill Bracketing and Result Tracking.',
  'Assignable Instructor Licenses with Cross Platform Access to Updates, Shared Training Videos and More.',
] as const;

/** Coach hub keeps practice framing; Owner Console uses real-event tooling. */
export const MOCK_TOURNAMENT_NAME = 'Mock Tournament';
export const TOURNAMENT_SOFTWARE_NAME = 'Tournament Software';

/** Working title until the owner picks a consumer name for bracketing software. */
export const TOURNAMENT_SUITE_NAME = 'In-House Tournament Management Suite';

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

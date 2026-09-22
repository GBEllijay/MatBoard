/** User-facing Advantage Pro console name. Keep this exact apostrophe. */
export const GYM_CONSOLE_NAME = "Gym Owner and Instructor's Console";

/** Home ladder and White hub line after “White —”. */
export const WHITE_LADDER_DETAIL = 'BJJ scoreboard and timer, live match and rounds';

/** Home ladder and Pro hub line after “Pro —”. Not the Owner Console page title. */
export const PRO_LADDER_DETAIL = 'Gym Owner and Instructors Console';

/** Coach hub keeps practice framing; Owner Console uses real-event tooling. */
export const MOCK_TOURNAMENT_NAME = 'Mock Tournament';
export const TOURNAMENT_SOFTWARE_NAME = 'Tournament Software';

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

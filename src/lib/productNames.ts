/** User-facing Advantage Pro console name. Keep this exact apostrophe. */
export const GYM_CONSOLE_NAME = "Gym Owner and Instructor's Console";

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

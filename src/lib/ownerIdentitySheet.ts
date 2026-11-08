/**
 * The Owner identity sheet is the Instructor character sheet whose unseated
 * role reads "Owner". It is a Pro page control, not an extra grant.
 * Academy profile (GymCharacterSheet) is separate and stays on the Pro homes.
 */

export type OwnerIdentityPage = 'pro' | 'pro-cloud' | 'instructor' | 'student' | 'media' | 'other';

export function ownerIdentitySheetVisible(input: {
  page: OwnerIdentityPage;
  /** Advantage Pro door. Cloud by itself is not this. */
  proUnlocked: boolean;
  /** A live instructor seat is not the academy owner. */
  seated: boolean;
}): boolean {
  if (input.seated || !input.proUnlocked) return false;
  return input.page === 'pro' || input.page === 'pro-cloud';
}

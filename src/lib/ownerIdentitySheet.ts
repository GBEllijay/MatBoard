/**
 * The painted instructor character sheet now lives only on Instructor Edition
 * (/coach-unlimited). Pro and Pro + Cloud keep the academy GymCharacterSheet
 * and do not mount a second instructor identity card under the cloud usage box.
 * This helper stays so existing callers can keep asking; it is always off.
 */

export type OwnerIdentityPage = 'pro' | 'pro-cloud' | 'instructor' | 'student' | 'media' | 'other';

export function ownerIdentitySheetVisible(_input: {
  page: OwnerIdentityPage;
  /** Advantage Pro door. Cloud by itself is not this. */
  proUnlocked: boolean;
  /** A live instructor seat is not the academy owner. */
  seated: boolean;
}): boolean {
  return false;
}

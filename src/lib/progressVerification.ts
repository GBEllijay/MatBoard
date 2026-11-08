/**
 * Student progress and coach verification stay separate.
 *
 * A student, including a standalone Student Edition purchase, can enter, save,
 * and use their own progress with no coach connected and no coach approval.
 * Unverified records stay usable. Accepting an official coach update is what
 * verifies a record. That review never blocks personal entry.
 * A student's own claim is not an academy-certified result.
 */

export type ProgressVerification = 'self-reported' | 'coach-verified';

/** Personal entry, save, and progression do not wait on a coach. */
export function personalProgressOpen(input?: { coachConnected?: boolean; coachApproved?: boolean }): boolean {
  void input?.coachConnected;
  void input?.coachApproved;
  return true;
}

/** Coach review adds verification only. Declining or never connecting stays self-reported. */
export function verificationAfterCoachReview(acceptedOfficialUpdate: boolean): ProgressVerification {
  return acceptedOfficialUpdate ? 'coach-verified' : 'self-reported';
}

/** Academy totals count coach-verified records only. */
export function countsAsAcademyCertified(verification: ProgressVerification): boolean {
  return verification === 'coach-verified';
}

export const SELF_REPORTED_NOTE = 'Your own record. Not coach-verified, and not an academy result.';

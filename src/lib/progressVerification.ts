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

/** Facts an academy total may use. Pending and self-reported claims are not in this set. */
export type AcademyStatBasis = 'verified' | 'issued' | 'accepted';

export type AcademyStatCandidate = {
  id: string;
  basis: AcademyStatBasis | 'pending' | 'self-reported';
};

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

/** Academy totals count coach-verified records only. A self-report is not certified. */
export function countsAsAcademyCertified(verification: ProgressVerification): boolean {
  return verification === 'coach-verified';
}

/**
 * Academy stats come from verified, issued, and accepted records.
 * The same id is kept once inside a basis. Pending is not accepted.
 * A self-reported claim is not certified.
 */
export function academyStatRows(rows: readonly AcademyStatCandidate[]): AcademyStatCandidate[] {
  const seen = new Set<string>();
  const kept: AcademyStatCandidate[] = [];
  for (const row of rows) {
    if (row.basis !== 'verified' && row.basis !== 'issued' && row.basis !== 'accepted') continue;
    const key = `${row.basis}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(row);
  }
  return kept;
}

export const SELF_REPORTED_NOTE = 'Your own record. Not coach-verified, and not an academy result.';

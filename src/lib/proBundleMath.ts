/** Pro bundle counts. Shared by the phone and the server. Not a Stripe coupon. */

export const FREE_INSTRUCTOR_SEATS = 5;
export const FREE_STUDENT_LICENSES = 5;
export const HALF_OFF_MAX_USES = 100;
export const BUNDLE_CEILING = 105;

export function instructorSeatAllowance(instructorUses = 0): number {
  const uses = Math.max(0, Math.min(HALF_OFF_MAX_USES, Math.floor(Number.isFinite(instructorUses) ? instructorUses : 0)));
  return Math.min(BUNDLE_CEILING, FREE_INSTRUCTOR_SEATS + uses);
}

export function studentLicenseAllowance(studentUses = 0): number {
  const uses = Math.max(0, Math.min(HALF_OFF_MAX_USES, Math.floor(Number.isFinite(studentUses) ? studentUses : 0)));
  return Math.min(BUNDLE_CEILING, FREE_STUDENT_LICENSES + uses);
}

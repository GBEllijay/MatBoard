/** Pro bundle counts. Shared by the phone and the server. Not a Stripe coupon. */

export const FREE_INSTRUCTOR_SEATS = 5;
export const FREE_STUDENT_LICENSES = 5;
/** Student Edition promotion code minted for one Pro academy. */
export const HALF_OFF_MAX_USES = 100;
/** Student Edition promotion code minted for one Instructor Edition license. */
export const INSTRUCTOR_HALF_OFF_MAX_USES = 25;
export const BUNDLE_CEILING = 105;

/**
 * Production owner alpha license. Stripe Pro buyers keep the 5 / 5 free pools.
 * This id is the live Advantage gym license, not a secret.
 */
export const OWNER_ALPHA_LICENSE_ID = 'd134aa49-e5d6-43f8-8a66-5f5bbbf92d99';
/** Owner request: 20 coach seats total on the owner alpha license. */
export const OWNER_FREE_INSTRUCTOR_SEATS = 20;
/** Owner request: 20 more free Student Edition licenses than the Pro base of 5. */
export const OWNER_FREE_STUDENT_LICENSES = 25;

export function freeInstructorSeatsForLicense(licenseId?: string | null): number {
  return licenseId === OWNER_ALPHA_LICENSE_ID ? OWNER_FREE_INSTRUCTOR_SEATS : FREE_INSTRUCTOR_SEATS;
}

export function freeStudentLicensesForLicense(licenseId?: string | null): number {
  return licenseId === OWNER_ALPHA_LICENSE_ID ? OWNER_FREE_STUDENT_LICENSES : FREE_STUDENT_LICENSES;
}

export function instructorSeatAllowance(instructorUses = 0, licenseId?: string | null): number {
  const uses = Math.max(0, Math.min(HALF_OFF_MAX_USES, Math.floor(Number.isFinite(instructorUses) ? instructorUses : 0)));
  return Math.min(BUNDLE_CEILING, freeInstructorSeatsForLicense(licenseId) + uses);
}

export function studentLicenseAllowance(studentUses = 0, licenseId?: string | null): number {
  const uses = Math.max(0, Math.min(HALF_OFF_MAX_USES, Math.floor(Number.isFinite(studentUses) ? studentUses : 0)));
  return Math.min(BUNDLE_CEILING, freeStudentLicensesForLicense(licenseId) + uses);
}

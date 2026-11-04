/**
 * Free Student Edition licenses that ship with Advantage Pro.
 * Five per Pro license (FREE_STUDENT_LICENSES). A half-off code is a separate
 * 100-use checkout, not extra free licenses.
 *
 * Advantage Cloud scope for a claimed student (minimal):
 * - Allowed: that student's own inbox, photo submission, published photo, and
 *   tournament notices under groups/<gym>/students/<studentLicenseId>/.
 * - Refused: coach lesson plans and lesson media, daily videos, skins, the gym
 *   roster, private coach notes, pending replay clips, and every other student's folder.
 * /api/gym/cloud and /api/gym/roster reject this pass outright.
 * /api/gym/inbox serves only the pass's own student id, and a revoked grant closes it.
 */

import { FREE_STUDENT_LICENSES } from './proBundleMath.ts';

export { FREE_STUDENT_LICENSES };

export const STUDENT_LICENSE_PRESET = 'student-license';
export const STUDENT_LICENSE_SOURCE_PREFIX = 'student-code:';

export const STUDENT_LICENSE_GIVE = 'Give a free Student license';
export const STUDENT_LICENSE_EMPTY = 'No free Student licenses left.';
export const STUDENT_LICENSE_REVOKED_MESSAGE =
  'This free Student license was revoked. Ask your coach for a new code.';
export const STUDENT_LICENSE_TAKEN_MESSAGE = 'This free Student license was already claimed.';
export const STUDENT_LICENSE_OWNER_ONLY = 'Only the gym owner can issue a free Student license.';
export const STUDENT_CLOUD_REFUSED =
  "This Student license opens only that student's academy inbox. Coach lesson files, private notes, and other students stay closed.";
export const STUDENT_CLOUD_CONNECTED =
  'Connected on Advantage Cloud for this student only. Coach lesson files, private coach notes, and other students stay closed.';

export const ADD_TO_HOME_TITLE = 'Add Advantage to your Home Screen';
export const ADD_TO_HOME_IPHONE = 'iPhone: Share > Add to Home Screen';
export const ADD_TO_HOME_ANDROID = 'Android: Install / Add to Home screen';
export const ADD_TO_HOME_EMAIL = 'then sign in with this same email inside the app if asked';

const CODE_RE = /^[a-f0-9]{64}$/;

export function freeStudentLicensesLeft(occupied: number): number {
  const used = Number.isFinite(occupied) ? Math.floor(occupied) : 0;
  return Math.max(0, FREE_STUDENT_LICENSES - Math.max(0, used));
}

export function freeStudentLicenseTicker(occupied: number): string {
  const left = freeStudentLicensesLeft(occupied);
  return `${left} of ${FREE_STUDENT_LICENSES} free Student licenses left`;
}

export function halfOffPoolNote(usesLeft: number): string {
  const left = Math.max(0, Math.floor(Number.isFinite(usesLeft) ? usesLeft : 0));
  return `The 100-use half-off code still has ${left} uses. A student can enter it at Student Edition checkout.`;
}

export function studentLicenseSourceRef(code: string): string {
  return `${STUDENT_LICENSE_SOURCE_PREFIX}${code}`;
}

export function isStudentLicenseCode(value: string): boolean {
  return CODE_RE.test(value);
}

/** Claim page on this origin. The gym name is a label, not the secret. */
export function studentLicenseClaimUrl(origin: string, code: string, gymName = ''): string {
  const base = `${origin.replace(/\/$/, '')}/student/claim/${code}`;
  const name = gymName.trim().slice(0, 80);
  if (!name) return base;
  return `${base}?gym=${encodeURIComponent(name)}`;
}

const STUDENT_PREFIXES = ['inbox/', 'photos/pending/', 'photos/approved/', 'events/'] as const;

/**
 * True only for one file inside this student's own inbox, pending photo,
 * published photo, or tournament notice. Everything else is coach-side or
 * another student's data.
 */
export function studentCloudPathAllowed(relativePath: string, studentId: string): boolean {
  if (!studentId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(studentId)) return false;
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('..') || relativePath.includes('\\')) return false;
  const root = `students/${studentId}/`;
  if (!relativePath.startsWith(root)) return false;
  const rest = relativePath.slice(root.length);
  return STUDENT_PREFIXES.some((prefix) => {
    if (!rest.startsWith(prefix)) return false;
    const file = rest.slice(prefix.length);
    return file.length > 0 && !file.includes('/');
  });
}

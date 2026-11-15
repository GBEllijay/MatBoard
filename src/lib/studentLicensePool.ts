/**
 * Free Student Edition licenses that ship with Advantage Pro.
 * Five per Pro license (FREE_STUDENT_LICENSES). A half-off code is a separate
 * 100-use checkout, not extra free licenses.
 *
 * Advantage Cloud scope for a claimed student (minimal):
 * - Allowed: that student's own inbox, photo submission, published photo,
 *   tournament notices, and from-instructor/{date}/{file} under
 *   groups/<gym>/students/<studentLicenseId>/.
 * - Refused: coach lesson plans and lesson media, daily videos, skins, the gym
 *   roster, private coach notes, pending replay clips, and every other student's folder.
 * /api/gym/cloud and /api/gym/roster reject this pass outright.
 * /api/gym/inbox serves only the pass's own student id, and a revoked grant closes it.
 */

import { STUDENT_CLAIM_PAYLOAD, claimsWouldDowngrade } from './passDowngrade.ts';

import {
  FREE_STUDENT_LICENSES,
  freeStudentLicensesForLicense,
} from './proBundleMath.ts';

export { FREE_STUDENT_LICENSES, freeStudentLicensesForLicense };

export const STUDENT_LICENSE_PRESET = 'student-license';
export const STUDENT_LICENSE_SOURCE_PREFIX = 'student-code:';

export const STUDENT_LICENSE_GIVE = 'Invite a student (Student Edition only)';
export const STUDENT_INVITE_TYP = 'student-invite';
export const STUDENT_JOIN_PATH = '/join/student';
export const STUDENT_CLAIM_KEPT_HIGHER =
  'This phone already has a higher license, so Student Edition was not installed over it. You are still linked to the academy.';
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

export function freeStudentLicensesLeft(occupied: number, cap = FREE_STUDENT_LICENSES): number {
  const used = Number.isFinite(occupied) ? Math.floor(occupied) : 0;
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : FREE_STUDENT_LICENSES;
  return Math.max(0, limit - Math.max(0, used));
}

export function freeStudentLicenseTicker(occupied: number, cap = FREE_STUDENT_LICENSES): string {
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : FREE_STUDENT_LICENSES;
  const left = freeStudentLicensesLeft(occupied, limit);
  return `${left} of ${limit} free Student licenses left`;
}

export function halfOffPoolNote(usesLeft: number, maxUses = 100): string {
  const left = Math.max(0, Math.floor(Number.isFinite(usesLeft) ? usesLeft : 0));
  const max = Math.max(0, Math.floor(Number.isFinite(maxUses) ? maxUses : 0));
  return `The ${max}-use half-off code still has ${left} uses. A student can enter it at Student Edition checkout.`;
}

export function studentLicenseSourceRef(code: string): string {
  return `${STUDENT_LICENSE_SOURCE_PREFIX}${code}`;
}

export function isStudentLicenseCode(value: string): boolean {
  return CODE_RE.test(value);
}

/** Hex claim code, or a compact signed student-invite token. */
export function isStudentInviteValue(value: string): boolean {
  const trimmed = value.trim();
  if (isStudentLicenseCode(trimmed)) return true;
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed);
}

/**
 * Account invite screen for a student code or signed invite, with the email
 * filled in when we have it. The gym name is a label only and is not part of the link:
 * sign-in restores the academy from the invite itself.
 */
export function studentAccountInvitePath(invite: string, email = ''): string {
  const params = new URLSearchParams({ invite });
  const address = email.trim().slice(0, 320);
  if (address && address.includes('@') && !/\s/.test(address)) params.set('email', address);
  return `/account?${params.toString()}`;
}

/**
 * Invite link (and the QR, which encodes the same link). It opens the account page
 * in invite mode: the student confirms the invited email and chooses a password,
 * which turns Student Edition on and makes the email + password login in one step.
 * The gymName argument is kept so existing callers do not change; it is not added
 * to the address.
 */
export function studentInviteJoinUrl(origin: string, inviteOrCode: string, _gymName = '', email = ''): string {
  return `${origin.replace(/\/$/, '')}${studentAccountInvitePath(inviteOrCode, email)}`;
}

/** Older helper name. New and old printed links now use the account invite screen. */
export function studentLicenseClaimUrl(origin: string, code: string, gymName = '', email = ''): string {
  return studentInviteJoinUrl(origin, code, gymName, email);
}

export const STUDENT_CLAIM_PATH_PREFIX = '/student/claim/';

/**
 * If this address is an older /join/student or /student/claim link, the account
 * invite path it should become. Used on boot and by those routes so a QR scan
 * never shows the old email-only claim form.
 */
export function studentJoinRedirectPath(pathname: string, search = ''): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const email = params.get('email') ?? '';
  if (pathname === STUDENT_JOIN_PATH) {
    const invite = params.get('code') ?? params.get('invite') ?? '';
    return invite ? studentAccountInvitePath(invite, email) : null;
  }
  if (pathname.startsWith(STUDENT_CLAIM_PATH_PREFIX)) {
    const raw = pathname.slice(STUDENT_CLAIM_PATH_PREFIX.length);
    if (!raw) return null;
    let invite = raw;
    try {
      invite = decodeURIComponent(raw);
    } catch {
      invite = raw;
    }
    return invite ? studentAccountInvitePath(invite, email) : null;
  }
  return null;
}

function typOfSignedInvite(value: string): string | null {
  const parts = value.trim().split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))) as { typ?: unknown };
    return typeof json?.typ === 'string' ? json.typ : null;
  } catch {
    return null;
  }
}

/** True when this value is a student license code, a signed student invite, or a link to one. */
export function looksLikeStudentInvite(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const candidates = [trimmed];
  try {
    const url = new URL(trimmed);
    for (const key of ['code', 'invite']) {
      const param = url.searchParams.get(key);
      if (param) candidates.push(param);
    }
    const claim = url.pathname.match(/\/student\/claim\/([^/]+)$/);
    if (claim?.[1]) {
      try {
        candidates.push(decodeURIComponent(claim[1]));
      } catch {
        candidates.push(claim[1]);
      }
    }
  } catch {
    /* not a link */
  }
  return candidates.some((candidate) => isStudentLicenseCode(candidate) || typOfSignedInvite(candidate) === STUDENT_INVITE_TYP);
}

/**
 * True when this phone already holds a seat, an owner pass, or a Media, Instructor
 * or Pro pass. A free Student claim must not replace that token.
 * Same rule as every other no-downgrade check (passDowngrade.ts claimsWouldDowngrade):
 * White sits below Student on the ladder, so a White pass is not protected; the
 * Student pass opens White too.
 */
export function studentClaimWouldDowngrade(
  claims: { src?: string; tier?: string; grants?: readonly string[]; subs?: { state?: unknown } | null } | null | undefined,
): boolean {
  return claimsWouldDowngrade(claims, STUDENT_CLAIM_PAYLOAD);
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
  if (/^from-instructor\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]{1,80}$/.test(rest)) return true;
  return STUDENT_PREFIXES.some((prefix) => {
    if (!rest.startsWith(prefix)) return false;
    const file = rest.slice(prefix.length);
    return file.length > 0 && !file.includes('/');
  });
}

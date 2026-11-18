/**
 * A student academy QR or link (the coach connect QR, `/student/connections?coach=…`, or the
 * Drive academy link, `?academy=…`) opened on a phone that has no Student Edition yet.
 * Before this, the phone only showed the locked Student Edition page and the link did nothing.
 *
 * DRAFT WORDING (Nov 18, 2026): the owner has not confirmed these lines yet.
 */
/** Same as COACH_CONNECT_PARAM in coachConnect.ts (kept here so this file has no browser imports). */
export const COACH_LINK_PARAM = 'coach';
export const ACADEMY_LINK_PARAM = 'academy';

export type ClosedAcademyLink = 'coach' | 'academy';

/** Which academy link this URL carries, or null for a plain /student visit. */
export function academyLinkOf(params: URLSearchParams): ClosedAcademyLink | null {
  if ((params.get(COACH_LINK_PARAM) ?? '').trim()) return 'coach';
  if ((params.get(ACADEMY_LINK_PARAM) ?? '').trim()) return 'academy';
  return null;
}

export const STUDENT_CODE_FIRST_TITLE = 'You need a Student Edition code first';

export const STUDENT_CODE_FIRST_LEAD =
  "This is your academy's link. It connects Student Edition to your academy, but Student Edition isn't open on this phone yet.";

export const STUDENT_CODE_FIRST_STEPS: readonly string[] = [
  'Ask your instructor or gym owner for your Student Edition code. The academy sends it to your email.',
  'Open that code here and choose a password.',
  'Then scan this QR or open this link again to connect to your academy.',
];

export type StudentCodeFirstAction = { label: string; to: string };

export const STUDENT_CODE_FIRST_ACTIONS: readonly StudentCodeFirstAction[] = [
  { label: 'I have a code', to: '/account?tab=invite' },
  { label: 'I already have a password: sign in', to: '/account' },
  { label: 'Buy Student Edition', to: '/editions/student' },
];

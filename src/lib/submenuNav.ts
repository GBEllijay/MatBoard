import {
  COACH_BOARD_FROM,
  COACH_UNLIMITED_PATH,
  SUITE_FROM,
  UNLIMITED_FROM,
  UNLIMITED_LESSON_PATH,
  UNLIMITED_LESSON_VALUE,
} from './productNames.ts';
import { safeTimerReturn } from './timerReturn.ts';

/** Main tier picker: White, Coach, Pro, and later Student Edition. */
export const TIER_PICKER_PATH = '/';

export type SubmenuNavInput = {
  pathname: string;
  search?: string;
  /** Game plan or ready-check detail is one level under its list. */
  detailOpen?: boolean;
  proUnlocked?: boolean;
  coachUnlocked?: boolean;
  seated?: boolean;
  /** Live seat already on the Unlimited lesson, even without ?plan=unlimited. */
  unlimited?: boolean;
};

function paramsOf(search: string | undefined): URLSearchParams {
  return new URLSearchParams(search?.startsWith('?') ? search.slice(1) : (search ?? ''));
}

/** Center logo. Always the tier picker. */
export function submenuHomeTarget(): string {
  return TIER_PICKER_PATH;
}

/**
 * Top-left back: exactly one level, to the menu that opened this page.
 * Null on the tier picker and the tier homes (Coach, Pro, White). Those
 * pages use the center logo for home and do not add a second back control.
 *
 * A Pro visit to Daily Training Videos, Technique Tree, or Daily Lesson Plan
 * with no Coach flag returns to Coach Unlimited. That is the menu Pro uses
 * for those tools, including a direct open that never carried ?from=.
 *
 * Media Console (/slideshow, /screensaver, and the folder routes) keeps this
 * corner back and does not render the center Home mark. The purple belt is
 * the header. Class Schedule still renders both marks.
 *
 * Daily Lesson Plan (/notes, Coach and Coach Unlimited) also keeps only the
 * corner back. The lesson title fills the top of the phone, so a center Home
 * mark would sit on the title. Home is still a long-press on that corner mark.
 */
export function submenuBackTarget(input: SubmenuNavInput): string | null {
  const params = paramsOf(input.search);
  const from = params.get('from');
  const plan = params.get('plan');
  const path = input.pathname;
  const unlimited =
    input.unlimited || from === UNLIMITED_FROM || plan === UNLIMITED_LESSON_VALUE;
  const explicitBack = safeTimerReturn(params.get('back'));

  if (path === '/' || path === '/coach' || path === '/pro' || path === '/white') return null;
  if (path === '/white/roster') return '/white';

  if (path === '/coach-unlimited' || path === '/instructors' || path === '/suite') return '/pro';
  if (path === '/coaching-tools' || path === '/competition') return '/coach';
  if (path === '/review') return COACH_UNLIMITED_PATH;

  if (path === '/competitors') {
    if (from === 'competition') return '/competition';
    if (from === SUITE_FROM) return '/suite';
    if (input.proUnlocked) return '/suite';
    return '/competition';
  }

  if (path === '/notes') {
    if (from === COACH_BOARD_FROM) return '/coach';
    if (unlimited || input.proUnlocked) return COACH_UNLIMITED_PATH;
    return '/coach';
  }

  if (path === '/techniques') {
    if (explicitBack) return explicitBack;
    if (from === COACH_BOARD_FROM) return '/coach';
    if (unlimited || input.proUnlocked) return COACH_UNLIMITED_PATH;
    if (input.seated) return '/coach';
    return '/coach';
  }

  if (path === '/technique-tree') {
    if (from === COACH_BOARD_FROM) return '/coach';
    if (unlimited || input.proUnlocked) return COACH_UNLIMITED_PATH;
    return '/coach';
  }

  if (path === '/competition-curriculum') {
    if (unlimited || input.proUnlocked) return COACH_UNLIMITED_PATH;
    return '/coaching-tools';
  }

  if (path === '/roster') {
    if (from === 'students' || from === COACH_BOARD_FROM) return '/coach';
    if (from === UNLIMITED_FROM) return COACH_UNLIMITED_PATH;
    if (from === 'competitors') return '/competitors';
    if (from === SUITE_FROM) return '/suite';
    if (input.coachUnlocked && !input.proUnlocked) return '/coach';
    if (input.proUnlocked) return '/competitors';
    return '/coach';
  }

  if (path === '/tournament') {
    if (from === SUITE_FROM) return '/suite';
    if (from === COACH_BOARD_FROM) return '/coach';
    if (input.coachUnlocked && !input.proUnlocked) return '/coach';
    if (input.proUnlocked) return '/suite';
    return '/coach';
  }

  if (
    path === '/slideshow' ||
    path === '/screensaver' ||
    path === '/gallery' ||
    path === '/events' ||
    path === '/proshop' ||
    path === '/pro-shop'
  ) {
    return '/pro';
  }

  if (path === '/schedule') return '/slideshow?folder=gallery';

  if (path === '/class-history') return classHistoryBack(from, plan, params, input.proUnlocked);

  if (path === '/game-plan') return input.detailOpen ? '/game-plan' : '/competitors';
  if (path === '/competition-ready') return input.detailOpen ? '/competition-ready' : '/competitors';
  if (path === '/rankings') return '/competitors';

  if (path === '/match/control' || path === '/training/control' || path === '/match' || path === '/training') {
    if (explicitBack) return explicitBack;
    if (from === SUITE_FROM) return '/suite';
    return '/white';
  }

  return null;
}

function classHistoryBack(
  from: string | null,
  plan: string | null,
  params: URLSearchParams,
  proUnlocked: boolean | undefined,
): string {
  if (from === 'notes') {
    if (plan === UNLIMITED_LESSON_VALUE) return UNLIMITED_LESSON_PATH;
    if (params.get('hub') === 'coach') return '/notes?from=coach';
    if (proUnlocked) return UNLIMITED_LESSON_PATH;
    return '/notes?from=coach';
  }
  if (from === UNLIMITED_FROM) return COACH_UNLIMITED_PATH;
  if (from === 'media') return '/slideshow?folder=gallery';
  if (from === 'curriculum') {
    return plan === UNLIMITED_LESSON_VALUE
      ? `/competition-curriculum?plan=${UNLIMITED_LESSON_VALUE}`
      : '/competition-curriculum';
  }
  if (from === 'review') return '/review';
  if (from === 'instructors') return '/instructors';
  if (proUnlocked) return COACH_UNLIMITED_PATH;
  return '/instructors';
}

/** Class history link that remembers the page which opened it. */
export function classHistoryHref(pathname: string, search = ''): string {
  const params = paramsOf(search);
  const next = new URLSearchParams();
  if (pathname === '/notes') {
    next.set('from', 'notes');
    const plan = params.get('plan');
    if (plan) next.set('plan', plan);
    if (params.get('from') === COACH_BOARD_FROM) next.set('hub', 'coach');
  } else if (pathname === '/coach-unlimited') {
    next.set('from', UNLIMITED_FROM);
  } else if (pathname === '/slideshow' || pathname === '/screensaver') {
    next.set('from', 'media');
  } else if (pathname === '/competition-curriculum') {
    next.set('from', 'curriculum');
    const plan = params.get('plan');
    if (plan) next.set('plan', plan);
  } else if (pathname === '/review') {
    next.set('from', 'review');
  } else if (pathname === '/instructors') {
    next.set('from', 'instructors');
  }
  const qs = next.toString();
  return qs ? `/class-history?${qs}` : '/class-history';
}

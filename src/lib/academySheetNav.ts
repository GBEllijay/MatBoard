/**
 * Destinations for the academy profile summary.
 * Counts stay on the card. A tap opens the screen that already records that
 * information. Nothing here writes a count.
 */

export function academyProfileHome(value: string | null | undefined): '/pro' | '/pro-plus-cloud' {
  return value === '/pro-plus-cloud' ? '/pro-plus-cloud' : '/pro';
}

function withAcademyHome(path: string, home: '/pro' | '/pro-plus-cloud'): string {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('from', 'academy');
  params.set('home', home);
  const next = params.toString();
  return next ? `${base}?${next}` : base;
}

/** Student cards. Promotions, stripes, and tenure are entered there. */
export function academyRosterHref(home: '/pro' | '/pro-plus-cloud'): string {
  return withAcademyHome('/roster', home);
}

/** Daily lesson plan. "I taught this" is what the classes count records. */
export function academyLessonHref(home: '/pro' | '/pro-plus-cloud'): string {
  return withAcademyHome('/notes?plan=unlimited', home);
}

/**
 * Instructor invitation and access.
 * The card's instructor lines are classes and promotions, not seat assignments.
 */
export function academyInstructorsHref(home: '/pro' | '/pro-plus-cloud'): string {
  return withAcademyHome('/instructors', home);
}

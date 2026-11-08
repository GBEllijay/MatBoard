/**
 * Owner planning estimate for time at a belt.
 * Calendar lengths times a chosen weekly rate. Not journal hours,
 * not a saved history, and not a promotion.
 */

export const WEEKS_PER_YEAR = 52;
export const HOURS_PER_WEEK = [2, 3, 4] as const;
export type HoursPerWeek = (typeof HOURS_PER_WEEK)[number];

export const IBJJF_GRADUATION_URL = 'https://ibjjf.com/graduation-system/';

export type BeltSpan = {
  id: 'white' | 'blue' | 'purple' | 'brown';
  label: string;
  years: number;
  /** White is an owner assumption. Later belts follow the adult IBJJF calendar minimum. */
  basis: 'assumption' | 'ibjjf';
};

export const BELT_SPANS: readonly BeltSpan[] = [
  { id: 'white', label: 'White to blue', years: 2, basis: 'assumption' },
  { id: 'blue', label: 'Blue to purple', years: 2, basis: 'ibjjf' },
  { id: 'purple', label: 'Purple to brown', years: 1.5, basis: 'ibjjf' },
  { id: 'brown', label: 'Brown to black', years: 1, basis: 'ibjjf' },
];

export function spanWeeks(years: number): number {
  return years * WEEKS_PER_YEAR;
}

/**
 * The weekly rate is time on the mat. The formula does not subtract a commute,
 * because driving time is not an input.
 */
export const MAT_TIME_ONLY = 'Driving time doesn’t count—mat time only.';

/** years × 52 × hours per week. 18 months is 1.5 years. */
export function spanHours(years: number, hoursPerWeek: number): number {
  return years * WEEKS_PER_YEAR * hoursPerWeek;
}

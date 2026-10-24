/**
 * Division and weight class on a student tournament.
 * Older files stored both in `division`. A clear pair is split on read.
 * Anything that is not clearly both stays in division, so a free-text value is never dropped.
 */

export const DIVISION_SUGGESTIONS = [
  'Adult',
  'Master 1',
  'Master 2',
  'Master 3',
  'Master 4',
  'Master 5',
  'Master 6',
  'Master 7',
  'Juvenile',
  'Kids',
  'Gi',
  'No-Gi',
] as const;

export const WEIGHT_CLASS_SUGGESTIONS = [
  'Rooster',
  'Light Feather',
  'Feather',
  'Light',
  'Middle',
  'Medium Heavy',
  'Heavy',
  'Super Heavy',
  'Ultra Heavy',
  'Open Class',
] as const;

/** Longer names first so "Light Feather" is not read as "Light" or "Feather". */
const WEIGHT_CLASS_KEYS = [
  'ultra heavy',
  'super heavy',
  'medium heavy',
  'light feather',
  'open class',
  'open weight',
  'rooster',
  'feather',
  'light',
  'middle',
  'heavy',
  'open',
  'absolute',
] as const;

function fold(value: string): string {
  return value.trim().toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
}

/** A usual IBJJF weight class, optionally followed by Gi or No-Gi. */
export function isKnownWeightClass(value: string): boolean {
  const key = fold(value);
  if (!key) return false;
  return WEIGHT_CLASS_KEYS.some((name) => key === name || key === `${name} gi` || key === `${name} no gi`);
}

/**
 * Split an older combined value when it clearly holds a division and a weight class.
 * "Adult Blue / Feather" becomes division "Adult Blue" and weight class "Feather".
 * "Adult Blue Middle" has no separator, so the whole phrase stays in division.
 * The student's own spelling is kept.
 */
export function splitCombinedDivision(value: string): { division: string; weightClass: string } {
  const text = value.trim();
  if (!text) return { division: '', weightClass: '' };
  const separated = text.match(/^(.*\S)\s*(?:\/|\||,|–|—)\s*(\S.*)$/) ?? text.match(/^(.*\S)\s+-\s+(\S.*)$/);
  if (!separated) return { division: text, weightClass: '' };
  const division = separated[1].trim();
  const weightClass = separated[2].trim();
  if (!division || !weightClass || !isKnownWeightClass(weightClass)) return { division: text, weightClass: '' };
  return { division, weightClass };
}

/** Division and weight class, each kept, for a card, calendar line, or report. */
export function tournamentClassLine(tournament: { division?: string; weightClass?: string }): string {
  return [tournament.division, tournament.weightClass]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}

/**
 * Type-ahead list. Values the student already used come first, then the common names.
 * The query matches any part of a suggestion. Free text is still allowed by the field.
 */
export function suggestionList(seeds: readonly string[], used: readonly string[], query: string, limit = 16): string[] {
  const seen = new Set<string>();
  const all: string[] = [];
  const push = (value: string) => {
    const text = value.trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    all.push(text);
  };
  for (const value of used) push(value);
  for (const value of seeds) push(value);
  const needle = query.trim().toLowerCase();
  const matched = needle ? all.filter((item) => item.toLowerCase().includes(needle)) : all;
  return matched.slice(0, limit);
}

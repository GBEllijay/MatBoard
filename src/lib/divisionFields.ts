/**
 * Division and weight class on a student tournament or competitor profile.
 * Older files stored both in `division`. A clear pair is split on read.
 * "Adult / Feather" and "Adult Black Medium Heavy" both split.
 * A phrase that is not a division plus a weight class stays in division,
 * so a free-text value is never dropped.
 *
 * Suggestions are IBJJF-style names. Gi adult limits are the ones shown
 * with kilograms and pounds. Kids limits follow the 2025 age-group chart.
 * Typing still accepts any other text.
 */

export type FieldKind = 'division' | 'weight';

type Suggestion = {
  value: string;
  hint: string;
  /** Shown when the field is focused and still empty. */
  browse: boolean;
};

const ADULT_BELTS = ['White', 'Blue', 'Purple', 'Brown', 'Black'] as const;
const GREY_BELTS = ['Grey', 'Grey/White', 'Grey/Black'] as const;
const YELLOW_BELTS = ['Yellow', 'Yellow/White', 'Yellow/Black'] as const;
const ORANGE_BELTS = ['Orange', 'Orange/White', 'Orange/Black'] as const;
const GREEN_BELTS = ['Green', 'Green/White', 'Green/Black'] as const;

const CLASS_NAMES = [
  'Rooster',
  'Light Feather',
  'Feather',
  'Light',
  'Middle',
  'Medium Heavy',
  'Heavy',
  'Super Heavy',
  'Ultra Heavy',
] as const;

/** Gi maximums in kilograms. Null means no maximum. */
const MALE_GI_KG = [57.5, 64, 70, 76, 82.3, 88.3, 94.3, 100.5, null] as const;
const FEMALE_GI_KG = [48.5, 53.5, 58.5, 64, 69, 74, 79.3, null, null] as const;
const MALE_NOGI_KG = [55.5, 61.5, 67.5, 73.5, 79.5, 85.5, 91.5, 97.5, null] as const;
const FEMALE_NOGI_KG = [46.5, 51.5, 56.5, 61.5, 66.5, 71.5, 76.5, null, null] as const;
const JUVENILE_MALE_KG = [53.5, 58.5, 64, 69, 74, 79.3, 84.3, 89.3, null] as const;
const JUVENILE_FEMALE_KG = [44.3, 48.3, 52.5, 56.5, 60.5, 65, 69, null, null] as const;

const KIDS_AGES = [
  'Mighty Mite 1',
  'Mighty Mite 2',
  'Mighty Mite 3',
  'Pee Wee 1',
  'Pee Wee 2',
  'Pee Wee 3',
  'Junior 1',
  'Junior 2',
  'Junior 3',
  'Teen 1',
  'Teen 2',
  'Teen 3',
] as const;

/** 2025 kids gi maximums in pounds, one column per age group. Ultra Heavy has no maximum. */
const KIDS_LBS: Record<(typeof CLASS_NAMES)[number], readonly number[] | null> = {
  Rooster: [26, 32.6, 39.6, 40, 46.6, 53, 60, 67, 71, 80, 89, 98],
  'Light Feather': [32.6, 39.6, 42, 46.6, 53, 60, 67, 73.6, 80, 89, 98, 106.6],
  Feather: [40, 44.6, 48.6, 53, 60, 67, 73.6, 80, 89, 98, 106.6, 116],
  Light: [46.6, 53, 55.6, 60, 67, 73.6, 80, 87, 98, 106.6, 116, 125],
  Middle: [53, 57.6, 62, 67, 73.6, 80, 87, 93.6, 106.6, 116, 125, 133.6],
  'Medium Heavy': [60, 64, 69, 73.6, 80, 87, 93.6, 100, 116, 125, 133.6, 143.6],
  Heavy: [66.6, 71, 75.6, 80, 87, 93.6, 100, 106.6, 125, 133.6, 143.6, 152.6],
  'Super Heavy': [73, 77.6, 82.6, 87, 93.6, 100, 106.6, 114, 133.6, 143.6, 152.6, 161],
  'Ultra Heavy': null,
};

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

const LEADING = [
  'mighty mite 1',
  'mighty mite 2',
  'mighty mite 3',
  'pee wee 1',
  'pee wee 2',
  'pee wee 3',
  'junior 1',
  'junior 2',
  'junior 3',
  'teen 1',
  'teen 2',
  'teen 3',
  'juvenile 1',
  'juvenile 2',
  'juvenile',
  'master 1',
  'master 2',
  'master 3',
  'master 4',
  'master 5',
  'master 6',
  'master 7',
  'adult',
  'kids',
  'kid',
  'male',
  'female',
  'boys',
  'girls',
  'men',
  'women',
] as const;

function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function kgToLb(kg: number): string {
  return num(Math.round(kg * 2.2046226218 * 10) / 10);
}

function lbToKg(lb: number): string {
  return num(Math.round((lb / 2.2046226218) * 10) / 10);
}

/** "57.5 kg / 126.8 lb", or a no-maximum line. `over` is the last limited class. */
function weightText(kg: number | null, overKg: number | null): string {
  if (kg == null) {
    return overKg == null ? 'No maximum' : `No maximum · over ${num(overKg)} kg / ${kgToLb(overKg)} lb`;
  }
  return `${num(kg)} kg / ${kgToLb(kg)} lb`;
}

function previousLimit(row: readonly (number | null)[], index: number): number | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const value = row[cursor];
    if (value != null) return value;
  }
  return null;
}

function beltsFor(age: string): readonly string[] {
  if (age.startsWith('Mighty Mite')) return ['White', ...GREY_BELTS];
  if (age.startsWith('Pee Wee')) return ['White', ...GREY_BELTS, ...YELLOW_BELTS];
  if (age.startsWith('Junior')) return ['White', ...GREY_BELTS, ...YELLOW_BELTS, ...ORANGE_BELTS];
  if (age.startsWith('Teen')) return ['White', ...GREY_BELTS, ...YELLOW_BELTS, ...ORANGE_BELTS, ...GREEN_BELTS];
  return ADULT_BELTS;
}

function buildDivisionCatalog(): Suggestion[] {
  const rows: Suggestion[] = [];
  const push = (value: string, hint: string, browse: boolean) => {
    rows.push({ value, hint, browse });
  };
  const ages: [string, string, boolean][] = [
    ['Juvenile', '16–17', true],
    ['Adult', '18–29', true],
    ['Master 1', '30–35', true],
    ['Mighty Mite 1', 'Kids · about 4', true],
    ['Pee Wee 1', 'Kids · about 7', true],
    ['Junior 1', 'Kids · about 10', true],
    ['Teen 1', 'Kids · about 13', true],
    ['Master 2', '36–40', true],
    ['Master 3', '41–45', true],
    ['Master 4', '46–50', true],
    ['Master 5', '51–55', true],
    ['Master 6', '56–60', true],
    ['Master 7', '61+', true],
    ['Juvenile 1', '16', true],
    ['Juvenile 2', '17', true],
    ['Mighty Mite 2', 'Kids · about 5', true],
    ['Mighty Mite 3', 'Kids · about 6', true],
    ['Pee Wee 2', 'Kids · about 8', true],
    ['Pee Wee 3', 'Kids · about 9', true],
    ['Junior 2', 'Kids · about 11', true],
    ['Junior 3', 'Kids · about 12', true],
    ['Teen 2', 'Kids · about 14', true],
    ['Teen 3', 'Kids · about 15', true],
    ['Kids', 'Kids age groups', true],
  ];
  for (const [value, hint] of ages) push(value, hint, true);
  for (const belt of ADULT_BELTS) push(belt, 'Belt', true);
  for (const belt of [...GREY_BELTS, ...YELLOW_BELTS, ...ORANGE_BELTS, ...GREEN_BELTS]) push(belt, 'Kids belt', true);
  push('Gi', 'Ruleset', true);
  push('No-Gi', 'Ruleset', true);
  const comboAges = [
    'Juvenile',
    'Juvenile 1',
    'Juvenile 2',
    'Adult',
    'Master 1',
    'Master 2',
    'Master 3',
    'Master 4',
    'Master 5',
    'Master 6',
    'Master 7',
    ...KIDS_AGES,
  ];
  for (const age of comboAges) {
    for (const belt of beltsFor(age)) push(`${age} ${belt}`, 'Age and belt', false);
  }
  return rows;
}

function buildWeightCatalog(): Suggestion[] {
  const rows: Suggestion[] = [];
  const push = (value: string, hint: string, browse: boolean) => {
    rows.push({ value, hint, browse });
  };
  CLASS_NAMES.forEach((name, index) => {
    const male = weightText(MALE_GI_KG[index], previousLimit(MALE_GI_KG, index));
    const female = weightText(FEMALE_GI_KG[index], previousLimit(FEMALE_GI_KG, index));
    push(name, `Male ${male} · Female ${female}`, true);
  });
  push('Open Class', 'No weight limit', true);
  for (const name of CLASS_NAMES) push(`Kids ${name}`, 'Kids · type an age group for the exact limit', true);
  CLASS_NAMES.forEach((name, index) => {
    push(`Male ${name}`, `Gi · ${weightText(MALE_GI_KG[index], previousLimit(MALE_GI_KG, index))}`, true);
    push(`Female ${name}`, `Gi · ${weightText(FEMALE_GI_KG[index], previousLimit(FEMALE_GI_KG, index))}`, true);
  });
  push('Male Open Class', 'No weight limit', false);
  push('Female Open Class', 'No weight limit', false);
  CLASS_NAMES.forEach((name, index) => {
    push(`Juvenile Male ${name}`, `Gi · ${weightText(JUVENILE_MALE_KG[index], previousLimit(JUVENILE_MALE_KG, index))}`, false);
    push(`Juvenile Female ${name}`, `Gi · ${weightText(JUVENILE_FEMALE_KG[index], previousLimit(JUVENILE_FEMALE_KG, index))}`, false);
    push(`Male ${name} No-Gi`, weightText(MALE_NOGI_KG[index], previousLimit(MALE_NOGI_KG, index)), false);
    push(`Female ${name} No-Gi`, weightText(FEMALE_NOGI_KG[index], previousLimit(FEMALE_NOGI_KG, index)), false);
  });
  KIDS_AGES.forEach((age, ageIndex) => {
    for (const name of CLASS_NAMES) {
      const pounds = KIDS_LBS[name];
      const hint = pounds == null ? 'No maximum' : `${num(pounds[ageIndex])} lb / ${lbToKg(pounds[ageIndex])} kg`;
      push(`${age} ${name}`, `Kids · ${hint}`, false);
    }
  });
  return rows;
}

const DIVISION_CATALOG = buildDivisionCatalog();
const WEIGHT_CATALOG = buildWeightCatalog();

const HINTS = new Map<string, string>();
for (const row of [...DIVISION_CATALOG, ...WEIGHT_CATALOG]) {
  if (!HINTS.has(row.value)) HINTS.set(row.value, row.hint);
}

/** Names the empty Division field offers before the student types. */
export const DIVISION_SUGGESTIONS = DIVISION_CATALOG.filter((row) => row.browse).map((row) => row.value);

/** Names the empty Weight class field offers before the student types. */
export const WEIGHT_CLASS_SUGGESTIONS = WEIGHT_CATALOG.filter((row) => row.browse).map((row) => row.value);

export function suggestionHint(value: string): string {
  return HINTS.get(value) ?? '';
}

function fold(value: string): string {
  return value.trim().toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
}

function loose(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A usual IBJJF weight class, with an optional gender, age, Gi, or limit. */
export function isKnownWeightClass(value: string): boolean {
  let key = fold(value)
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+\d+(?:\.\d+)?\s*kg\b.*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  key = key.replace(/\s+(?:no gi|gi)$/, '').trim();
  for (let guard = 0; guard < 6; guard += 1) {
    const lead = LEADING.find((item) => key.startsWith(`${item} `));
    if (!lead) break;
    key = key.slice(lead.length).trim();
  }
  if (!key) return false;
  return WEIGHT_CLASS_KEYS.some((name) => key === name);
}

/** The whole phrase is a weight class, not a division with a class on the end. */
function isBareWeightClass(text: string): boolean {
  const key = fold(text).replace(/\s+(?:no gi|gi)$/, '').trim();
  return WEIGHT_CLASS_KEYS.some((name) => key === name);
}

const GENDER_ONLY = new Set(['male', 'female', 'boys', 'girls', 'men', 'women']);

function trailingWeight(text: string): { division: string; weightClass: string } | null {
  for (const key of WEIGHT_CLASS_KEYS) {
    const body = key.split(' ').map(escapeRegExp).join('[-_/\\s]+');
    const pattern = new RegExp(`^(.*\\S)\\s+(${body}(?:\\s+no[-\\s]?gi|\\s+gi)?)$`, 'i');
    const match = text.match(pattern);
    if (!match) continue;
    const division = match[1].trim();
    const weightClass = match[2].trim();
    if (!division || !weightClass || GENDER_ONLY.has(fold(division))) continue;
    return { division, weightClass };
  }
  return null;
}

/**
 * Split an older combined value when it clearly holds a division and a weight class.
 * "Adult Blue / Feather" becomes division "Adult Blue" and weight class "Feather".
 * "Adult Black Medium Heavy" has no separator. The weight class is the ending,
 * so it becomes division "Adult Black" and weight class "Medium Heavy".
 * "Saturday squad" and "Feather" alone stay in division. Nothing is deleted.
 */
export function splitCombinedDivision(value: string): { division: string; weightClass: string } {
  const text = value.trim();
  if (!text) return { division: '', weightClass: '' };
  const separated = text.match(/^(.*\S)\s*(?:\/|\||,|–|—)\s*(\S.*)$/) ?? text.match(/^(.*\S)\s+-\s+(\S.*)$/);
  if (separated) {
    const division = separated[1].trim();
    const weightClass = separated[2].trim();
    if (division && weightClass && isKnownWeightClass(weightClass)) return { division, weightClass };
  }
  // A lone class such as "Medium Heavy" is not a division plus a class.
  if (isBareWeightClass(text)) return { division: text, weightClass: '' };
  return trailingWeight(text) ?? { division: text, weightClass: '' };
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

function matchesQuery(value: string, hint: string, needle: string): boolean {
  if (!needle) return true;
  const blob = `${value} ${hint}`.toLowerCase();
  if (blob.includes(needle)) return true;
  const folded = loose(needle);
  if (folded.length > 0 && loose(blob).includes(folded)) return true;
  const tokens = needle.split(/\s+/).filter((token) => token.length > 0);
  return tokens.length > 1 && tokens.every((token) => blob.includes(token) || loose(blob).includes(loose(token)));
}

/**
 * Suggestions for one field. An empty query shows the common list.
 * A query searches age groups, belts, male and female classes, and kids classes.
 * Text the student already saved is included. A query with no match returns nothing.
 */
export function fieldSuggestions(kind: FieldKind, used: readonly string[], query: string, limit = 60): string[] {
  const catalog = kind === 'division' ? DIVISION_CATALOG : WEIGHT_CATALOG;
  const needle = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string) => {
    const text = value.trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };
  for (const value of used) {
    if (matchesQuery(value, suggestionHint(value), needle)) push(value);
  }
  for (const row of catalog) {
    if (!needle && !row.browse) continue;
    if (matchesQuery(row.value, row.hint, needle)) push(row.value);
  }
  return out.slice(0, limit);
}

/** Picker lists for a recorded competition result. Independent of each other. */
export const AGE_DIVISIONS = [
  'Adult',
  'Master 1',
  'Master 2',
  'Master 3',
  'Master 4',
  'Master 5',
  'Master 6',
  'Master 7',
  'Juvenile',
  'Juvenile 1',
  'Juvenile 2',
  'Mighty Mite 1',
  'Mighty Mite 2',
  'Mighty Mite 3',
  'Pee Wee 1',
  'Pee Wee 2',
  'Pee Wee 3',
  'Junior 1',
  'Junior 2',
  'Junior 3',
  'Teen 1',
  'Teen 2',
  'Teen 3',
  'Kids',
] as const;

export const COMPETITION_DIVISIONS = [
  'Gi',
  'No-Gi',
  'Gi · Weight',
  'No-Gi · Weight',
  'Absolute / Open',
  'Gi · Absolute / Open',
  'No-Gi · Absolute / Open',
] as const;

export const WEIGHT_CLASSES = [
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

export const COMPETITION_BELTS = [
  'White',
  'Blue',
  'Purple',
  'Brown',
  'Black',
  'Grey',
  'Grey/White',
  'Grey/Black',
  'Yellow',
  'Yellow/White',
  'Yellow/Black',
  'Orange',
  'Orange/White',
  'Orange/Black',
  'Green',
  'Green/White',
  'Green/Black',
] as const;

export type ResultClassFields = {
  ageDivision: string;
  competitionDivision: string;
  weightClass: string;
  belt: string;
};

export const EMPTY_RESULT_CLASS: ResultClassFields = {
  ageDivision: '',
  competitionDivision: '',
  weightClass: '',
  belt: '',
};

type ClassCategory = keyof ResultClassFields;

type ClassTerm = {
  category: ClassCategory;
  value: string;
  pattern: RegExp;
};

function classTerm(category: ClassCategory, value: string, source: string): ClassTerm {
  return { category, value, pattern: new RegExp(source, 'i') };
}

function word(value: string): string {
  return value
    .split(/[\s/]+/)
    .map((part) => escapeRegExp(part))
    .join('[\\s/-]+');
}

/** Longer phrases first so "Light Feather" is not read as "Light" or "Feather". */
const CLASS_TERMS: ClassTerm[] = [
  classTerm('competitionDivision', 'No-Gi · Absolute / Open', String.raw`no[\s-]?gi\s*[·.]?\s*absolute(?:\s*/?\s*open)?`),
  classTerm('competitionDivision', 'Gi · Absolute / Open', String.raw`gi\s*[·.]?\s*absolute(?:\s*/?\s*open)?`),
  classTerm('competitionDivision', 'No-Gi · Weight', String.raw`no[\s-]?gi\s*[·.]?\s*weight`),
  classTerm('competitionDivision', 'Gi · Weight', String.raw`gi\s*[·.]?\s*weight`),
  classTerm('competitionDivision', 'Absolute / Open', String.raw`absolute(?:\s*/?\s*open)?`),
  classTerm('competitionDivision', 'No-Gi', String.raw`no[\s-]?gi`),
  classTerm('ageDivision', 'Mighty Mite 1', word('Mighty Mite 1')),
  classTerm('ageDivision', 'Mighty Mite 2', word('Mighty Mite 2')),
  classTerm('ageDivision', 'Mighty Mite 3', word('Mighty Mite 3')),
  classTerm('ageDivision', 'Pee Wee 1', word('Pee Wee 1')),
  classTerm('ageDivision', 'Pee Wee 2', word('Pee Wee 2')),
  classTerm('ageDivision', 'Pee Wee 3', word('Pee Wee 3')),
  classTerm('ageDivision', 'Junior 1', word('Junior 1')),
  classTerm('ageDivision', 'Junior 2', word('Junior 2')),
  classTerm('ageDivision', 'Junior 3', word('Junior 3')),
  classTerm('ageDivision', 'Teen 1', word('Teen 1')),
  classTerm('ageDivision', 'Teen 2', word('Teen 2')),
  classTerm('ageDivision', 'Teen 3', word('Teen 3')),
  classTerm('ageDivision', 'Juvenile 1', word('Juvenile 1')),
  classTerm('ageDivision', 'Juvenile 2', word('Juvenile 2')),
  classTerm('ageDivision', 'Master 1', word('Master 1')),
  classTerm('ageDivision', 'Master 2', word('Master 2')),
  classTerm('ageDivision', 'Master 3', word('Master 3')),
  classTerm('ageDivision', 'Master 4', word('Master 4')),
  classTerm('ageDivision', 'Master 5', word('Master 5')),
  classTerm('ageDivision', 'Master 6', word('Master 6')),
  classTerm('ageDivision', 'Master 7', word('Master 7')),
  classTerm('weightClass', 'Light Feather', word('Light Feather')),
  classTerm('weightClass', 'Medium Heavy', word('Medium Heavy')),
  classTerm('weightClass', 'Super Heavy', word('Super Heavy')),
  classTerm('weightClass', 'Ultra Heavy', word('Ultra Heavy')),
  classTerm('weightClass', 'Open Class', String.raw`open[\s-]+(?:class|weight)`),
  classTerm('belt', 'Grey/White', word('Grey/White')),
  classTerm('belt', 'Grey/Black', word('Grey/Black')),
  classTerm('belt', 'Yellow/White', word('Yellow/White')),
  classTerm('belt', 'Yellow/Black', word('Yellow/Black')),
  classTerm('belt', 'Orange/White', word('Orange/White')),
  classTerm('belt', 'Orange/Black', word('Orange/Black')),
  classTerm('belt', 'Green/White', word('Green/White')),
  classTerm('belt', 'Green/Black', word('Green/Black')),
  classTerm('ageDivision', 'Juvenile', String.raw`\bjuvenile\b`),
  classTerm('ageDivision', 'Adult', String.raw`\badult\b`),
  classTerm('ageDivision', 'Kids', String.raw`\bkids?\b`),
  classTerm('weightClass', 'Rooster', String.raw`\brooster\b`),
  classTerm('weightClass', 'Feather', String.raw`\bfeather\b`),
  classTerm('weightClass', 'Light', String.raw`\blight\b`),
  classTerm('weightClass', 'Middle', String.raw`\bmiddle\b`),
  classTerm('weightClass', 'Heavy', String.raw`\bheavy\b`),
  classTerm('belt', 'White', String.raw`\bwhite\b`),
  classTerm('belt', 'Blue', String.raw`\bblue\b`),
  classTerm('belt', 'Purple', String.raw`\bpurple\b`),
  classTerm('belt', 'Brown', String.raw`\bbrown\b`),
  classTerm('belt', 'Black', String.raw`\bblack\b`),
  classTerm('belt', 'Grey', String.raw`\bgrey\b|\bgray\b`),
  classTerm('belt', 'Yellow', String.raw`\byellow\b`),
  classTerm('belt', 'Orange', String.raw`\borange\b`),
  classTerm('belt', 'Green', String.raw`\bgreen\b`),
  classTerm('competitionDivision', 'Gi', String.raw`\bgi\b`),
];

function normalizeClassText(value: string): string {
  return value
    .replace(/[–—]/g, '-')
    .replace(/[|_]+/g, ' ')
    .replace(/\s*,\s*/g, ' ')
    .replace(/\s+\/\s+/g, ' ')
    .replace(/[·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Best-effort split of an older combined class line into the four pickers.
 * Only fills a field when that part is clear. Leftover words, or two values
 * in the same field, leave every field blank so the original text stays the
 * source of truth. Belt is never defaulted to Black or to a current rank.
 */
export function parseResultClass(value: string): ResultClassFields {
  const text = normalizeClassText(value);
  if (!text) return { ...EMPTY_RESULT_CLASS };
  const taken: { start: number; end: number; category: ClassCategory; value: string }[] = [];
  const covered = new Array<boolean>(text.length).fill(false);
  const tryTerm = (term: ClassTerm) => {
    const pattern = new RegExp(term.pattern.source, 'ig');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      if (start > 0 && /\S/.test(text[start - 1] ?? '') && !/[\s/-]/.test(text[start - 1] ?? '')) continue;
      if (end < text.length && /\S/.test(text[end] ?? '') && !/[\s/-]/.test(text[end] ?? '')) continue;
      let overlap = false;
      for (let i = start; i < end; i += 1) {
        if (covered[i]) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;
      for (let i = start; i < end; i += 1) covered[i] = true;
      taken.push({ start, end, category: term.category, value: term.value });
    }
  };
  for (const term of CLASS_TERMS) tryTerm(term);

  const leftover = text
    .split('')
    .map((ch, index) => (covered[index] ? ' ' : ch))
    .join('')
    .replace(/[-/]+/g, ' ')
    .replace(/\b(?:and|vs|versus)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (leftover) return { ...EMPTY_RESULT_CLASS };

  const fields: ResultClassFields = { ...EMPTY_RESULT_CLASS };
  const seen = new Map<ClassCategory, string>();
  for (const hit of taken) {
    const current = seen.get(hit.category);
    if (current && current !== hit.value) return { ...EMPTY_RESULT_CLASS };
    seen.set(hit.category, hit.value);
    fields[hit.category] = hit.value;
  }
  return fields;
}

export function resultClassLine(
  result: Partial<ResultClassFields> & { division?: string },
): string {
  const parts = [result.ageDivision, result.competitionDivision, result.weightClass, result.belt]
    .map((part) => (part ?? '').trim())
    .filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return (result.division ?? '').trim();
}

export function pickerOptions(options: readonly string[], current = ''): string[] {
  const value = current.trim();
  if (!value) return [...options];
  if (options.some((option) => option === value)) return [...options];
  return [value, ...options];
}

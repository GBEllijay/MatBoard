/**
 * Built-in belt templates. IBJJF adult and IBJJF kids are the prebuilt ladders.
 * A student can change the last three stripe colors on their own kids belts.
 * The full template editor comes later. Adult My rank still draws its own ladder.
 * The adult template id wraps a saved file so older adult belts are not rewritten.
 */

import type { BeltCenter, BeltDef, BeltTemplateRecord } from './progress/types.ts';

export const ADULT_IBJJF_TEMPLATE_ID = 'adult-ibjjf@1';
export const KIDS_IBJJF_TEMPLATE_ID = 'kids-ibjjf@1';

const TAPE_WHITE = '#f4f1ea';
const TAPE_RED = '#d21f1f';
const TAPE_BLACK = '#121214';

export type BeltTemplate = {
  id: string;
  name: string;
  kind: 'builtin' | 'custom';
  version: number;
  baseId?: string;
  ageMode: 'kids' | 'adult' | 'any';
  belts: BeltDef[];
};

/** White and Grey/White: 4 white tapes and 1 red tape. Every other kids belt: 4 white, 4 red, 3 black. */
export function ibjjfMonthlyTapes(short: boolean): string[] {
  if (short) return [TAPE_WHITE, TAPE_WHITE, TAPE_WHITE, TAPE_WHITE, TAPE_RED];
  return [TAPE_WHITE, TAPE_WHITE, TAPE_WHITE, TAPE_WHITE, TAPE_RED, TAPE_RED, TAPE_RED, TAPE_RED, TAPE_BLACK, TAPE_BLACK, TAPE_BLACK];
}

function belt(
  id: string,
  name: string,
  base: string,
  center: BeltCenter,
  ink: 'navy' | 'white',
  short: boolean,
  group: string,
  ageMin?: number,
  ageMax?: number,
): BeltDef {
  const row: BeltDef = {
    id,
    name,
    base,
    center,
    ink,
    tapeColors: ibjjfMonthlyTapes(short),
    group,
    bar: '#101012',
    curriculumTier: group === 'white' ? 'white' : group,
  };
  if (ageMin != null) row.ageMin = ageMin;
  if (ageMax != null) row.ageMax = ageMax;
  return row;
}

const GREY = '#8d939a';
const YELLOW = '#e2b000';
const ORANGE = '#e06a12';
const GREEN = '#1f7a45';

/** IBJJF kids belts, ages 4–15. Age numbers are advice. They do not block a belt. */
export const IBJJF_KIDS_TEMPLATE: BeltTemplate = {
  id: KIDS_IBJJF_TEMPLATE_ID,
  name: 'IBJJF kids',
  kind: 'builtin',
  version: 1,
  ageMode: 'kids',
  belts: [
    belt('white', 'White', '#f1eee5', 'solid', 'navy', true, 'white'),
    belt('grey-white', 'Grey/White', GREY, 'white', 'navy', true, 'grey', 4, 15),
    belt('grey', 'Grey', GREY, 'solid', 'navy', false, 'grey', 4, 15),
    belt('grey-black', 'Grey/Black', GREY, 'black', 'navy', false, 'grey', 4, 15),
    belt('yellow-white', 'Yellow/White', YELLOW, 'white', 'navy', false, 'yellow', 7, 15),
    belt('yellow', 'Yellow', YELLOW, 'solid', 'navy', false, 'yellow', 7, 15),
    belt('yellow-black', 'Yellow/Black', YELLOW, 'black', 'navy', false, 'yellow', 7, 15),
    belt('orange-white', 'Orange/White', ORANGE, 'white', 'white', false, 'orange', 10, 15),
    belt('orange', 'Orange', ORANGE, 'solid', 'white', false, 'orange', 10, 15),
    belt('orange-black', 'Orange/Black', ORANGE, 'black', 'white', false, 'orange', 10, 15),
    belt('green-white', 'Green/White', GREEN, 'white', 'white', false, 'green', 13, 15),
    belt('green', 'Green', GREEN, 'solid', 'white', false, 'green', 13, 15),
    belt('green-black', 'Green/Black', GREEN, 'black', 'white', false, 'green', 13, 15),
  ],
};

const ADULT_WHITE = '#f4f1ea';
const ADULT_STRIPES = [ADULT_WHITE, ADULT_WHITE, ADULT_WHITE, ADULT_WHITE];

function adultBelt(id: string, name: string, base: string, ink: 'navy' | 'white', tapes: string[], unlock?: 'afterBlack'): BeltDef {
  const row: BeltDef = {
    id,
    name,
    base,
    center: 'solid',
    ink,
    tapeColors: tapes,
    bar: id === 'black' || id === 'coral' ? '#d3161b' : '#101012',
    curriculumTier: id,
  };
  if (unlock) row.unlock = unlock;
  return row;
}

/** Adult IBJJF ladder. My rank still stores stripes on `rank`. This id wraps that data. */
export const IBJJF_ADULT_TEMPLATE: BeltTemplate = {
  id: ADULT_IBJJF_TEMPLATE_ID,
  name: 'IBJJF adult',
  kind: 'builtin',
  version: 1,
  ageMode: 'adult',
  belts: [
    adultBelt('white', 'White', '#f1eee5', 'navy', ADULT_STRIPES),
    adultBelt('blue', 'Blue', '#1d4ed8', 'white', ADULT_STRIPES),
    adultBelt('purple', 'Purple', '#7a3ec8', 'white', ADULT_STRIPES),
    adultBelt('brown', 'Brown', '#7b4a2a', 'white', ADULT_STRIPES),
    adultBelt('black', 'Black', '#232326', 'white', [ADULT_WHITE, ADULT_WHITE, ADULT_WHITE, ADULT_WHITE, ADULT_WHITE, ADULT_WHITE]),
    adultBelt('coral', 'Coral', '#d3161b', 'white', ADULT_STRIPES, 'afterBlack'),
    adultBelt('redWhite', 'Red and white', '#f4f1ea', 'navy', ADULT_STRIPES, 'afterBlack'),
    adultBelt('red', 'Red', '#d3161b', 'white', ADULT_STRIPES, 'afterBlack'),
  ],
};

export function templateFromRecord(record: BeltTemplateRecord): BeltTemplate {
  return {
    id: record.id,
    name: record.name,
    kind: 'custom',
    version: record.version,
    baseId: record.baseId,
    ageMode: record.ageMode,
    belts: record.belts.map((row) => ({ ...row, tapeColors: [...row.tapeColors] })),
  };
}

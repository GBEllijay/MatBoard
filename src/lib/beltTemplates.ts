/**
 * Built-in belt templates. IBJJF is the only prebuilt kids ladder.
 * Custom templates are stored on the student's file and edited later.
 * The adult ladder on My rank is not drawn from a template. Its id is a marker
 * so a saved file can say which system it last used.
 */

import type { BeltCenter, BeltTemplateDef, BeltTemplateRecord } from './progress/types.ts';

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
  belts: BeltTemplateDef[];
};

/** White and grey/white: 4 white tapes and 1 red tape. Every other kids belt: 4 white, 4 red, 3 black. */
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
): BeltTemplateDef {
  const row: BeltTemplateDef = {
    id,
    name,
    base,
    center,
    ink,
    tapeColors: ibjjfMonthlyTapes(short),
    group,
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
    belt('grey-white', 'Grey/White', GREY, 'white', 'white', true, 'grey', 4, 15),
    belt('grey', 'Grey', GREY, 'solid', 'white', false, 'grey', 4, 15),
    belt('grey-black', 'Grey/Black', GREY, 'black', 'white', false, 'grey', 4, 15),
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

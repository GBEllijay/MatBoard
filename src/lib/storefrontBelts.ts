import { STOREFRONT_STEPS, type StorefrontStep } from './storefront.ts';

/**
 * Homepage belt ladder: five belts in rank order, replacing the four progression tiles.
 * Product ids, kinds, routes and entitlements are unchanged. Only the Coach tile's
 * user-facing words say Instructor here.
 */
export const BELTS_VARIANTS = ['a', 'b'] as const;
export type BeltsVariant = (typeof BELTS_VARIANTS)[number];

/** a: blue belt with JOURNAL embroidered and a small journal emblem. b: plain blue belt. */
export const DEFAULT_BELTS_VARIANT: BeltsVariant = 'a';

export function beltsVariantOf(raw: string | null | undefined): BeltsVariant {
  const v = (raw ?? '').trim().toLowerCase();
  return (BELTS_VARIANTS as readonly string[]).includes(v) ? (v as BeltsVariant) : DEFAULT_BELTS_VARIANT;
}

export type BeltColor = 'white' | 'blue' | 'purple' | 'brown' | 'black';

export type BeltRung = {
  /** Existing product id where there is one. Academy has no product. */
  id: StorefrontStep['id'] | 'academy';
  belt: BeltColor;
  rank: string;
  rankLabel: string;
  title: string;
  blurb: string;
  /** Empty when there is no product price yet. */
  cardPrice: string;
  status: StorefrontStep['status'];
  /** Router path, or null for the alpha-request mail link. */
  to: StorefrontStep['to'] | null;
};

function step(id: StorefrontStep['id']): StorefrontStep {
  const found = STOREFRONT_STEPS.find((s) => s.id === id);
  if (!found) throw new Error(`missing storefront step ${id}`);
  return found;
}

const white = step('white');
const student = step('student');
const coach = step('coach');
const pro = step('pro');

export const STOREFRONT_BELT_LADDER: readonly BeltRung[] = [
  {
    id: 'white',
    belt: 'white',
    rank: '01',
    rankLabel: white.rankLabel,
    title: white.title,
    blurb: white.blurb,
    cardPrice: white.cardPrice,
    status: white.status,
    to: white.to,
  },
  {
    id: 'student',
    belt: 'blue',
    rank: '02',
    rankLabel: student.rankLabel,
    title: student.title,
    blurb: student.blurb,
    cardPrice: student.cardPrice,
    status: student.status,
    to: student.to,
  },
  {
    id: 'academy',
    belt: 'purple',
    rank: '03',
    rankLabel: 'ACADEMY',
    title: 'Advantage Academy Enhancement Edition',
    blurb: 'Gives access to the scoreboard, round timer and gallery.',
    cardPrice: '',
    status: 'Coming soon',
    to: null,
  },
  {
    id: 'coach',
    belt: 'brown',
    rank: '04',
    rankLabel: 'INSTRUCTOR',
    title: 'Advantage Instructor',
    blurb: coach.blurb,
    cardPrice: coach.cardPrice,
    status: coach.status,
    to: coach.to,
  },
  {
    id: 'pro',
    belt: 'black',
    rank: '05',
    rankLabel: pro.rankLabel,
    title: pro.title,
    blurb: pro.blurb,
    cardPrice: pro.cardPrice,
    status: pro.status,
    to: pro.to,
  },
];

export const STOREFRONT_LADDER_NOTE = 'Student, Academy Enhancement, Instructor and Pro are in alpha testing.';

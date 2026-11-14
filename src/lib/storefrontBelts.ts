import { LEARN_MORE, MEDIA_INFO_PATH } from './learnMore.ts';
import { MEDIA_EDITION_PATH } from './mediaEdition.ts';
import {
  INSTRUCTOR_DRIVE_REQUIREMENT,
  PRO_DRIVE_NOTE,
  PRO_PLUS_CLOUD_DESCRIPTION,
  PRO_PLUS_CLOUD_INFO_PATH,
  PRO_PLUS_CLOUD_NAME,
} from './productNames.ts';
import { INSTRUCTOR_DISPLAY_PRICE_LINE, PRO_PLUS_CLOUD_PRICE_LINE } from './productPrices.ts';
import { STOREFRONT_STEPS, type StorefrontStep } from './storefront.ts';
import { TIER_BUY_PATHS } from './tierBuyPages.ts';

/**
 * Homepage belt ladder: six belts in rank order, replacing the four progression tiles.
 * Product ids, kinds and entitlements are unchanged. Student, Instructor and Pro open
 * their public tier buy pages (lib/tierBuyPages). Only the Coach tile's
 * user-facing words say Instructor here.
 */
export const BELTS_VARIANTS = ['a', 'b'] as const;
export type BeltsVariant = (typeof BELTS_VARIANTS)[number];

/** b (default, owner-approved): plain blue belt. a: blue belt with JOURNAL embroidered and a small journal emblem. */
export const DEFAULT_BELTS_VARIANT: BeltsVariant = 'b';

export function beltsVariantOf(raw: string | null | undefined): BeltsVariant {
  const v = (raw ?? '').trim().toLowerCase();
  return (BELTS_VARIANTS as readonly string[]).includes(v) ? (v as BeltsVariant) : DEFAULT_BELTS_VARIANT;
}

export type BeltColor = 'white' | 'blue' | 'purple' | 'brown' | 'black';

/**
 * Card belt art. `rank` is the colored belt's black bar.
 * `red` is a plain black belt with a red bar (Advantage Pro).
 * `striped` is the black belt with white | red | white (Advantage Pro Plus Cloud).
 */
export type BeltBar = 'rank' | 'red' | 'striped';

export type BeltRung = {
  /** Existing product id where there is one. Academy and Pro Plus Cloud have no product. */
  id: StorefrontStep['id'] | 'academy' | 'pro-cloud';
  belt: BeltColor;
  /** Defaults to the colored belt's black rank bar. */
  bar?: BeltBar;
  rank: string;
  rankLabel: string;
  title: string;
  blurb: string;
  /** Optional second line of plain text under the blurb. */
  detail?: string;
  /** Visible control on this tile, when the tile is not one big link. */
  learnLabel?: string;
  /** Learn more target when it differs from `to`. */
  learnTo?: string;
  /** Empty when there is no product price yet. */
  cardPrice: string;
  status: StorefrontStep['status'];
  /** Router path, or null for the alpha-request mail link. */
  to:
    | StorefrontStep['to']
    | (typeof TIER_BUY_PATHS)[keyof typeof TIER_BUY_PATHS]
    | typeof MEDIA_EDITION_PATH
    | typeof PRO_PLUS_CLOUD_INFO_PATH
    | null;
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
    learnLabel: LEARN_MORE.white.label,
  },
  {
    id: 'student',
    belt: 'blue',
    rank: '02',
    rankLabel: student.rankLabel,
    title: student.title,
    // Homepage ladder copy only; the shared Student product copy is unchanged.
    blurb: 'Personal BJJ Training Journal and More.',
    cardPrice: student.cardPrice,
    status: student.status,
    // Student Edition buy page. White and Media were already wired.
    to: TIER_BUY_PATHS.student,
    learnLabel: LEARN_MORE.student.label,
  },
  {
    id: 'academy',
    belt: 'purple',
    rank: '03',
    rankLabel: 'MEDIA',
    title: 'Advantage Media Edition',
    blurb: 'Scoreboard, round timer, and media console.',
    learnLabel: LEARN_MORE.media.label,
    learnTo: MEDIA_INFO_PATH,
    // Display only: there is no Media (id academy) product in Stripe.
    cardPrice: '$29.99 one-time',
    status: 'This product is in alpha',
    // Public Media Edition page. Still not for sale: its CTA is the alpha-code email.
    to: MEDIA_EDITION_PATH,
  },
  {
    id: 'coach',
    belt: 'brown',
    rank: '04',
    rankLabel: 'INSTRUCTOR',
    title: 'Advantage Instructor Edition',
    blurb: 'Daily lesson plans, videos, and enhanced training tools.',
    detail: INSTRUCTOR_DRIVE_REQUIREMENT,
    cardPrice: INSTRUCTOR_DISPLAY_PRICE_LINE,
    status: coach.status,
    to: TIER_BUY_PATHS.instructor,
    learnLabel: LEARN_MORE.instructor.label,
  },
  {
    id: 'pro',
    belt: 'black',
    rank: '05',
    rankLabel: pro.rankLabel,
    title: pro.title,
    // Homepage ladder copy only; the shared Pro product copy is unchanged.
    blurb:
      'Academy Enhancement Software for Gym Owners and Jiu-Jitsu Professionals.',
    detail: PRO_DRIVE_NOTE,
    cardPrice: pro.cardPrice,
    status: pro.status,
    to: TIER_BUY_PATHS.pro,
    learnLabel: LEARN_MORE.pro.label,
    bar: 'red',
  },
  {
    id: 'pro-cloud',
    belt: 'black',
    bar: 'striped',
    rank: '06',
    rankLabel: 'PRO+',
    title: PRO_PLUS_CLOUD_NAME,
    blurb: PRO_PLUS_CLOUD_DESCRIPTION,
    cardPrice: PRO_PLUS_CLOUD_PRICE_LINE,
    status: 'This product is in alpha',
    to: PRO_PLUS_CLOUD_INFO_PATH,
    learnLabel: LEARN_MORE.proCloud.label,
  },
];

export const STOREFRONT_LADDER_NOTE = 'Student, Media, Instructor, Pro and Advantage Pro + Cloud are in alpha testing.';

/**
 * One public buy page per tier, all built from the White /buy template:
 * big belt in the tier color, name, total price, what's included, the
 * checkout or alpha area, Restore, and then only the higher tiers.
 *
 * Display only. Nothing here starts a sale, adds a Stripe price, or changes an
 * entitlement. The gated checkout routes (/buy/student, /buy/coach, /buy/pro)
 * and their guards are untouched; these pages live at their own public paths.
 */
import { COMING_SOON_ADS, type ComingSoonFeature } from './comingSoonAds.ts';
import {
  MEDIA_EDITION_FEATURES,
  MEDIA_EDITION_INCLUDES,
  MEDIA_EDITION_LEAD,
  MEDIA_EDITION_LIST_PRICE_CENTS,
  MEDIA_EDITION_NAME,
  MEDIA_EDITION_PATH,
  MEDIA_EDITION_PRICE_DETAIL,
} from './mediaEdition.ts';
import {
  COACH_HOME_DESCRIPTION,
  INSTRUCTOR_HOME_TITLE,
  PRO_HOME_LINES,
  STUDENT_EDITION_NAME,
  STUDENT_HOME_DESCRIPTION,
} from './productNames.ts';
import {
  EDITION_ALPHA_NOTE,
  EDITION_EMAIL_DISPLAY,
  PRO_LIST_PRICE_CENTS,
  PRO_MONTHLY_PRICE_CENTS,
  STUDENT_ALPHA_ACCESS_NOTE,
  STUDENT_LIST_PRICE_CENTS,
} from './productPrices.ts';
import { SITE_FEEDBACK_EMAIL } from './siteFooter.ts';
import {
  WHITE_BUY_PATH,
  WHITE_FEATURES,
  WHITE_INCLUDED,
  WHITE_PRICE_DETAIL,
  WHITE_PRICE_LABEL,
  formatUsdFromCents,
} from './whitePurchase.ts';

export type TierId = 'white' | 'student' | 'media' | 'instructor' | 'pro';

/** Same five colors as the homepage belt ladder (STOREFRONT_BELT_LADDER). */
export type TierBelt = 'white' | 'blue' | 'purple' | 'brown' | 'black';

/** Homepage ladder cloth (src/pages/storefront.css --sf-belt-*). */
export const TIER_BELT_CLOTH: Record<TierBelt, string> = {
  white: '#f4f1ea',
  blue: '#2a5cf0',
  purple: '#6b2d91',
  brown: '#6b3a1f',
  black: '#0a0b0e',
};

/**
 * Public buy page per tier. White is today's /buy and Media is today's /media.
 * Student, Instructor and Pro get new public paths so the gated checkout
 * routes keep their guards.
 */
export const TIER_BUY_PATHS = {
  white: WHITE_BUY_PATH,
  student: '/editions/student',
  media: MEDIA_EDITION_PATH,
  instructor: '/editions/instructor',
  pro: '/editions/pro',
} as const satisfies Record<TierId, string>;

/** Instructor display price. Stripe still charges the Coach product at COACH_LIST_PRICE_CENTS. */
export const INSTRUCTOR_DISPLAY_PRICE_CENTS = 4999;

/** Same line as PRO_HOME_LINES ends with, and the owner's Pro page line. */
export const PRO_INCLUDES_ALL = 'Includes all Advantage products.';

export const LAUNCH_PRICE_DETAIL = 'USD — one-time, when it launches';

export type TierAlpha = { note: string; display: string };

export type TierBuyEntry = {
  id: TierId;
  name: string;
  belt: TierBelt;
  /** Big price, e.g. "$19.99". */
  price: string;
  /** Line under the big price. */
  priceDetail: string;
  /** One line on the higher-tier card. */
  blurb: string;
  /** Lead line in the page's belt header. */
  lead: string;
  /** "Includes everything in …" line. */
  includes: string;
  included: readonly string[];
  features: readonly ComingSoonFeature[];
  path: string;
  alpha: TierAlpha | null;
};

const EDITION_ALPHA: TierAlpha = { note: EDITION_ALPHA_NOTE, display: EDITION_EMAIL_DISPLAY };

export const TIER_LADDER: readonly TierBuyEntry[] = [
  {
    id: 'white',
    name: 'Advantage White',
    belt: 'white',
    price: WHITE_PRICE_LABEL,
    priceDetail: WHITE_PRICE_DETAIL,
    blurb: 'BJJ scoreboard and round timer.',
    lead: 'BJJ scoreboard and round timer.',
    includes: '',
    included: WHITE_INCLUDED,
    features: WHITE_FEATURES.map((title) => ({ title, body: '' })),
    path: TIER_BUY_PATHS.white,
    alpha: null,
  },
  {
    id: 'student',
    name: STUDENT_EDITION_NAME,
    belt: 'blue',
    price: formatUsdFromCents(STUDENT_LIST_PRICE_CENTS),
    priceDetail: LAUNCH_PRICE_DETAIL,
    blurb: STUDENT_HOME_DESCRIPTION,
    lead: COMING_SOON_ADS.student.lead,
    includes: COMING_SOON_ADS.student.includes,
    included: [],
    features: COMING_SOON_ADS.student.features,
    path: TIER_BUY_PATHS.student,
    alpha: { note: STUDENT_ALPHA_ACCESS_NOTE, display: SITE_FEEDBACK_EMAIL },
  },
  {
    id: 'media',
    name: MEDIA_EDITION_NAME,
    belt: 'purple',
    price: formatUsdFromCents(MEDIA_EDITION_LIST_PRICE_CENTS),
    priceDetail: MEDIA_EDITION_PRICE_DETAIL,
    blurb: MEDIA_EDITION_LEAD,
    lead: MEDIA_EDITION_LEAD,
    includes: MEDIA_EDITION_INCLUDES,
    included: [],
    features: MEDIA_EDITION_FEATURES,
    path: TIER_BUY_PATHS.media,
    alpha: EDITION_ALPHA,
  },
  {
    id: 'instructor',
    name: INSTRUCTOR_HOME_TITLE,
    belt: 'brown',
    price: formatUsdFromCents(INSTRUCTOR_DISPLAY_PRICE_CENTS),
    priceDetail: LAUNCH_PRICE_DETAIL,
    blurb: COACH_HOME_DESCRIPTION,
    lead: COMING_SOON_ADS.coach.lead,
    includes: COMING_SOON_ADS.coach.includes,
    included: [],
    features: COMING_SOON_ADS.coach.features,
    path: TIER_BUY_PATHS.instructor,
    alpha: EDITION_ALPHA,
  },
  {
    id: 'pro',
    name: 'Advantage Pro',
    belt: 'black',
    price: `${formatUsdFromCents(PRO_LIST_PRICE_CENTS)} + ${formatUsdFromCents(PRO_MONTHLY_PRICE_CENTS)}/mo`,
    priceDetail: `USD — one-time, plus ${formatUsdFromCents(PRO_MONTHLY_PRICE_CENTS)}/month, when it launches`,
    blurb: PRO_HOME_LINES[0],
    lead: COMING_SOON_ADS.pro.lead,
    includes: PRO_INCLUDES_ALL,
    included: [],
    features: COMING_SOON_ADS.pro.features,
    path: TIER_BUY_PATHS.pro,
    alpha: EDITION_ALPHA,
  },
];

export function tierEntry(id: TierId): TierBuyEntry {
  const found = TIER_LADDER.find((t) => t.id === id);
  if (!found) throw new Error(`missing tier ${id}`);
  return found;
}

/** Only the tiers above this one, in ladder order. Pro has none. */
export function higherTiers(id: TierId): readonly TierBuyEntry[] {
  const at = TIER_LADDER.findIndex((t) => t.id === id);
  return at < 0 ? [] : TIER_LADDER.slice(at + 1);
}

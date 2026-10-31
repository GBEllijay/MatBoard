import {
  COACH_HOME_DESCRIPTION,
  PRODUCTS_PATH,
  PRO_HOME_LINES,
  STUDENT_EDITION_NAME,
  STUDENT_HOME_DESCRIPTION,
} from './productNames.ts';
import { COACH_PRICE_LINE, PRO_PRICE_LINE, STUDENT_PRICE_LINE } from './productPrices.ts';
import { WHITE_BUY_PATH, WHITE_PRICE_LABEL } from './whitePurchase.ts';

/** Public storefront buy button. Same checkout route as the White paywall. */
export const STOREFRONT_BUY_PATH = WHITE_BUY_PATH;

export const STOREFRONT_PRICE_LABEL = WHITE_PRICE_LABEL;

/** Yellow hero button. Checkout stays on the existing buy page. */
export const STOREFRONT_BUY_LABEL = `Buy Advantage White — ${STOREFRONT_PRICE_LABEL}`;

export const STOREFRONT_HERO = {
  title: 'Win by Advantage.',
  leadBeforeBreak: 'Your gym scoreboard, round timer, and management software.',
  leadAfterBreak: 'Run it from your phone.',
  sub: 'Points, advantages and penalties big enough to read across the gym, on the TV or a second screen.',
  fine: 'One-time purchase. Yours to keep.',
  clock: '05:00',
} as const;

/** In-page nav. No Belt progression link. */
export const STOREFRONT_NAV = [
  { href: '#scoreboard', label: 'Scoreboard' },
  { href: '#round-timer', label: 'Round timer' },
] as const;

export const STOREFRONT_POINTS = [
  {
    id: 'points',
    title: 'Points',
    body: 'Score the match from the phone in your hand.',
  },
  {
    id: 'advantages',
    title: 'Advantages',
    body: 'Big enough to read from the back of the mat.',
  },
  {
    id: 'penalties',
    title: 'Penalties',
    body: 'On the TV or a second screen, for everyone to see.',
  },
] as const;

export const STOREFRONT_WOODBLOCKS = {
  scoreboard: {
    webp: '/homepage/woodblock-scoreboard.webp',
    jpg: '/homepage/woodblock-scoreboard.jpg',
    width: 1280,
    height: 720,
    alt: 'Woodblock-style illustration of kids rolling at the gym while the Advantage scoreboard runs on the wall TV',
    caption: 'Scoreboard on the gym TV',
    detail: 'Scored from a phone on the mat.',
  },
  timer: {
    webp: '/homepage/woodblock-timer.webp',
    jpg: '/homepage/woodblock-timer.jpg',
    width: 1280,
    height: 720,
    alt: 'Woodblock-style illustration of kids rolling at the gym while the Advantage round timer runs on the wall TV',
    caption: 'Round timer between rounds',
    detail: 'Work, rest, next round.',
  },
} as const;

export const STOREFRONT_TIMER = {
  eyebrow: 'Between rounds',
  title: 'Round timer',
  body: 'Set the rounds and keep the clock on the display. Music in another app keeps playing while you train.',
} as const;

export const STOREFRONT_PROGRESS_EYEBROW = 'Progression';

/** Owner: this heading opens the pre-Pass-2 product picker, not checkout. */
export const STOREFRONT_PROGRESS_HEADING = 'Start with White. Grow into Pro.';

export const STOREFRONT_ALPHA_NOTE = 'Student, Coach and Pro are in alpha testing.';

export type StorefrontSoonId = 'student' | 'coach' | 'pro';

export type StorefrontStepId = 'white' | StorefrontSoonId;

export type StorefrontStep = {
  id: StorefrontStepId;
  rank: string;
  rankLabel: string;
  title: string;
  blurb: string;
  /** Canonical list price. Pro keeps the long checkout line here. */
  price: string;
  /** Short price printed on the progression card. */
  cardPrice: string;
  /** White uses the hero checkout route. The other cards open the edition picker. */
  to: typeof STOREFRONT_BUY_PATH | typeof PRODUCTS_PATH;
  /** These cards do not start a separate sale. White checkout is the hero route. */
  forSale: false;
  status: 'Available now' | 'Coming soon';
};

/**
 * Pass 2 progression, top to bottom.
 * The White card opens the same checkout as the hero Buy button.
 * Student, Coach, and Pro open the edition picker.
 */
export const STOREFRONT_STEPS: readonly StorefrontStep[] = [
  {
    id: 'white',
    rank: '01',
    rankLabel: 'WHITE',
    title: 'Advantage White',
    blurb: 'BJJ scoreboard and round timer.',
    price: `${STOREFRONT_PRICE_LABEL} one-time`,
    cardPrice: `${STOREFRONT_PRICE_LABEL} one-time`,
    to: STOREFRONT_BUY_PATH,
    forSale: false,
    status: 'Available now',
  },
  {
    id: 'student',
    rank: '02',
    rankLabel: 'STUDENT',
    title: STUDENT_EDITION_NAME,
    blurb: 'A personal BJJ training journal.',
    price: STUDENT_PRICE_LINE,
    cardPrice: STUDENT_PRICE_LINE,
    to: PRODUCTS_PATH,
    forSale: false,
    status: 'Coming soon',
  },
  {
    id: 'coach',
    rank: '03',
    rankLabel: 'COACH',
    title: 'Advantage Coach',
    blurb: 'Daily lesson plans, training videos and a technique tree. Includes White.',
    price: COACH_PRICE_LINE,
    cardPrice: COACH_PRICE_LINE,
    to: PRODUCTS_PATH,
    forSale: false,
    status: 'Coming soon',
  },
  {
    id: 'pro',
    rank: '04',
    rankLabel: 'PRO',
    title: 'Advantage Pro',
    blurb:
      'Academy management, shared drive, events, pro shop, gallery, instructor collaboration and student seats. Includes Coach.',
    price: PRO_PRICE_LINE,
    cardPrice: '$99.99 + $5.99/mo',
    to: PRODUCTS_PATH,
    forSale: false,
    status: 'Coming soon',
  },
];

/**
 * Bottom of the public homepage, in this order.
 * Each item opens the edition picker. None of these start checkout.
 */
export const STOREFRONT_COMING_SOON: readonly StorefrontStep[] = STOREFRONT_STEPS.filter(
  (step): step is StorefrontStep & { id: StorefrontSoonId } => step.id !== 'white',
);

/**
 * Owner-required picker links. These three open the homepage that existed
 * before Pass 2 (`/products`). They do not open /buy, a product hub, or an anchor.
 */
export const STOREFRONT_PICKER_LINKS = [
  {
    id: 'progress-heading',
    label: STOREFRONT_PROGRESS_HEADING,
    to: PRODUCTS_PATH,
  },
  {
    id: 'student',
    label: STUDENT_EDITION_NAME,
    to: STOREFRONT_STEPS.find((step) => step.id === 'student')?.to ?? PRODUCTS_PATH,
  },
  {
    id: 'coach',
    label: 'Advantage Coach',
    to: STOREFRONT_STEPS.find((step) => step.id === 'coach')?.to ?? PRODUCTS_PATH,
  },
] as const;

/** Picker copy stays on /products. Pass 2 cards use the shorter blurbs above. */
export const STOREFRONT_UNCHANGED_PICKER_COPY = {
  student: STUDENT_HOME_DESCRIPTION,
  coach: COACH_HOME_DESCRIPTION,
  pro: PRO_HOME_LINES.join(' '),
} as const;

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

export type StorefrontSoonId = 'student' | 'coach' | 'pro';

export type StorefrontSoonItem = {
  id: StorefrontSoonId;
  title: string;
  price: string;
  teaser: string;
  to: typeof PRODUCTS_PATH;
  /** Coach and Pro stay off checkout. Student Edition is not sold on the storefront either. */
  forSale: false;
  status: 'Coming soon' | 'Not for sale yet';
};

/**
 * Bottom of the public homepage, in this order.
 * Each item opens the edition picker. None of these start checkout.
 */
export const STOREFRONT_COMING_SOON: readonly StorefrontSoonItem[] = [
  {
    id: 'student',
    title: STUDENT_EDITION_NAME,
    price: STUDENT_PRICE_LINE,
    teaser: STUDENT_HOME_DESCRIPTION,
    to: PRODUCTS_PATH,
    forSale: false,
    status: 'Coming soon',
  },
  {
    id: 'coach',
    title: 'Advantage Coach',
    price: COACH_PRICE_LINE,
    teaser: COACH_HOME_DESCRIPTION,
    to: PRODUCTS_PATH,
    forSale: false,
    status: 'Not for sale yet',
  },
  {
    id: 'pro',
    title: 'Advantage Pro',
    price: PRO_PRICE_LINE,
    teaser: PRO_HOME_LINES.join(' '),
    to: PRODUCTS_PATH,
    forSale: false,
    status: 'Not for sale yet',
  },
];

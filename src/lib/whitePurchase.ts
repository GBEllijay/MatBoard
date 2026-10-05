/** One-time Advantage White list price. Stripe Price id lives in STRIPE_PRICE_WHITE. */
export const WHITE_LIST_PRICE_CENTS = 999;

export const WHITE_CURRENCY = 'usd';

export const WHITE_BUY_PATH = '/buy';

export const WHITE_CHECKOUT_API = '/api/checkout';

export const WHITE_ENTITLEMENT_API = '/api/entitlement';

/** Must match the server product metadata sent to Stripe. */
export const WHITE_PRODUCT_ID = 'advantage-white';

export const WHITE_PRICE_LABEL = '$9.99';

/** Sits beside the price on the buy header. */
export const WHITE_PRICE_DETAIL = 'USD — One Time Purchase';

/** Header line. Card numbers stay on Stripe. */
export const WHITE_STRIPE_NOTE =
  'Payments processed through Stripe. Card details are entered on Stripe, not on this page.';

/**
 * In-app unlock on /buy. Grants Advantage White at $0 with no Stripe call.
 * Must match API_FREE_CODE.
 */
export const WHITE_FREE_CODE = 'WHITEFREE';

export function isWhiteFreeCode(raw: string): boolean {
  return raw.trim().toUpperCase() === WHITE_FREE_CODE;
}

/**
 * Launch promo placeholders. Create these in the Stripe Dashboard (test mode).
 * The public buy page has an enter-a-code field and does not print these names.
 * WHITEFREE unlocks in the app. Any other code is sent with Checkout.
 * $9.99 minus the amount off is the charge.
 */
export const WHITE_LAUNCH_PROMOS = [
  {
    code: 'WHITE499',
    couponId: 'advantage_white_499',
    amountOffCents: 500,
    label: '$4.99',
  },
  {
    code: 'WHITE099',
    couponId: 'advantage_white_099',
    amountOffCents: 900,
    label: '$0.99',
  },
] as const;

export const WHITE_INCLUDED = [
  'Tournament Style BJJ Scoreboard',
  'Fully Customizable Round Timer',
] as const;

export const WHITE_FEATURES = [
  'Installs on Phone or Desktop from your browser — Add to Home Screen or Install.',
  'Easily cast the scoreboard or timer to a TV or monitor.',
  'Keep a music app playing while you train.',
] as const;

/** Footer line on /buy. Coach and Pro are not part of this checkout. */
export { ALPHA_ACCESS_NOTE as WHITE_UPGRADE_NOTE } from './productPrices.ts';

export function priceAfterAmountOff(listCents: number, amountOffCents: number): number {
  return Math.max(0, listCents - amountOffCents);
}

export function formatUsdFromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${remainder}`;
}

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

/** Standard one-time Advantage White list price. Stripe Price id lives in STRIPE_PRICE_WHITE. */
export const WHITE_LIST_PRICE_CENTS = 1999;

/** Two-month launch price. Stripe Price id lives in STRIPE_PRICE_WHITE_LAUNCH. */
export const WHITE_LAUNCH_PRICE_CENTS = 1599;

export const WHITE_CURRENCY = 'usd';

export const WHITE_BUY_PATH = '/buy';

export const WHITE_CHECKOUT_API = '/api/checkout';

export const WHITE_ENTITLEMENT_API = '/api/entitlement';

/** Must match the server product metadata sent to Stripe. */
export const WHITE_PRODUCT_ID = 'advantage-white';

export const WHITE_PRICE_LABEL = '$19.99';

export const WHITE_LAUNCH_PRICE_LABEL = '$15.99';

export const WHITE_PRICE_LINE = '$19.99 one-time';

/** Sits beside the price on the buy header. */
export const WHITE_PRICE_DETAIL = 'USD — One Time Purchase';

/** Header line. Card numbers stay on Stripe. */
export const WHITE_STRIPE_NOTE =
  'Payments processed through Stripe. Card details are entered on Stripe, not on this page.';

/** Owner 2026-11-23: subtitle under the Advantage White heading on /buy, above the price. */
export const WHITE_BUY_SUBTITLE = 'BJJ scoreboard, round timer, and mock tournament software';

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

export function whiteBuyCtaLabel(activePriceCents = WHITE_LIST_PRICE_CENTS): string {
  return `Buy Advantage BJJ Scoreboard — ${formatUsdFromCents(activePriceCents)}`;
}

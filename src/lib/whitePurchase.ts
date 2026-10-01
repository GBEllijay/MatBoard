/** One-time Advantage White list price. Stripe Price id lives in STRIPE_PRICE_WHITE. */
export const WHITE_LIST_PRICE_CENTS = 999;

export const WHITE_CURRENCY = 'usd';

export const WHITE_BUY_PATH = '/buy';

export const WHITE_CHECKOUT_API = '/api/checkout';

export const WHITE_ENTITLEMENT_API = '/api/entitlement';

/** Must match the server product metadata sent to Stripe. */
export const WHITE_PRODUCT_ID = 'advantage-white';

export const WHITE_PRICE_LABEL = '$9.99';

/**
 * Launch promo placeholders. Create these in the Stripe Dashboard (test mode).
 * The app does not create coupons. Checkout accepts the code on this page or on Stripe.
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
  'Round Timer with Advantage branding',
  'Basic Match Scoreboard',
  'Cast / TV',
] as const;

export const WHITE_NOT_INCLUDED = [
  'Old School / Mock skin picker extras beyond the default scoreboard',
  'Master Carlos',
  'Advantage Coach',
  'Advantage Pro',
] as const;

/** Text only. Coach and Pro are not part of this checkout. */
export const WHITE_UPGRADE_NOTE =
  'Advantage Coach and Advantage Pro are separate products. This purchase is White only. You can add Coach or Pro later when they are for sale.';

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

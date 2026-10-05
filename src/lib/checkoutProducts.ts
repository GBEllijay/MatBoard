/** Checkout product keys. Price ids stay in server env, never in this file. */

export const CHECKOUT_PRODUCTS = ['white', 'coach', 'pro'] as const;

export type CheckoutProduct = (typeof CHECKOUT_PRODUCTS)[number];

/** Return path after Stripe hosted Checkout. White stays on the public buy page. */
export const CHECKOUT_BUY_PATH: Record<CheckoutProduct, string> = {
  white: '/buy',
  coach: '/buy/coach',
  pro: '/buy/pro',
};

export function isCheckoutProduct(value: string): value is CheckoutProduct {
  return (CHECKOUT_PRODUCTS as readonly string[]).includes(value);
}

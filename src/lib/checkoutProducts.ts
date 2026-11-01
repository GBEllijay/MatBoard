/** Checkout product keys. Price ids stay in server env, never in this file. */

/** Media Edition joined in Nov 2026 (STRIPE_PRICE_MEDIA). `coach` is the Instructor Edition internally. */
export const CHECKOUT_PRODUCTS = ['white', 'student', 'coach', 'pro', 'media'] as const;

export type CheckoutProduct = (typeof CHECKOUT_PRODUCTS)[number];

/** Return path after Stripe hosted Checkout. White stays on the public buy page. */
export const CHECKOUT_BUY_PATH: Record<CheckoutProduct, string> = {
  white: '/buy',
  student: '/buy/student',
  coach: '/buy/coach',
  pro: '/buy/pro',
  media: '/buy/media',
};

export function isCheckoutProduct(value: string): value is CheckoutProduct {
  return (CHECKOUT_PRODUCTS as readonly string[]).includes(value);
}

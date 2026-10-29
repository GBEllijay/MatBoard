import type { StripeRuntimeEnv } from './stripeCheckout.ts';

/**
 * Current Advantage Pro monthly price ($5.99).
 * Checkout still sends STRIPE_PRICE_PRO_MONTHLY. This id stays in the
 * entitlement set so a subscriber on it is recognized even when that env
 * var points somewhere else. It is a price id, not a secret.
 */
export const PRO_MONTHLY_PRICE_ID = 'price_1UPWlhARhGonKqrOttvZ4VNS';

/** Monthly $5.99, the legacy $2.99 discount price, and the one-time Pro line. */
export function proPriceIds(env: StripeRuntimeEnv): Set<string> {
  const ids = [
    PRO_MONTHLY_PRICE_ID,
    env.STRIPE_PRICE_PRO_MONTHLY,
    env.STRIPE_PRICE_PRO_MONTHLY_DISCOUNT,
    env.STRIPE_PRICE_PRO,
  ];
  const set = new Set<string>();
  for (const id of ids) {
    const trimmed = id?.trim() ?? '';
    if (trimmed.startsWith('price_')) set.add(trimmed);
  }
  return set;
}

export function matchesProPrice(priceIds: readonly string[], env: StripeRuntimeEnv): boolean {
  const known = proPriceIds(env);
  return priceIds.some((id) => known.has(id));
}

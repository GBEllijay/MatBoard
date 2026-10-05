/** Keep in sync with src/lib/whitePurchase.ts. */
export const API_PRODUCT_ID = 'advantage-white';

/** Stripe metadata for gated Coach Checkout. Not a public catalog flag. */
export const API_PRODUCT_COACH = 'advantage-coach';

/** Stripe metadata for gated Pro Checkout (one-time plus monthly). */
export const API_PRODUCT_PRO = 'advantage-pro';

/** In-app free unlock. Same string as WHITE_FREE_CODE. Does not call Stripe. */
export const API_FREE_CODE = 'WHITEFREE';

export const API_CHECKOUT_PATH = '/api/checkout';

export const API_ENTITLEMENT_PATH = '/api/entitlement';

export const API_WEBHOOK_PATH = '/api/stripe/webhook';

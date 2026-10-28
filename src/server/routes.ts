/** Keep in sync with src/lib/whitePurchase.ts. */
export const API_PRODUCT_ID = 'advantage-white';

/** Stripe metadata for gated Student Edition Checkout. One-time. Not a public buy button. */
export const API_PRODUCT_STUDENT = 'advantage-student';

/** Stripe metadata for gated Coach Checkout. Not a public catalog flag. */
export const API_PRODUCT_COACH = 'advantage-coach';

/** Stripe metadata for gated Pro Checkout (one-time plus monthly). */
export const API_PRODUCT_PRO = 'advantage-pro';

export const API_CHECKOUT_PATH = '/api/checkout';

export const API_ENTITLEMENT_PATH = '/api/entitlement';

export const API_WEBHOOK_PATH = '/api/stripe/webhook';

export const API_CODES_REDEEM_PATH = '/api/codes/redeem';

export const API_OWNER_TEST_PATH = '/api/owner-test';

export const API_CHECKOUT_CONFIRM_PATH = '/api/checkout-confirm';

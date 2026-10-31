/** Keep in sync with src/lib/whitePurchase.ts. */
export const API_PRODUCT_ID = 'advantage-white';

/** Stripe metadata for gated Student Edition Checkout. One-time. Not a public buy button. */
export const API_PRODUCT_STUDENT = 'advantage-student';

/** Stripe metadata for gated Coach Checkout. Not a public catalog flag. */
export const API_PRODUCT_COACH = 'advantage-coach';

/** Stripe metadata for gated Pro Checkout (one-time plus monthly). */
export const API_PRODUCT_PRO = 'advantage-pro';

/**
 * Media Edition grant rows (codes and owner today). There is NO Stripe product yet.
 * FUTURE STRIPE SPOT: when the owner creates the $29.99 one-time Media Edition price,
 * wire its price ID through the same env pattern as the other products
 * (see src/server/stripeCheckout.ts, "MEDIA EDITION PRICE SPOT"). Nothing reads one today.
 */
export const API_PRODUCT_MEDIA = 'advantage-media';

export const API_CHECKOUT_PATH = '/api/checkout';

export const API_ENTITLEMENT_PATH = '/api/entitlement';

export const API_WEBHOOK_PATH = '/api/stripe/webhook';

export const API_CODES_REDEEM_PATH = '/api/codes/redeem';

export const API_OWNER_TEST_PATH = '/api/owner-test';

export const API_CHECKOUT_CONFIRM_PATH = '/api/checkout-confirm';

export const API_CONFIG_PATH = '/api/config';

export const API_SESSION_REDEEM_PATH = '/api/session/redeem';

export const API_TOKEN_REFRESH_PATH = '/api/token/refresh';

export const API_RESTORE_REQUEST_PATH = '/api/restore/request';

export const API_RESTORE_VERIFY_PATH = '/api/restore/verify';

export const API_DEVICES_REVOKE_PATH = '/api/devices/revoke-others';

export const API_BILLING_PORTAL_PATH = '/api/billing/portal';

export const API_SEATS_ISSUE_PATH = '/api/seats/issue';

export const API_SEATS_ACCEPT_PATH = '/api/seats/accept';

export const API_SEATS_REVOKE_PATH = '/api/seats/revoke';

export const API_SEATS_RESET_PATH = '/api/seats/reset';

export const API_SEATS_LIST_PATH = '/api/seats/list';

export const API_SEATS_SYNC_PATH = '/api/seats/sync';

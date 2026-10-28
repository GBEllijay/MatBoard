/**
 * Owner decisions for the paywall. Phase 1 records them and enforces only the
 * pieces that belong in this phase (code caps and the free White campaign).
 * Signed tokens, device registry, subscription state, seat enforcement, and
 * restore email are later phases. See docs/paywall-phase-plan.md.
 */

/** Pro checkout stays one-time plus monthly. Prices are not changed here. */
export const PRO_ONE_TIME_CENTS = 9999;
export const PRO_MONTHLY_CENTS = 599;

/** Days of full Pro access after the first failed payment. Lock on day 8. */
export const PRO_GRACE_DAYS = 7;

/** Paused subscriptions are locked. Access ends when Stripe stops retrying. */
export const PAUSED_SUBSCRIPTION_LOCKED = true;

/** Pro token life and extra offline days. Not issued in Phase 1. */
export const PRO_TOKEN_DAYS = 7;
export const PRO_OFFLINE_GRACE_DAYS = 3;

/** One-time purchases: token life, then fail open while the server is unreachable. */
export const ONETIME_TOKEN_DAYS = 30;
export const ONETIME_FAIL_OPEN_DAYS = 90;

/** A full refund or a lost dispute revokes a one-time purchase. Webhook lands later. */
export const REFUND_REVOKES_ONETIME = true;

/** Soft device cap. Active means seen in the last 60 days. Not enforced in Phase 1. */
export const PRO_DEVICES_PER_LICENSE = 5;
export const DEVICE_ACTIVE_DAYS = 60;

/**
 * Instructor seats. The cap is the existing client budget. Server enforcement
 * of seats is a later phase. One device per seat unless the owner raises this.
 */
export const INSTRUCTOR_SEAT_CAP = 10;
export const DEVICES_PER_INSTRUCTOR_SEAT = 1;

/** Seat email is a label for the invited person, not a login. */
export const SEAT_EMAIL_IS_LABEL = true;

/** Amnesty for old browser-local unlocks. No paying customers yet, so migration stays minimal. */
export const LEGACY_UNLOCK_AMNESTY_DAYS = 45;

/** Restore mail will come from this address later. Phase 1 does not send mail. */
export const RESTORE_FROM_ADDRESS = 'contact@advantagebjjtimer.com';

/** Free White campaign. Email is optional; IP and total caps still apply. */
export const FREE_WHITE_TOTAL_CAP = 300;
export const FREE_WHITE_DAILY_CAP = 25;
export const FREE_WHITE_PER_EMAIL = 1;
export const FREE_WHITE_PER_IP_PER_DAY = 2;
export const FREE_WHITE_GRANT_DAYS = 90;

export const GENERIC_CODE_FAILURE = "That code didn't work.";

export const CODE_SETUP_ERROR =
  'Code checks are not set up yet. Set CODE_HASH_PEPPER and seed the code catalog before using a code.';

export const CAP_STORE_ERROR =
  'Unlock caps are not set up yet. Bind WHITE_ENTITLEMENTS (or CODE_REDEMPTIONS) before using a capped code.';

export const RATE_LIMIT_ERROR = 'Too many attempts. Wait a few minutes and try again.';

export const ENTITLEMENT_GENERIC_MESSAGE =
  'If you already paid, finish checkout on this device or enter a code. This check does not say whether an email has a purchase.';

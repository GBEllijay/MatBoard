import { SITE_FEEDBACK_EMAIL } from './siteFooter.ts';

/** One-time Advantage Student Edition list price. Checkout product `student`. The public buy page does not sell it. */
export const STUDENT_LIST_PRICE_CENTS = 1999;

/** One-time Advantage Coach list price. Checkout exists; the public home does not sell it. */
export const COACH_LIST_PRICE_CENTS = 2999;

/**
 * One-time Instructor Edition (checkout product `coach`) price: STRIPE_PRICE_INSTRUCTOR.
 * /buy/coach shows this amount and the server refuses to start coach Checkout unless the
 * configured Stripe price has exactly this unit_amount.
 */
export const INSTRUCTOR_LIST_PRICE_CENTS = 4999;

/** One-time Advantage Pro list price. The previous list price was not stored in this repo. */
export const PRO_LIST_PRICE_CENTS = 9999;

/** Monthly Advantage Pro price. The Pro Checkout session includes this with the one-time price. */
export const PRO_MONTHLY_PRICE_CENTS = 599;

export const STUDENT_PRICE_LINE = '$19.99 one-time';

export const COACH_PRICE_LINE = '$29.99 one-time';

/** Instructor Edition (id coach) price line on /products and the homepage belt ladder. Matches INSTRUCTOR_LIST_PRICE_CENTS. */
export const INSTRUCTOR_DISPLAY_PRICE_LINE = '$49.99 one-time';

/** One-time Media Edition list price. Checkout product `media`, env STRIPE_PRICE_MEDIA. */
export const MEDIA_LIST_PRICE_CENTS = 2999;

/** Display only. Matches the homepage belt ladder. */
export const MEDIA_PRICE_LINE = '$29.99 one-time';

/** Pro base price. Advantage Cloud is not included. */
export const PRO_PRICE_LINE = '$99.99 one-time';

/** Shown on Media, Instructor, and Pro. Not a second product and not part of the base price. */
export const CLOUD_ADDON_LINE = '+ optional Advantage Cloud $5.99/month';

export const CLOUD_ADDON_CHECKBOX =
  "Include Advantage Cloud access ($5.99/month), so you don't need your own Google Drive or OneDrive";

export const ALPHA_PRODUCT_STATUS = 'This product is in alpha';

export const INSTRUCTOR_CLOUD_FIT = 'Advantage works best with Google Drive or Advantage Cloud.';

export const INSTRUCTOR_CLOUD_LIMIT =
  'Without a cloud, some sharing features are limited. The app still works.';

/**
 * Display only. Advantage Pro Plus Cloud is the $5.99/month hosted-storage plan.
 * No Stripe price is wired for it, and this line must not be sent to Checkout.
 */
export const PRO_PLUS_CLOUD_PRICE_LINE = '$5.99/month';

/** Locked-card alpha line. The address is the existing support inbox. */
export function alphaAccessNote(product: string): string {
  return `${product} is in alpha testing. Email ${SITE_FEEDBACK_EMAIL} to request an alpha code.`;
}

export const WHITE_ALPHA_ACCESS_NOTE = alphaAccessNote('White');

export const STUDENT_ALPHA_ACCESS_NOTE = alphaAccessNote('Student Edition');

/** One shared line under the price on the Media, Instructor and Pro cards. */
export const EDITION_ALPHA_NOTE = `In alpha testing. Email ${SITE_FEEDBACK_EMAIL} for a free alpha code.`;

/** Display casing for the edition cards' mailto link text. */
export const EDITION_EMAIL_DISPLAY = 'advantageappLLC@gmail.com';

export const COACH_ALPHA_ACCESS_NOTE = alphaAccessNote('Instructor Edition');

export const PRO_ALPHA_ACCESS_NOTE = alphaAccessNote('Pro');

/** Coming soon page, where Coach and Pro share one line. */
export const ALPHA_ACCESS_NOTE = `Coach and Pro are in alpha testing. Email ${SITE_FEEDBACK_EMAIL} to request an alpha code.`;

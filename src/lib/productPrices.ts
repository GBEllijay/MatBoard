import { SITE_FEEDBACK_EMAIL } from './siteFooter.ts';

/** One-time Advantage Student Edition list price. Checkout product `student`. The public buy page does not sell it. */
export const STUDENT_LIST_PRICE_CENTS = 1999;

/** One-time Advantage Coach list price. Checkout exists; the public home does not sell it. */
export const COACH_LIST_PRICE_CENTS = 2999;

/** One-time Advantage Pro list price. The previous list price was not stored in this repo. */
export const PRO_LIST_PRICE_CENTS = 9999;

/** Monthly Advantage Pro price. The Pro Checkout session includes this with the one-time price. */
export const PRO_MONTHLY_PRICE_CENTS = 599;

export const STUDENT_PRICE_LINE = '$19.99 one-time';

export const COACH_PRICE_LINE = '$29.99 one-time';

/** Display only: Instructor Edition (id coach) card price on /products and the homepage belt ladder. Stripe and COACH_LIST_PRICE_CENTS are unchanged. */
export const INSTRUCTOR_DISPLAY_PRICE_LINE = '$49.99 one-time';

/** Display only. Media is not for sale and has no Stripe product. Matches the homepage belt ladder. */
export const MEDIA_PRICE_LINE = '$29.99 one-time';

export const PRO_PRICE_LINE = '$99.99 one-time, plus $5.99/month';

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

export const COACH_ALPHA_ACCESS_NOTE = alphaAccessNote('Coach');

export const PRO_ALPHA_ACCESS_NOTE = alphaAccessNote('Pro');

/** Coming soon page, where Coach and Pro share one line. */
export const ALPHA_ACCESS_NOTE = `Coach and Pro are in alpha testing. Email ${SITE_FEEDBACK_EMAIL} to request an alpha code.`;

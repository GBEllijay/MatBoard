import { SITE_FEEDBACK_EMAIL } from './siteFooter.ts';

/** One-time Advantage Student Edition list price. Not a Stripe product in this build. */
export const STUDENT_LIST_PRICE_CENTS = 1999;

/** One-time Advantage Coach list price. Checkout exists; the public home does not sell it. */
export const COACH_LIST_PRICE_CENTS = 2999;

/** One-time Advantage Pro list price. The previous list price was not stored in this repo. */
export const PRO_LIST_PRICE_CENTS = 9999;

/** Monthly Advantage Pro price. The Pro Checkout session includes this with the one-time price. */
export const PRO_MONTHLY_PRICE_CENTS = 299;

export const STUDENT_PRICE_LINE = '$19.99 one-time';

export const COACH_PRICE_LINE = '$29.99 one-time';

export const PRO_PRICE_LINE = '$99.99 one-time, plus $2.99/month';

/** Locked-card alpha line. The address is the existing support inbox. */
export function alphaAccessNote(product: string): string {
  return `${product} is in alpha testing. Email ${SITE_FEEDBACK_EMAIL} to request an alpha code.`;
}

export const WHITE_ALPHA_ACCESS_NOTE = alphaAccessNote('White');

export const STUDENT_ALPHA_ACCESS_NOTE = alphaAccessNote('Student Edition');

export const COACH_ALPHA_ACCESS_NOTE = alphaAccessNote('Coach');

export const PRO_ALPHA_ACCESS_NOTE = alphaAccessNote('Pro');

/** Coming soon page, where Coach and Pro share one line. */
export const ALPHA_ACCESS_NOTE = `Coach and Pro are in alpha testing. Email ${SITE_FEEDBACK_EMAIL} to request an alpha code.`;

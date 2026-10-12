import { SITE_FEEDBACK_EMAIL } from './siteFooter.ts';

/** Display name for Advantage Student Edition. */
export const STUDENT_EDITION_LABEL = 'Advantage – Student Edition';

/** One-time Advantage Student Edition list price. Checkout product `student`. The public buy page does not sell it. */
export const STUDENT_LIST_PRICE_CENTS = 1999;

/** One-time Advantage Coach list price. Checkout exists; the public home does not sell it. */
export const COACH_LIST_PRICE_CENTS = 2999;

/** One-time Advantage Pro list price. The previous list price was not stored in this repo. */
export const PRO_LIST_PRICE_CENTS = 9999;

/** Monthly Advantage Pro price for new Checkouts. The Pro Checkout session includes this with the one-time price. */
export const PRO_MONTHLY_PRICE_CENTS = 599;

export const STUDENT_PRICE_LINE = '$19.99 one-time';

export const COACH_PRICE_LINE = '$29.99 one-time';

export const PRO_PRICE_LINE = '$99.99 one-time, plus $5.99/month';

/** Locked Coach and Pro surfaces. The address is the existing support inbox. */
export const ALPHA_ACCESS_NOTE = `Coach and Pro are in free alpha testing. Email ${SITE_FEEDBACK_EMAIL} for a free alpha code.`;

/** Locked Student Edition card. Same inbox, and not a public checkout button. */
export const STUDENT_ALPHA_ACCESS_NOTE = `Student Edition is in free alpha testing. Email ${SITE_FEEDBACK_EMAIL} for a free alpha code.`;

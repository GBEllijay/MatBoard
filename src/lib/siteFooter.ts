/** Footer ownership, alpha, and feedback lines. No registration or trademark claims. */

export const SITE_OWNER_LINE = 'The Advantage app is the property of Advantage App, LLC.';
export const SITE_ALPHA_LINE = 'This app is still in Alpha Testing.';
export const SITE_FEEDBACK_LEAD = 'Feedback is appreciated and encouraged.';
export const SITE_FEEDBACK_EMAIL = 'advantageappllc@gmail.com';

/** Prefilled subject for alpha-access requests. Do not change the inbox. */
export const ALPHA_REQUEST_SUBJECT = 'Advantage alpha testing request';

export function alphaRequestMailto(email = SITE_FEEDBACK_EMAIL): string {
  return `mailto:${email}?subject=${encodeURIComponent(ALPHA_REQUEST_SUBJECT)}`;
}

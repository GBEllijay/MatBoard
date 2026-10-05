import { ALPHA_ACCESS_NOTE } from '../lib/productPrices';
import { SITE_FEEDBACK_EMAIL } from '../lib/siteFooter';

/** Plain alpha line with a mailto. Used wherever Coach or Pro is locked. */
export function AlphaAccessNote() {
  const [before, after] = ALPHA_ACCESS_NOTE.split(SITE_FEEDBACK_EMAIL);

  return (
    <p className="alpha-access">
      {before}
      <a href={`mailto:${SITE_FEEDBACK_EMAIL}`}>{SITE_FEEDBACK_EMAIL}</a>
      {after}
    </p>
  );
}

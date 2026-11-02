import { ALPHA_ACCESS_NOTE } from '../lib/productPrices';
import { alphaRequestMailto, SITE_FEEDBACK_EMAIL } from '../lib/siteFooter';

/** Plain alpha line with a mailto. Each home card passes its own product note. */
export function AlphaAccessNote({
  note = ALPHA_ACCESS_NOTE,
  display = SITE_FEEDBACK_EMAIL,
}: {
  note?: string;
  /** Link text only; the mailto address never changes. */
  display?: string;
}) {
  const [before, after] = note.split(SITE_FEEDBACK_EMAIL);

  return (
    <p className="alpha-access">
      {before}
      <a href={alphaRequestMailto()}>{display}</a>
      {after}
    </p>
  );
}

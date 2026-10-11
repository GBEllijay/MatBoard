import { ALPHA_ACCESS_NOTE } from '../lib/productPrices';
import { SITE_FEEDBACK_EMAIL } from '../lib/siteFooter';

/** Plain alpha line with a mailto. Coach and Pro use the shared note. Student Edition passes its own. */
export function AlphaAccessNote({ note = ALPHA_ACCESS_NOTE }: { note?: string }) {
  const [before, after] = note.split(SITE_FEEDBACK_EMAIL);

  return (
    <p className="alpha-access">
      {before}
      <a href={`mailto:${SITE_FEEDBACK_EMAIL}`}>{SITE_FEEDBACK_EMAIL}</a>
      {after}
    </p>
  );
}

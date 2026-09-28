import { Link } from 'react-router-dom';
import {
  SITE_ALPHA_LINE,
  SITE_FEEDBACK_EMAIL,
  SITE_FEEDBACK_LEAD,
  SITE_OWNER_LINE,
} from '../lib/siteFooter';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>{SITE_OWNER_LINE}</p>
      <p>{SITE_ALPHA_LINE}</p>
      <p>
        {SITE_FEEDBACK_LEAD}{' '}
        <a href={`mailto:${SITE_FEEDBACK_EMAIL}`}>{SITE_FEEDBACK_EMAIL}</a>
      </p>
      <nav className="site-footer__legal" aria-label="Legal">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Service</Link>
      </nav>
    </footer>
  );
}

import { Link } from 'react-router-dom';
import { UpdateToLatestButton } from './UpdateToLatestButton';
import { PRODUCTS_PATH } from '../lib/productNames';
import {
  SITE_ALPHA_LINE,
  SITE_FEEDBACK_EMAIL,
  SITE_FEEDBACK_LEAD,
  SITE_OWNER_LINE,
} from '../lib/siteFooter';

export function SiteFooter({
  hideAccount = false,
  alphaTesters = false,
}: { hideAccount?: boolean; alphaTesters?: boolean } = {}) {
  return (
    <footer className="site-footer">
      <p>{SITE_OWNER_LINE}</p>
      <p>{SITE_ALPHA_LINE}</p>
      <p>
        {SITE_FEEDBACK_LEAD}{' '}
        <a href={`mailto:${SITE_FEEDBACK_EMAIL}`}>{SITE_FEEDBACK_EMAIL}</a>
      </p>
      <nav className="site-footer__legal" aria-label="Help and legal">
        {hideAccount ? null : <Link to="/account">Account</Link>}
        {alphaTesters ? <Link to={PRODUCTS_PATH}>Alpha testers</Link> : null}
        <Link to="/faq">FAQ</Link>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Service</Link>
      </nav>
      {/* TEMPORARY UPDATE BUTTON — delete this line with src/components/UpdateToLatestButton.tsx */}
      <UpdateToLatestButton />
    </footer>
  );
}

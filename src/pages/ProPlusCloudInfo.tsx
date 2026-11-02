import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlphaAccessNote } from '../components/AlphaAccessNote';
import { AlphaCodeEntry } from '../components/AlphaCodeEntry';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { TierBeltIcon } from '../components/TierBuyParts';
import {
  PRODUCTS_PATH,
  PRO_PLUS_CLOUD_DESCRIPTION,
  PRO_PLUS_CLOUD_NAME,
} from '../lib/productNames';
import { EDITION_ALPHA_NOTE, EDITION_EMAIL_DISPLAY, PRO_PLUS_CLOUD_PRICE_LINE } from '../lib/productPrices';

/**
 * Public description for Advantage Pro + Cloud. No checkout. The unlocked menu
 * stays at /pro-plus-cloud. An alpha-pro code still opens that menu through the
 * existing redeem path.
 */
export function ProPlusCloudInfoPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = PRO_PLUS_CLOUD_NAME;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <main className="home home--buy home--tier home--tier-pro" data-tier-page="pro-cloud">
      <div className="home__inner">
        <HomeMark to="/" />
        <article className="buy">
          <header className="buy__card buy__card--belt buy__card--tier buy__card--tier-black">
            <TierBeltIcon belt="black" big />
            <p className="buy__kicker">Alpha</p>
            <h2>{PRO_PLUS_CLOUD_NAME}</h2>
            <p className="buy__lead">{PRO_PLUS_CLOUD_DESCRIPTION}</p>
            <p className="buy__price">
              {PRO_PLUS_CLOUD_PRICE_LINE} <span>USD — monthly, when it launches</span>
            </p>
            <p>Not for sale on this page.</p>
          </header>
          <section className="buy__card buy__checkout" aria-label="Alpha access">
            <AlphaCodeEntry tier="pro-cloud" />
            <AlphaAccessNote note={EDITION_ALPHA_NOTE} display={EDITION_EMAIL_DISPLAY} />
            <p>
              <Link to="/terms">Terms of Service</Link>
              {' · '}
              <Link to="/privacy">Privacy Policy</Link>
              {' · '}
              <Link to={PRODUCTS_PATH}>All editions</Link>
            </p>
          </section>
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}

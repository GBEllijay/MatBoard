import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlphaAccessNote } from '../components/AlphaAccessNote';
import { BeltHeader } from '../components/BeltHeader';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { PRO_PLUS_CLOUD_DESCRIPTION, PRO_PLUS_CLOUD_NAME, PRO_PLUS_CLOUD_PATH, PRODUCTS_PATH } from '../lib/productNames';
import { EDITION_ALPHA_NOTE, EDITION_EMAIL_DISPLAY, PRO_PLUS_CLOUD_PRICE_LINE } from '../lib/productPrices';

/**
 * Display page for Advantage Pro Plus Cloud. No checkout, no Drive sign-in, no entitlement write.
 * The black belt here is the white | red | white bar. The Pro hub header on /pro is unchanged.
 */
export function ProPlusCloudPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = PRO_PLUS_CLOUD_NAME;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <main className="home home--pro" data-page={PRO_PLUS_CLOUD_PATH}>
      <div className="home__inner">
        <HomeMark to={PRODUCTS_PATH} />
        <section className="suite" aria-label={PRO_PLUS_CLOUD_NAME}>
          <BeltHeader kind="black" title={PRO_PLUS_CLOUD_NAME} blurb={PRO_PLUS_CLOUD_DESCRIPTION} />
          <p>
            This console is Advantage-hosted storage on Cloudflare, {PRO_PLUS_CLOUD_PRICE_LINE}. Advantage Pro still
            uses your own Google Drive or OneDrive. Advantage does not host that drive.
          </p>
          <p>Not for sale on this page.</p>
          <AlphaAccessNote note={EDITION_ALPHA_NOTE} display={EDITION_EMAIL_DISPLAY} />
          <p>
            <Link to={PRODUCTS_PATH}>All products</Link>
          </p>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

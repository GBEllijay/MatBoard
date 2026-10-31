import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlphaAccessNote } from '../components/AlphaAccessNote';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { HigherTierList } from '../components/TierBuyParts';
import {
  MEDIA_EDITION_CTA_LABEL,
  MEDIA_EDITION_FEATURES,
  MEDIA_EDITION_GALLERY,
  MEDIA_EDITION_INCLUDED,
  MEDIA_EDITION_INCLUDES,
  MEDIA_EDITION_LEAD,
  MEDIA_EDITION_LIST_PRICE_CENTS,
  MEDIA_EDITION_NAME,
  MEDIA_EDITION_PRICE_DETAIL,
} from '../lib/mediaEdition';
import { MEDIA_CONSOLE_NAME, PRODUCTS_PATH } from '../lib/productNames';
import { EDITION_ALPHA_NOTE, EDITION_EMAIL_DISPLAY } from '../lib/productPrices';
import { alphaRequestMailto } from '../lib/siteFooter';
import { formatUsdFromCents } from '../lib/whitePurchase';
import './mediaEdition.css';

/**
 * Public Media Edition page. Same `.buy` template as /buy and the other tier pages:
 * belt, price, alpha CTA, included, Restore, then only the higher tiers.
 * Not for sale: no checkout, code kind, or entitlement. The CTA is the alpha-code email.
 */
export function MediaEditionPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = MEDIA_EDITION_NAME;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <main className="home home--buy home--media">
      <div className="home__inner">
        <HomeMark to="/" />
        <article className="buy media-edition">
          <header className="buy__card buy__card--belt media-edition__head">
            <span className="belt-tip belt-tip--purple buy__belt" aria-hidden="true">
              <span className="belt-tip__bar" />
            </span>
            <p className="buy__kicker">Coming soon</p>
            <h2>{MEDIA_EDITION_NAME}</h2>
            <p className="media-edition__lead">{MEDIA_EDITION_LEAD}</p>
            <p className="buy__price">
              {formatUsdFromCents(MEDIA_EDITION_LIST_PRICE_CENTS)} <span>{MEDIA_EDITION_PRICE_DETAIL}</span>
            </p>
            <p>Not for sale on this page.</p>
          </header>

          <section className="buy__card media-edition__cta" aria-label="Alpha access">
            <a className="btn btn--white" href={alphaRequestMailto()}>
              {MEDIA_EDITION_CTA_LABEL}
            </a>
            <AlphaAccessNote note={EDITION_ALPHA_NOTE} display={EDITION_EMAIL_DISPLAY} />
          </section>
        </article>
      </div>

      <section className="media-gallery" aria-label="Gallery">
        <ul className="media-gallery__grid">
          {MEDIA_EDITION_GALLERY.map((shot) => (
            <li key={shot.src} className="media-gallery__item">
              <figure>
                <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading="lazy" />
                <figcaption>{shot.caption}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>

      <div className="home__inner">
        <article className="buy media-edition">
          <section className="buy__card">
            <div className="buy__block">
              <h3>Included</h3>
              <p className="soon-ad__includes">{MEDIA_EDITION_INCLUDES}</p>
              <ul>
                {MEDIA_EDITION_INCLUDED.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="buy__card" aria-label={MEDIA_CONSOLE_NAME}>
            <h3>{MEDIA_CONSOLE_NAME}</h3>
            <ul className="soon-ad__features media-edition__features">
              {MEDIA_EDITION_FEATURES.map((feature) => (
                <li key={feature.title} className="soon-ad__feature">
                  <strong>{feature.title}</strong>
                  <span>{feature.body}</span>
                </li>
              ))}
            </ul>
            <p>
              <Link to="/terms">Terms of Service</Link>
              {' · '}
              <Link to="/privacy">Privacy Policy</Link>
              {' · '}
              <Link to={PRODUCTS_PATH}>All editions</Link>
            </p>
          </section>

          {/* Same Restore spot as the other tier pages. Media has no checkout, so it links to /restore. */}
          <section className="buy__card buy__restore" aria-label="Restore">
            <h3>Already purchased?</h3>
            <p>
              <Link to="/restore">Open the restore page</Link>.
            </p>
          </section>

          {/* Higher tiers only: Instructor Edition, then Pro. */}
          <HigherTierList from="media" />
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}

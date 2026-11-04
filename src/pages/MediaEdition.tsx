import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlphaAccessNote } from '../components/AlphaAccessNote';
import { AlphaCodeEntry } from '../components/AlphaCodeEntry';
import { CloudAddonChoice, CloudAddonLine } from '../components/CloudAddon';
import { HalfOffCheckoutNote } from '../components/HalfOffCheckoutNote';
import { useHalfOffArrival } from '../hooks/useHalfOffArrival';
import { buyCheckoutBody } from '../lib/halfOff';
import { withCheckoutNonce } from '../lib/codeRedeemClient';
import { ALPHA_PRODUCT_STATUS } from '../lib/productPrices';
import { WHITE_CHECKOUT_API } from '../lib/whitePurchase';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { HigherTierList } from '../components/TierBuyParts';
import {
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
import { POLISHED_SKINS, POLISHED_TIMER_ONLY_SKINS } from '../lib/polishedSkins';
import { EDITION_ALPHA_NOTE, EDITION_EMAIL_DISPLAY } from '../lib/productPrices';
import { formatUsdFromCents } from '../lib/whitePurchase';
import './mediaEdition.css';

/**
 * Public Media Edition page. Same `.buy` template as /buy and the other tier pages:
 * belt, price, alpha CTA, included, Restore, then only the higher tiers.
 * Not for sale: no checkout, code kind, or entitlement. The CTA is the alpha-code email.
 */
export function MediaEditionPage() {
  const halfOff = useHalfOffArrival();
  const [includeCloud, setIncludeCloud] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(WHITE_CHECKOUT_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          await withCheckoutNonce(buyCheckoutBody({ product: 'media', halfOffActive: halfOff, cloud: includeCloud })),
        ),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setError(body.error || 'Checkout could not start.');
        setPending(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError('Checkout could not start. Check your connection and try again.');
      setPending(false);
    }
  }

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
            <p className="buy__kicker">{ALPHA_PRODUCT_STATUS}</p>
            <h2>{MEDIA_EDITION_NAME}</h2>
            <p className="media-edition__lead">{MEDIA_EDITION_LEAD}</p>
            <p className="buy__price">
              {formatUsdFromCents(MEDIA_EDITION_LIST_PRICE_CENTS)} <span>{MEDIA_EDITION_PRICE_DETAIL}</span>
            </p>
            <CloudAddonLine />
          </header>

          <section className="buy__card media-edition__cta" aria-label="Alpha access">
            <AlphaCodeEntry tier="media" />
            {error ? (
              <p className="buy__status buy__status--bad" role="alert">
                {error}
              </p>
            ) : null}
            <form onSubmit={(event) => void onSubmit(event)}>
              <HalfOffCheckoutNote active={halfOff} />
              <CloudAddonChoice checked={includeCloud} onChange={setIncludeCloud} />
              <button className="btn btn--white" type="submit" disabled={pending}>
                {pending ? 'Opening checkout…' : `Continue to checkout — ${formatUsdFromCents(MEDIA_EDITION_LIST_PRICE_CENTS)}`}
              </button>
            </form>
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
          <section className="buy__card" aria-label="What Media Edition is">
            <div className="buy__block">
              <h3>What it is</h3>
              <p>
                Media Edition is the gym-TV tier. It is a live scoreboard, a round timer, and a media console. Cast the
                board or the timer to the gym TV and keep the controller on a phone.
              </p>
            </div>
            <div className="buy__block">
              <h3>Scoreboard and round timer</h3>
              <p>
                The scoreboard and the round timer include these looks:{' '}
                {[...POLISHED_SKINS.map((skin) => skin.label), ...POLISHED_TIMER_ONLY_SKINS.map((skin) => `${skin.label} (round timer)`)].join(
                  ', ',
                )}
                .
              </p>
            </div>
            <div className="buy__block">
              <h3>Media console</h3>
              <p>The media console plays on the gym TV: a gallery, the class schedule, the pro shop, and events.</p>
            </div>
          </section>

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

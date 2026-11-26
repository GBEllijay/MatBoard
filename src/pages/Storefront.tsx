import { Link } from 'react-router-dom';
import { AccountLink } from '../components/AccountLink';
import { UpdateToLatestButton } from '../components/UpdateToLatestButton';
import { WHITE_BRACKETS_PATH } from '../lib/bracketRosterStore';
import {
  SITE_ALPHA_LINE,
  SITE_FEEDBACK_EMAIL,
  SITE_FEEDBACK_LEAD,
  SITE_OWNER_LINE,
} from '../lib/siteFooter';
import { PRODUCTS_PATH } from '../lib/productNames';
import {
  STOREFRONT_BRACKETS,
  STOREFRONT_BUY_PATH,
  STOREFRONT_NAV,
  STOREFRONT_POINTS,
  STOREFRONT_TIMER,
  STOREFRONT_WIN_BUY_LABEL,
  STOREFRONT_WOODBLOCKS,
} from '../lib/storefront';
import { StorefrontBuyButton, StorefrontHero } from './StorefrontHero';
import './storefront.css';

export function StorefrontPage() {
  return (
    <main className="home home--store">
      <div className="sf-scroll">
      <header className="sf-pin">
        <div className="sf-topbar">
          <div className="sf-wrap">
            <nav className="sf-nav" aria-label="Advantage BJJ Scoreboard">
              <div className="sf-nav-links">
                {STOREFRONT_NAV.map((item) => (
                  <Link key={item.href} to={item.href}>
                    {item.label}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
          <AccountLink className="sf-signin" />
        </div>
      </header>

      <StorefrontHero />

      <section className="sf-band" id="scoreboard" aria-label="Scoreboard">
        <div className="sf-tex" aria-hidden="true" />
        <div className="sf-wrap">
          <div className="sf-pair">
            <Link className="sf-points" to="/white" aria-label="Open Advantage BJJ Scoreboard">
              {STOREFRONT_POINTS.map((point) => (
                <div key={point.id} className={`sf-point sf-point--${point.id}`}>
                  <h3>{point.title}</h3>
                  <p>{point.body}</p>
                </div>
              ))}
            </Link>
            <Woodblock shot={STOREFRONT_WOODBLOCKS.scoreboard} />
          </div>
        </div>
      </section>

      <div className="sf-wrap">
        <section className="sf-between" id="round-timer" aria-labelledby="store-timer">
          <Woodblock shot={STOREFRONT_WOODBLOCKS.timer} />
          <Link className="sf-between-copy" to="/white" aria-label="Open the round timer">
            <div className="sf-eyebrow">{STOREFRONT_TIMER.eyebrow}</div>
            <h2 id="store-timer">{STOREFRONT_TIMER.title}</h2>
            <p>{STOREFRONT_TIMER.body}</p>
          </Link>
        </section>

        <section className="sf-between sf-between--brackets" id="brackets" aria-labelledby="store-brackets">
          <Woodblock shot={STOREFRONT_WOODBLOCKS.brackets} to={WHITE_BRACKETS_PATH} />
          <Link className="sf-between-copy" to={WHITE_BRACKETS_PATH} aria-label="Open Mock tournament">
            <div className="sf-eyebrow">{STOREFRONT_BRACKETS.eyebrow}</div>
            <h2 id="store-brackets">{STOREFRONT_BRACKETS.title}</h2>
            <p>{STOREFRONT_BRACKETS.body}</p>
          </Link>
        </section>
      </div>

      <div className="sf-wrap">
        <Link
          className="sf-win-buy"
          to={STOREFRONT_BUY_PATH}
          aria-label={STOREFRONT_WIN_BUY_LABEL}
        >
          <h2>{STOREFRONT_WIN_BUY_LABEL}</h2>
          <img
            className="sf-win-buy-logo"
            src="/advantage-icon.png"
            alt=""
            width={96}
            height={96}
            draggable={false}
          />
        </Link>
      </div>

      <div className="sf-wrap sf-bottom-buy">
        <StorefrontBuyButton />
      </div>

      <footer className="sf-footer">
        <div className="sf-wrap sf-footer-row">
          <div>
            <div className="sf-footer-brand">
              <img src="/advantage-icon.png" alt="" width={26} height={26} />
              <span>Advantage</span>
            </div>
            <p>
              {SITE_OWNER_LINE}
              <br />
              {SITE_ALPHA_LINE}
            </p>
          </div>
          <div className="sf-footer-side">
            <p className="sf-footer-feedback">
              <FooterFeedback />
            </p>
            <nav className="sf-footer-links" aria-label="Footer">
              <Link to={PRODUCTS_PATH}>Alpha testers</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
            </nav>
          </div>
        </div>
        {/* TEMPORARY UPDATE BUTTON — delete this line with src/components/UpdateToLatestButton.tsx */}
        <UpdateToLatestButton />
      </footer>
      </div>
    </main>
  );
}

function Woodblock({
  shot,
  to = '/white',
}: {
  shot: (typeof STOREFRONT_WOODBLOCKS)[keyof typeof STOREFRONT_WOODBLOCKS];
  to?: string;
}) {
  return (
    <figure className="sf-figure">
      <Link className="sf-figure-hit" to={to}>
        <div className="sf-print">
          <picture>
            <source srcSet={shot.webp} type="image/webp" />
            <img src={shot.jpg} alt={shot.alt} width={shot.width} height={shot.height} loading="eager" />
          </picture>
        </div>
        <span className="sf-caption">
          <b>{shot.caption}</b>
          <span>{shot.detail}</span>
        </span>
      </Link>
    </figure>
  );
}

/** Keeps the address with the last word so it does not sit on a line by itself. */
function FooterFeedback() {
  const lead = SITE_FEEDBACK_LEAD;
  const split = lead.lastIndexOf(' ');
  const head = split === -1 ? lead : lead.slice(0, split);
  const tail = split === -1 ? '' : lead.slice(split + 1);
  return (
    <>
      {head}{' '}
      <span className="sf-footer-tail">
        {tail}{' '}
        <a className="sf-footer-mail" href={`mailto:${SITE_FEEDBACK_EMAIL}`}>
          {SITE_FEEDBACK_EMAIL}
        </a>
      </span>
    </>
  );
}


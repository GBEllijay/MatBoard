import { Link, useNavigate } from 'react-router-dom';
import { BeltHeader } from '../components/BeltHeader';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { LiveBoutCard } from '../components/LiveBoutCard';
import { RoundsCard } from '../components/RoundsCard';
import { SiteFooter } from '../components/SiteFooter';
import { lockMedia } from '../lib/mediaUnlock';
import { MEDIA_CONSOLE_NAME, PRODUCTS_PATH } from '../lib/productNames';

/** Media Console entry for this browser. Same screen the Pro hub opens. */
export const MEDIA_HUB_CONSOLE_PATH = '/slideshow?folder=gallery';

/**
 * Advantage Media Edition hub, for a browser with the Media door and no Pro.
 * Media Console plus the White tools Media includes (Scoreboard and Round Timer).
 * Pro owners and seats keep going to /pro from /media.
 */
export function MediaHubPage() {
  const navigate = useNavigate();
  return (
    <main className="home home--media">
      <div className="home__inner">
        <HomeMark to={PRODUCTS_PATH} />

        <nav className="home__modes" aria-label="Advantage Media Edition">
          <BeltHeader
            kind="purple"
            title="Advantage - Media Edition"
            blurb="Media Console for the gym TV, plus the BJJ Scoreboard and Round Timer"
          />
          <article className="mode-card">
            <BeltRail kind="purple" />
            <Link className="mode-card__hit" to={MEDIA_HUB_CONSOLE_PATH} tabIndex={-1} aria-label={`Open ${MEDIA_CONSOLE_NAME}`} />
            <strong>{MEDIA_CONSOLE_NAME}</strong>
            <span className="mode-card__sub">Gallery, Events &amp; Pro Shop</span>
            <span>Cast photo slideshows, event posters, and your pro shop to the gym TV.</span>
            <div className="mode-card__actions">
              <Link className="btn" to={MEDIA_HUB_CONSOLE_PATH}>
                {MEDIA_CONSOLE_NAME}
              </Link>
            </div>
          </article>
          <LiveBoutCard />
          <RoundsCard />
        </nav>

        <div className="home__hints">
          <p className="home__soon">
            Advantage Media Edition is on for this browser.{' '}
            <Link className="home__text-btn" to={PRODUCTS_PATH}>
              All products
            </Link>
            {' · '}
            <button
              type="button"
              className="home__text-btn"
              onClick={() => {
                lockMedia();
                navigate(PRODUCTS_PATH);
              }}
            >
              Lock Media
            </button>
          </p>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}

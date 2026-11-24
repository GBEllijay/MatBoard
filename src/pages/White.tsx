import { Link, useNavigate } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { InstructionsButton } from '../components/InstructionsButton';
import { LiveBoutCard } from '../components/LiveBoutCard';
import { RoundsCard } from '../components/RoundsCard';
import { BracketsCard } from '../components/BracketsCard';
import { BracketRosterCard } from '../components/BracketRosterCard';
import { SiteFooter } from '../components/SiteFooter';
import { PRODUCTS_PATH } from '../lib/productNames';
import { isPreviewWhiteUnlocked } from '../lib/previewWhiteBypass';
import { lockWhite } from '../lib/whiteUnlock';
import { useWhitePublicPricing } from '../hooks/useWhitePublicPricing';
import { whiteBuyCtaLabel } from '../lib/whitePurchase';

export const WHITE_HUB_TOOLS_LINE = 'Advantage BJJ Scoreboard';
export const WHITE_HUB_CAST_LINE =
  'Your Scoreboard, Round Timer and Mock Tournament Software. Cast to your TV from your phone or PC.';

export function WhitePage() {
  const navigate = useNavigate();
  const whitePricing = useWhitePublicPricing();
  return (
    <main className="home home--white">
      <div className="home__inner">
        <HomeMark to={PRODUCTS_PATH} />

        <nav className="home__modes" aria-label="Advantage BJJ Scoreboard">
          <h2 className="home__tools-line">{WHITE_HUB_TOOLS_LINE}</h2>
          <LiveBoutCard />
          <RoundsCard />
          <BracketsCard />
          <BracketRosterCard />
        </nav>

        <div className="home__hints">
          <p className="home__cast-line">{WHITE_HUB_CAST_LINE}</p>
          <InstructionsButton controlsId="white-instructions">
            <p className="home__hint">Install Advantage as an app from your browser menu.</p>
            <p className="home__hint">
              Gym TV: open this site on a computer plugged into the TV, then fullscreen Display or
              Rounds. Press F for fullscreen.
            </p>
            <p className="home__hint">
              Control from your phone. Cast the scoreboard to your TV, or open Display on a second
              screen or computer.
            </p>
            <p className="home__hint">
              You can type a competitor name on the scoreboard, or pick one from your Bracket
              Roster.
            </p>
          </InstructionsButton>
          {isPreviewWhiteUnlocked() ? (
            <p className="home__soon">
              Advantage BJJ Scoreboard is on for this preview.{' '}
              <Link className="home__text-btn" to={PRODUCTS_PATH}>
                All products
              </Link>
            </p>
          ) : (
            <>
              <p className="home__soon">
                <Link className="home__text-btn" to="/buy">
                  {whiteBuyCtaLabel(whitePricing.activePriceCents)}
                </Link>
              </p>
              <p className="home__soon">
                Advantage BJJ Scoreboard is on for this browser.{' '}
                <Link className="home__text-btn" to={PRODUCTS_PATH}>
                  All products
                </Link>
                {' · '}
                <button
                  type="button"
                  className="home__text-btn"
                  onClick={() => {
                    lockWhite();
                    navigate(PRODUCTS_PATH);
                  }}
                >
                  Lock Advantage BJJ Scoreboard
                </button>
              </p>
            </>
          )}
        </div>
        <SiteFooter hideAccount alphaTesters />
      </div>
    </main>
  );
}

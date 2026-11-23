import { Link, useNavigate } from 'react-router-dom';
import { BeltHeader } from '../components/BeltHeader';
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

export function WhitePage() {
  const navigate = useNavigate();
  return (
    <main className="home home--white">
      <div className="home__inner">
        <HomeMark to={PRODUCTS_PATH} />

        <nav className="home__modes" aria-label="Advantage White">
          <BeltHeader
            kind="white"
            title="Advantage - White"
            blurb="Your Scoreboard, Round Timer and Mock Tournament Software. Cast to your TV from your phone or PC."
          />
          <LiveBoutCard />
          <RoundsCard />
          <BracketsCard />
          <BracketRosterCard />
        </nav>

        <div className="home__hints">
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
              Advantage White is on for this preview.{' '}
              <Link className="home__text-btn" to={PRODUCTS_PATH}>
                All products
              </Link>
            </p>
          ) : (
            <>
              <p className="home__soon">
                <Link className="home__text-btn" to="/buy">
                  Buy Advantage White — $9.99
                </Link>
              </p>
              <p className="home__soon">
                Advantage White is on for this browser.{' '}
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
                  Lock White
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

import { Link, useNavigate } from 'react-router-dom';
import { BeltHeader } from '../components/BeltHeader';
import { HomeMark } from '../components/HomeMark';
import { InstructionsButton } from '../components/InstructionsButton';
import { LiveBoutCard } from '../components/LiveBoutCard';
import { RoundsCard } from '../components/RoundsCard';
import { WhiteRosterCard } from '../components/WhiteRosterCard';
import { SiteFooter } from '../components/SiteFooter';
import { PRODUCTS_PATH } from '../lib/productNames';
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
            blurb="BJJ Scoreboard and Round Timer. Customizable Live Matches and Rounds"
          />
          <LiveBoutCard />
          <RoundsCard />
          <WhiteRosterCard />
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
              Match names stay on this phone. Pick a saved name and belt from the scoreboard.
            </p>
          </InstructionsButton>
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
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}

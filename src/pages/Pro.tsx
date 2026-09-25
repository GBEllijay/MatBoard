import { Link, useNavigate } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { ProToolboxCard } from '../components/ProToolboxCard';
import { SiteFooter } from '../components/SiteFooter';
import { TierLine } from '../components/TierLine';
import { MEDIA_CONSOLE_NAME, PRO_LADDER_DETAIL } from '../lib/productNames';
import { lockPro } from '../lib/proUnlock';

export function ProPage() {
  const navigate = useNavigate();

  return (
    <main className="home home--pro">
      <div className="home__inner">
        <HomeMark to="/" tagline={<TierLine tier="Pro" detail={PRO_LADDER_DETAIL} />} />

        <nav className="home__modes" aria-label="Advantage Pro">
          <ProToolboxCard />
        </nav>

        <div className="home__hints">
          <p className="home__hint">Install Advantage as an app from your browser menu.</p>
          <p className="home__hint">
            Gym TV: open this site on a computer plugged into the TV, then fullscreen the scoreboard,
            Rounds, {MEDIA_CONSOLE_NAME}, or Class Schedule. Press F for fullscreen. Roster lives on
            the phone.
          </p>
          <p className="home__hint">
            Control from your phone. Cast the scoreboard to your TV, or open Display on a second
            screen or computer.
          </p>
          <p className="home__soon">
            Advantage Pro is on for this browser.{' '}
            <Link className="home__text-btn" to="/">
              All products
            </Link>
            {' · '}
            <button
              type="button"
              className="home__text-btn"
              onClick={() => {
                lockPro();
                navigate('/');
              }}
            >
              Lock Pro
            </button>
          </p>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}

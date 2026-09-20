import { Link } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { LiveBoutCard } from '../components/LiveBoutCard';
import { RoundsCard } from '../components/RoundsCard';

export function WhitePage() {
  return (
    <main className="home home--white">
      <div className="home__inner">
        <HomeMark to="/" tagline="White — BJJ scoreboard and timer. Live Bout and Rounds." />

        <nav className="home__modes" aria-label="Advantage White">
          <LiveBoutCard />
          <RoundsCard />
        </nav>

        <div className="home__hints">
          <p className="home__hint">Install Advantage as an app from your browser menu.</p>
          <p className="home__hint">
            Gym TV: open this site on a computer plugged into the TV, then fullscreen Display or
            Rounds. Press F for fullscreen.
          </p>
          <p className="home__hint">
            Control from your phone. Cast the scoreboard to your TV, or open Display on a second
            screen or computer.
          </p>
          <p className="home__soon">
            <Link className="home__text-btn" to="/">
              All products
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

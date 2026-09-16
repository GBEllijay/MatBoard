import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <main className="home">
      <div className="home__mark">
        <div className="home__badge" aria-hidden="true">
          <span className="home__badge-blue" />
          <span className="home__badge-gold" />
          <span className="home__badge-white" />
        </div>
        <h1>MatBoard</h1>
        <p>Gym scoreboard, round timer and photo slideshow.</p>
      </div>

      <nav className="home__modes" aria-label="Modes">
        <article className="mode-card mode-card--match">
          <strong>Live Bout</strong>
          <span className="mode-card__sub">Match Timer &amp; Scoreboard</span>
          <span>
            Run a tournament-style match. Control the clock and scores from your phone while casting to your TV.
          </span>
          <div className="mode-card__actions">
            <Link className="btn" to="/match">
              Scoreboard
            </Link>
            <Link className="btn btn--ghost" to="/match/control">
              Controller
            </Link>
          </div>
        </article>
        <Link className="mode-card mode-card--training" to="/training">
          <strong>Rounds</strong>
          <span className="mode-card__sub">Training Timer</span>
          <span>Round timer that can be cast to your TV. Set round length, rest time, and how many rounds.</span>
        </Link>
        <Link className="mode-card mode-card--saver" to="/screensaver">
          <strong>Slideshow</strong>
          <span className="mode-card__sub">Gallery</span>
          <span>Easily display photos, logos and gym information on your TV.</span>
        </Link>
      </nav>

      <p className="home__hint">Install MatBoard as an app from your browser menu.</p>
      <p className="home__hint">Control from your phone. Cast the scoreboard to your TV, or open Display on a second screen.</p>
    </main>
  );
}

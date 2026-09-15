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
        <p>Gym scoreboard, round timer, and photo loop. Original tools — no federation branding.</p>
      </div>

      <nav className="home__modes" aria-label="Modes">
        <article className="mode-card mode-card--match">
          <span className="mode-card__kicker">Live bout</span>
          <strong>Match</strong>
          <span>Landscape scoreboard plus a fat-thumb controller. Blue on top, white below.</span>
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
          <span className="mode-card__kicker">Rounds</span>
          <strong>Training</strong>
          <span>Fullscreen MM:SS with start, 10-second warning, and end buzzer.</span>
        </Link>
        <Link className="mode-card mode-card--saver" to="/screensaver">
          <span className="mode-card__kicker">Manual only</span>
          <strong>Screensaver</strong>
          <span>Pick gym photos and loop them fullscreen. Never auto-starts from other modes.</span>
        </Link>
      </nav>

      <p className="home__hint">
        Install MatBoard as an app from your browser menu. Open Match Controller on a phone, then Cast or pop out the
        scoreboard for the TV.
      </p>
    </main>
  );
}

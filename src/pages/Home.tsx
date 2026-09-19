import { Link } from 'react-router-dom';
import { FOLDERS } from '../lib/photoStore';

export function HomePage() {
  return (
    <main className="home">
      <div className="home__inner">
        <div className="home__mark">
          <img className="home__logo" src="/advantage-icon.png" alt="" width={713} height={713} />
          <h1>Advantage</h1>
          <p>Gym scoreboard, round timer and owner’s toolbox.</p>
        </div>

        <nav className="home__modes" aria-label="Modes">
          <article className="mode-card mode-card--match">
            <strong>Live Bout</strong>
            <span className="mode-card__sub">Match Timer &amp; Scoreboard</span>
            <span>
              Run a tournament-style match. Open Scoreboard on a computer plugged into the TV, or
              control from your phone and cast.
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
            <span>
              Round timer for the gym TV. Open it on a computer plugged into the TV, or cast from
              your phone. Set round length, rest time, and how many rounds.
            </span>
          </Link>
          <article className="mode-card mode-card--saver">
            <strong>Owner’s Toolbox</strong>
            <span className="mode-card__sub">Pro</span>
            <span>Gallery, videos, Pro Shop, and event flyers for your gym TV.</span>
            <div className="mode-card__actions mode-card__actions--folders" aria-label="Owner folders">
              {FOLDERS.map((folder) => (
                <Link
                  key={folder.id}
                  className={`btn${folder.id === 'gallery' ? '' : ' btn--ghost'}`}
                  to={`/slideshow?folder=${folder.id}`}
                >
                  {folder.label}
                </Link>
              ))}
            </div>
          </article>
        </nav>

        <div className="home__hints">
          <p className="home__hint">Install Advantage as an app from your browser menu.</p>
          <p className="home__hint">
            Gym TV: open this site on a computer plugged into the TV, then fullscreen Display,
            Rounds, or Owner’s Toolbox. Press F for fullscreen.
          </p>
          <p className="home__hint">
            Control from your phone. Cast the scoreboard to your TV, or open Display on a second
            screen or computer.
          </p>
        </div>
      </div>
    </main>
  );
}

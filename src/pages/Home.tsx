import { Link } from 'react-router-dom';
import { unlinkBracketBout } from '../lib/bracketBout';
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
            <Link
              className="mode-card__hit"
              to="/match"
              tabIndex={-1}
              aria-label="Open Scoreboard"
              onClick={() => unlinkBracketBout()}
            />
            <strong>Live Bout</strong>
            <span className="mode-card__sub">Match Timer &amp; Scoreboard</span>
            <span>
              Run a tournament-style match. Open Scoreboard on a computer plugged into the TV, or
              control from your phone and cast.
            </span>
            <div className="mode-card__actions">
              <Link className="btn" to="/match" onClick={() => unlinkBracketBout()}>
                Scoreboard
              </Link>
              <Link className="btn btn--ghost" to="/match/control" onClick={() => unlinkBracketBout()}>
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
            <Link
              className="mode-card__hit"
              to="/slideshow?folder=gallery"
              tabIndex={-1}
              aria-label="Open Gallery"
            />
            <strong>Owner’s Toolbox</strong>
            <span className="mode-card__sub">Pro</span>
            <span>Gallery, videos, Pro Shop, event flyers, and a mock tournament bracket.</span>
            <div className="mode-card__actions mode-card__actions--folders" aria-label="Owner folders">
              {FOLDERS.map((folder) => (
                <Link
                  key={folder.id}
                  className={`btn${folder.ready ? '' : ' btn--ghost'}`}
                  to={`/slideshow?folder=${folder.id}`}
                >
                  {folder.label}
                </Link>
              ))}
            </div>
            <div className="mode-card__actions mode-card__actions--tools" aria-label="Owner tools">
              <Link className="btn" to="/tournament">
                Mock Tournament
              </Link>
            </div>
          </article>
        </nav>

        <div className="home__hints">
          <p className="home__hint">Install Advantage as an app from your browser menu.</p>
          <p className="home__hint">
            Gym TV: open this site on a computer plugged into the TV, then fullscreen Display,
            Rounds, Owner’s Toolbox, or Mock Tournament. Press F for fullscreen.
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

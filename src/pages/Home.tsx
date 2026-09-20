import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProUnlockSheet } from '../components/ProUnlockSheet';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { unlinkBracketBout } from '../lib/bracketBout';
import { FOLDERS } from '../lib/photoStore';
import { lockPro } from '../lib/proUnlock';

export function HomePage() {
  const unlocked = useProUnlocked();
  const [unlockOpen, setUnlockOpen] = useState(false);

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
          <article className={`mode-card mode-card--saver${unlocked ? '' : ' mode-card--locked'}`}>
            {unlocked ? (
              <Link
                className="mode-card__hit"
                to="/slideshow?folder=gallery"
                tabIndex={-1}
                aria-label="Open Gallery"
              />
            ) : null}
            <strong>Owner’s Toolbox</strong>
            {unlocked ? (
              <span className="mode-card__sub">Pro</span>
            ) : (
              <button
                type="button"
                className="mode-card__sub mode-card__sub--unlock"
                aria-label="Owner unlock"
                onClick={() => setUnlockOpen(true)}
              >
                Pro
              </button>
            )}
            <span>
              {unlocked
                ? 'Gallery, videos, Pro Shop, event flyers, a mock tournament, a class schedule, and a roster.'
                : 'Coming soon — Advantage Coach and Advantage Pro.'}
            </span>
            <div className="mode-card__actions mode-card__actions--folders" aria-label="Owner folders">
              {FOLDERS.map((folder) =>
                unlocked ? (
                  <Link
                    key={folder.id}
                    className={`btn${folder.ready ? '' : ' btn--ghost'}`}
                    to={`/slideshow?folder=${folder.id}`}
                  >
                    {folder.label}
                  </Link>
                ) : (
                  <button
                    key={folder.id}
                    type="button"
                    className={`btn${folder.ready ? '' : ' btn--ghost'}`}
                    disabled
                  >
                    {folder.label}
                  </button>
                ),
              )}
            </div>
            <div className="mode-card__actions mode-card__actions--tools" aria-label="Owner tools">
              {unlocked ? (
                <Link className="btn" to="/tournament">
                  Mock Tournament
                </Link>
              ) : (
                <button type="button" className="btn" disabled>
                  Mock Tournament
                </button>
              )}
              {unlocked ? (
                <Link className="btn" to="/schedule">
                  Class Schedule
                </Link>
              ) : (
                <button type="button" className="btn" disabled>
                  Class Schedule
                </button>
              )}
              {unlocked ? (
                <Link className="btn" to="/roster">
                  Roster
                </Link>
              ) : (
                <button type="button" className="btn" disabled>
                  Roster
                </button>
              )}
            </div>
          </article>
        </nav>

        <div className="home__hints">
          <p className="home__hint">Install Advantage as an app from your browser menu.</p>
          <p className="home__hint">
            {unlocked
              ? 'Gym TV: open this site on a computer plugged into the TV, then fullscreen Display, Rounds, Owner’s Toolbox, Mock Tournament, or Class Schedule. Press F for fullscreen. Roster lives on the phone.'
              : 'Gym TV: open this site on a computer plugged into the TV, then fullscreen Display or Rounds. Press F for fullscreen.'}
          </p>
          <p className="home__hint">
            Control from your phone. Cast the scoreboard to your TV, or open Display on a second
            screen or computer.
          </p>
          {unlocked ? (
            <p className="home__soon">
              Advantage Pro is on for this browser.{' '}
              <button type="button" className="home__text-btn" onClick={() => lockPro()}>
                Lock Pro
              </button>
            </p>
          ) : (
            <p className="home__soon">Coming soon: Advantage Coach and Advantage Pro.</p>
          )}
        </div>
      </div>
      <ProUnlockSheet open={unlockOpen} onClose={() => setUnlockOpen(false)} />
    </main>
  );
}

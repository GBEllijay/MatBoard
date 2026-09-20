import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { ProUnlockSheet } from '../components/ProUnlockSheet';
import { Sheet } from '../components/Sheet';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { lockPro } from '../lib/proUnlock';

type SoonProduct = 'coach' | 'pro';

const SOON_COPY: Record<SoonProduct, { title: string; body: string }> = {
  coach: {
    title: 'Advantage Coach',
    body: 'Coming soon. Run mock tournaments, daily techniques, and roster tools for coaches. Nothing here opens those tools yet.',
  },
  pro: {
    title: 'Advantage Pro',
    body: 'Coming soon. Gym owner suite — class schedule, gallery, videos, events, Pro Shop, and instructor seats.',
  },
};

export function HomePage() {
  const unlocked = useProUnlocked();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [soon, setSoon] = useState<SoonProduct | null>(null);

  const openUnlock = () => {
    setSoon(null);
    setUnlockOpen(true);
  };

  return (
    <main className="home home--ladder">
      <div className="home__inner">
        <HomeMark tagline="BJJ scoreboard, round timer, and gym tools." />

        <nav className="home__modes" aria-label="Products">
          <Link className="mode-card mode-card--white" to="/white">
            <strong>Advantage White</strong>
            <span className="mode-card__sub">BJJ Scoreboard and Timer</span>
            <span>Live Bout + Rounds</span>
          </Link>

          <button
            type="button"
            className="mode-card mode-card--coach mode-card--locked"
            aria-haspopup="dialog"
            aria-label="Advantage Coach, coming soon"
            onClick={() => setSoon('coach')}
          >
            <strong>Advantage Coach</strong>
            <span className="mode-card__sub">Coming soon</span>
            <span>Run mock tournaments, daily techniques, and roster tools for coaches.</span>
          </button>

          {unlocked ? (
            <article className="mode-card mode-card--pro">
              <Link
                className="mode-card__hit"
                to="/pro"
                tabIndex={-1}
                aria-label="Open Pro toolbox"
              />
              <strong>Advantage Pro</strong>
              <span className="mode-card__sub">Owner’s Toolbox</span>
              <span>
                Class schedule, gallery, videos, events, Pro Shop, mock tournament, roster, and
                more.
              </span>
              <div className="mode-card__actions">
                <Link className="btn" to="/pro">
                  Open Pro toolbox
                </Link>
              </div>
            </article>
          ) : (
            <button
              type="button"
              className="mode-card mode-card--pro mode-card--locked"
              aria-haspopup="dialog"
              aria-label="Advantage Pro, coming soon"
              onClick={() => setSoon('pro')}
            >
              <strong>Advantage Pro</strong>
              <span className="mode-card__sub">Coming soon</span>
              <span>
                Gym owner suite — class schedule, gallery, videos, events, Pro Shop, and instructor
                seats.
              </span>
            </button>
          )}
        </nav>

        <div className="home__hints">
          <p className="home__hint">Install Advantage as an app from your browser menu.</p>
          <p className="home__hint">
            {unlocked
              ? 'Gym TV: open White for Display or Rounds, or Pro for Owner’s Toolbox, Mock Tournament, or Class Schedule. Press F for fullscreen. Roster lives on the phone.'
              : 'Gym TV: open White, then fullscreen Display or Rounds. Press F for fullscreen.'}
          </p>
          <p className="home__hint">
            Control from your phone. Cast the scoreboard to your TV, or open Display on a second
            screen or computer.
          </p>
          {unlocked ? (
            <p className="home__soon">
              Advantage Pro is on for this browser.{' '}
              <Link className="home__text-btn" to="/pro">
                Open Pro toolbox
              </Link>
              {' · '}
              <button type="button" className="home__text-btn" onClick={() => lockPro()}>
                Lock Pro
              </button>
            </p>
          ) : (
            <p className="home__soon">Coming soon: Advantage Coach and Advantage Pro.</p>
          )}
        </div>
      </div>

      <Sheet
        open={soon !== null}
        title={soon ? SOON_COPY[soon].title : 'Coming soon'}
        onClose={() => setSoon(null)}
      >
        {soon ? <p className="home__unlock-copy">{SOON_COPY[soon].body}</p> : null}
        {soon === 'pro' ? (
          <button type="button" className="btn btn--ghost" onClick={openUnlock}>
            Owner unlock
          </button>
        ) : null}
      </Sheet>
      <ProUnlockSheet open={unlockOpen} onClose={() => setUnlockOpen(false)} />
    </main>
  );
}

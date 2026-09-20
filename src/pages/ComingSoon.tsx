import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProUnlockSheet } from '../components/ProUnlockSheet';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { lockPro } from '../lib/proUnlock';

export function ComingSoonPage() {
  const unlocked = useProUnlocked();
  const [unlockOpen, setUnlockOpen] = useState(false);

  return (
    <main className="home home--soon">
      <div className="home__inner home__inner--soon">
        <div className="home__mark">
          <img className="home__logo" src="/advantage-icon.png" alt="" width={713} height={713} />
          <h1>Advantage</h1>
          {unlocked ? (
            <p>Advantage Pro is on for this browser.</p>
          ) : (
            <p>Coming soon — Advantage Coach and Advantage Pro.</p>
          )}
        </div>

        {unlocked ? (
          <nav className="home__soon-actions" aria-label="Pro">
            <Link className="btn" to="/slideshow?folder=gallery">
              Owner’s Toolbox
            </Link>
            <Link className="btn" to="/tournament">
              Mock Tournament
            </Link>
            <Link className="btn btn--ghost" to="/">
              Home
            </Link>
            <button type="button" className="btn btn--ghost" onClick={() => lockPro()}>
              Lock Pro
            </button>
          </nav>
        ) : (
          <nav className="home__soon-actions" aria-label="Coming soon">
            <p className="home__soon-lead">
              Live Bout and Rounds are ready now. Gym-owner tools stay off until Advantage Coach
              and Advantage Pro open.
            </p>
            <Link className="btn" to="/">
              Back to home
            </Link>
            <button type="button" className="btn btn--ghost" onClick={() => setUnlockOpen(true)}>
              Owner unlock
            </button>
          </nav>
        )}
      </div>
      <ProUnlockSheet open={unlockOpen} onClose={() => setUnlockOpen(false)} />
    </main>
  );
}

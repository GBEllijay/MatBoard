import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { ProUnlockSheet } from '../components/ProUnlockSheet';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { lockPro } from '../lib/proUnlock';

export function ComingSoonPage() {
  const unlocked = useProUnlocked();
  const [unlockOpen, setUnlockOpen] = useState(false);

  return (
    <main className="home home--soon">
      <div className="home__inner home__inner--soon">
        <HomeMark
          to="/"
          tagline={
            unlocked
              ? 'Advantage Pro is on for this browser.'
              : 'Coming soon — Advantage Coach and Advantage Pro.'
          }
        />

        {unlocked ? (
          <nav className="home__soon-actions" aria-label="Pro">
            <Link className="btn" to="/pro">
              Open Pro toolbox
            </Link>
            <Link className="btn" to="/tournament">
              Mock Tournament
            </Link>
            <Link className="btn" to="/schedule">
              Class Schedule
            </Link>
            <Link className="btn" to="/roster">
              Competitor roster
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
              Advantage White is ready now — Live Bout and Rounds. Advantage Coach and Advantage
              Pro stay Coming soon on home (no checkout). Gym-owner tools stay off until Pro is
              unlocked on this browser.
            </p>
            <Link className="btn" to="/white">
              Advantage White
            </Link>
            <Link className="btn btn--ghost" to="/">
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

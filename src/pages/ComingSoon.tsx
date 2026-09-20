import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { ProUnlockSheet } from '../components/ProUnlockSheet';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { lockCoach } from '../lib/coachUnlock';
import { lockPro } from '../lib/proUnlock';

export function ComingSoonPage() {
  const proUnlocked = useProUnlocked();
  const coachUnlocked = useCoachUnlocked();
  const [unlockOpen, setUnlockOpen] = useState<'coach' | 'pro' | null>(null);

  const tagline = proUnlocked
    ? 'Advantage Pro is on for this browser.'
    : coachUnlocked
      ? 'Advantage Coach is on for this browser.'
      : 'Coming soon — Advantage Coach and Advantage Pro.';

  return (
    <main className="home home--soon">
      <div className="home__inner home__inner--soon">
        <HomeMark to="/" tagline={tagline} />

        {proUnlocked || coachUnlocked ? (
          <nav className="home__soon-actions" aria-label={proUnlocked ? 'Pro' : 'Coach'}>
            {proUnlocked ? (
              <Link className="btn" to="/pro">
                Open Console
              </Link>
            ) : null}
            {coachUnlocked ? (
              <Link className="btn" to="/coach">
                Open Coach
              </Link>
            ) : null}
            <Link className="btn btn--white" to="/tournament">
              <BeltRail kind="tournament" />
              Mock Tournament
            </Link>
            {coachUnlocked ? (
              <>
                <Link className="btn" to="/roster">
                  Competitor roster
                </Link>
                <Link className="btn" to="/notes">
                  Training notes
                </Link>
                <Link className="btn" to="/techniques">
                  Daily Training Videos
                </Link>
              </>
            ) : null}
            {proUnlocked ? (
              <>
                <Link className="btn" to="/schedule">
                  Class Schedule
                </Link>
                {!coachUnlocked ? (
                  <Link className="btn" to="/roster">
                    Competitor roster
                  </Link>
                ) : null}
              </>
            ) : null}
            <Link className="btn btn--ghost" to="/">
              Home
            </Link>
            {proUnlocked ? (
              <button type="button" className="btn btn--ghost" onClick={() => lockPro()}>
                Lock Pro
              </button>
            ) : null}
            {coachUnlocked ? (
              <button type="button" className="btn btn--ghost" onClick={() => lockCoach()}>
                Lock Coach
              </button>
            ) : null}
          </nav>
        ) : (
          <nav className="home__soon-actions" aria-label="Coming soon">
            <p className="home__soon-lead">
              Advantage White is ready now — Live Bout and Rounds. Advantage Coach and Advantage
              Pro stay Coming soon on home. Gym-owner tools stay off until Coach or Pro is unlocked
              on this browser.
            </p>
            <Link className="btn" to="/white">
              Advantage White
            </Link>
            <Link className="btn btn--ghost" to="/">
              Back to home
            </Link>
            <button type="button" className="btn btn--ghost" onClick={() => setUnlockOpen('coach')}>
              Unlock Coach
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setUnlockOpen('pro')}>
              Unlock Pro
            </button>
          </nav>
        )}
      </div>
      <ProUnlockSheet
        product={unlockOpen ?? 'pro'}
        open={unlockOpen !== null}
        onClose={() => setUnlockOpen(null)}
      />
    </main>
  );
}

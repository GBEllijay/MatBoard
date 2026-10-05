import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlphaAccessNote } from '../components/AlphaAccessNote';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { ProUnlockSheet } from '../components/ProUnlockSheet';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { SiteFooter } from '../components/SiteFooter';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import { lockCoach } from '../lib/coachUnlock';
import { COACH_HUBS, coachDoorOpen, PRO_HUBS } from '../lib/productNames';
import { lockPro } from '../lib/proUnlock';
import { whiteEntryPath } from '../lib/whiteUnlock';

export function ComingSoonPage() {
  const proUnlocked = useProUnlocked();
  const whiteUnlocked = useWhiteUnlocked();
  const coachUnlocked = useCoachUnlocked();
  const seated = useCurrentSeat() !== null;
  const coachTools = coachDoorOpen(proUnlocked, coachUnlocked, seated);
  const [unlockOpen, setUnlockOpen] = useState<'coach' | 'pro' | null>(null);

  const tagline = proUnlocked
    ? 'Advantage Pro is on for this browser.'
    : coachUnlocked
      ? 'Advantage Coach is on for this browser.'
      : seated
        ? 'This browser is signed in with an instructor seat.'
        : 'Coming soon — Advantage Coach and Advantage Pro.';

  return (
    <main className="home home--soon">
      <div className="home__inner home__inner--soon">
        <HomeMark to="/" tagline={tagline} />

        {coachTools ? (
          <nav className="home__soon-actions" aria-label={proUnlocked ? 'Pro' : 'Coach'}>
            {proUnlocked
              ? PRO_HUBS.map((hub) => (
                  <Link key={hub.to} className="btn btn--white" to={hub.to}>
                    <BeltRail kind={hub.belt} />
                    {hub.title}
                  </Link>
                ))
              : null}
            {coachTools ? (
              <Link className="btn" to="/coach">
                Open Coach
              </Link>
            ) : null}
            {coachTools && !proUnlocked
              ? COACH_HUBS.map((tool) => (
                  <Link
                    key={tool.to}
                    className={'belt' in tool ? 'btn btn--white' : 'btn'}
                    to={tool.to}
                  >
                    {'belt' in tool ? <BeltRail kind={tool.belt} /> : null}
                    {tool.title}
                  </Link>
                ))
              : null}
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
              {whiteUnlocked
                ? 'Advantage White is ready on this browser — Live Bout and Rounds. '
                : 'Advantage White is $9.99 — Live Bout and Rounds unlock after purchase. '}
              Advantage Coach and Advantage Pro stay Coming soon on home. Gym-owner tools stay off
              until Coach or Pro is unlocked on this browser.
            </p>
            <AlphaAccessNote />
            <Link className="btn" to={whiteEntryPath(whiteUnlocked)}>
              {whiteUnlocked ? 'Advantage White' : 'Buy Advantage White'}
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
        <SiteFooter />
      </div>
      <ProUnlockSheet
        product={unlockOpen ?? 'pro'}
        open={unlockOpen !== null}
        onClose={() => setUnlockOpen(null)}
      />
    </main>
  );
}

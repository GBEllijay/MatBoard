import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { ComingSoonAd, ComingSoonAdActions } from '../components/ComingSoonAd';
import { HomeMark } from '../components/HomeMark';
import { ProUnlockSheet } from '../components/ProUnlockSheet';
import { Sheet } from '../components/Sheet';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { lockCoach } from '../lib/coachUnlock';
import { COMING_SOON_ADS, PRODUCT_TEASERS, type SoonProduct } from '../lib/comingSoonAds';
import { GYM_CONSOLE_NAME } from '../lib/productNames';
import { lockPro } from '../lib/proUnlock';

export function HomePage() {
  const proUnlocked = useProUnlocked();
  const coachUnlocked = useCoachUnlocked();
  const [unlockOpen, setUnlockOpen] = useState<'coach' | 'pro' | null>(null);
  const [soon, setSoon] = useState<SoonProduct | null>(null);

  const openUnlock = (product: 'coach' | 'pro') => {
    setSoon(null);
    setUnlockOpen(product);
  };

  return (
    <main className="home home--ladder">
      <div className="home__inner">
        <HomeMark tagline="BJJ scoreboard, round timer, and gym tools." />

        <nav className="home__modes" aria-label="Products">
          <Link className="mode-card mode-card--white" to="/white">
            <BeltRail kind="white" />
            <strong>Advantage White</strong>
            <span className="mode-card__sub">BJJ Scoreboard and Timer</span>
            <span className="mode-card__teaser">Live Bout + Rounds</span>
          </Link>

          {coachUnlocked ? (
            <article className="mode-card mode-card--coach">
              <Link
                className="mode-card__hit"
                to="/coach"
                tabIndex={-1}
                aria-label="Open Advantage Coach"
              />
              <BeltRail kind="blue" />
              <strong>Advantage Coach</strong>
              <span className="mode-card__sub">Coach tools</span>
              <span className="mode-card__teaser">{PRODUCT_TEASERS.coachUnlocked}</span>
              <div className="mode-card__actions">
                <Link className="btn btn--white" to="/coach">
                  Open Coach
                </Link>
              </div>
            </article>
          ) : (
            <button
              type="button"
              className="mode-card mode-card--coach mode-card--locked"
              aria-haspopup="dialog"
              aria-label="Advantage Coach, coming soon"
              onClick={() => setSoon('coach')}
            >
              <BeltRail kind="blue" />
              <strong>Advantage Coach</strong>
              <span className="mode-card__sub">Coming soon</span>
              <span className="mode-card__teaser">{PRODUCT_TEASERS.coach}</span>
            </button>
          )}

          {proUnlocked ? (
            <article className="mode-card mode-card--pro">
              <Link
                className="mode-card__hit"
                to="/pro"
                tabIndex={-1}
                aria-label={`Open ${GYM_CONSOLE_NAME}`}
              />
              <BeltRail kind="black" />
              <strong>Advantage Pro</strong>
              <span className="mode-card__sub">{GYM_CONSOLE_NAME}</span>
              <span className="mode-card__teaser">{PRODUCT_TEASERS.proUnlocked}</span>
              <div className="mode-card__actions">
                <Link className="btn btn--white" to="/pro">
                  Open Console
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
              <BeltRail kind="black" />
              <strong>Advantage Pro</strong>
              <span className="mode-card__sub">Coming soon</span>
              <span className="mode-card__teaser">{PRODUCT_TEASERS.pro}</span>
            </button>
          )}
        </nav>

        <div className="home__hints">
          <p className="home__hint">Install Advantage as an app from your browser menu.</p>
          <p className="home__hint">
            {proUnlocked
              ? `Gym TV: open White for Display or Rounds, or Pro for ${GYM_CONSOLE_NAME}, Mock Tournament, or Class Schedule. Press F for fullscreen. Roster lives on the phone.`
              : coachUnlocked
                ? 'Gym TV: open White for Display or Rounds, or Coach for Mock Tournament, Daily Techniques, or Competitor Management. Press F for fullscreen.'
                : 'Gym TV: open White, then fullscreen Display or Rounds. Press F for fullscreen.'}
          </p>
          <p className="home__hint">
            Control from your phone. Cast the scoreboard to your TV, or open Display on a second
            screen or computer.
          </p>
          {proUnlocked || coachUnlocked ? (
            <p className="home__soon">
              {proUnlocked ? 'Advantage Pro is on for this browser. ' : null}
              {coachUnlocked ? 'Advantage Coach is on for this browser. ' : null}
              {proUnlocked ? (
                <Link className="home__text-btn" to="/pro">
                  Open Console
                </Link>
              ) : null}
              {proUnlocked && coachUnlocked ? ' · ' : null}
              {coachUnlocked ? (
                <Link className="home__text-btn" to="/coach">
                  Open Coach
                </Link>
              ) : null}
              {proUnlocked ? (
                <>
                  {' · '}
                  <button type="button" className="home__text-btn" onClick={() => lockPro()}>
                    Lock Pro
                  </button>
                </>
              ) : null}
              {coachUnlocked ? (
                <>
                  {' · '}
                  <button type="button" className="home__text-btn" onClick={() => lockCoach()}>
                    Lock Coach
                  </button>
                </>
              ) : null}
            </p>
          ) : (
            <p className="home__soon">Coming soon: Advantage Coach and Advantage Pro.</p>
          )}
        </div>
      </div>

      <Sheet
        className="sheet--ad"
        open={soon !== null}
        title={soon ? COMING_SOON_ADS[soon].title : 'Coming soon'}
        onClose={() => setSoon(null)}
        footer={
          soon ? (
            <ComingSoonAdActions
              product={soon}
              onDismiss={() => setSoon(null)}
              extraAction={{
                label: 'Owner unlock',
                onClick: () => openUnlock(soon),
              }}
            />
          ) : null
        }
      >
        {soon ? <ComingSoonAd product={soon} /> : null}
      </Sheet>
      <ProUnlockSheet
        product={unlockOpen ?? 'pro'}
        open={unlockOpen !== null}
        onClose={() => setUnlockOpen(null)}
      />
    </main>
  );
}

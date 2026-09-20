import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { ComingSoonAd, ComingSoonAdActions } from '../components/ComingSoonAd';
import { HomeMark } from '../components/HomeMark';
import { ProUnlockSheet } from '../components/ProUnlockSheet';
import { Sheet } from '../components/Sheet';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { COMING_SOON_ADS, PRODUCT_TEASERS, type SoonProduct } from '../lib/comingSoonAds';
import { lockPro } from '../lib/proUnlock';

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
            <BeltRail kind="white" />
            <strong>Advantage White</strong>
            <span className="mode-card__sub">BJJ Scoreboard and Timer</span>
            <span className="mode-card__teaser">Live Bout + Rounds</span>
          </Link>

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

          {unlocked ? (
            <article className="mode-card mode-card--pro">
              <Link
                className="mode-card__hit"
                to="/pro"
                tabIndex={-1}
                aria-label="Open Pro toolbox"
              />
              <BeltRail kind="black" />
              <strong>Advantage Pro</strong>
              <span className="mode-card__sub">Owner’s Toolbox</span>
              <span className="mode-card__teaser">{PRODUCT_TEASERS.proUnlocked}</span>
              <div className="mode-card__actions">
                <Link className="btn btn--white" to="/pro">
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
        className="sheet--ad"
        open={soon !== null}
        title={soon ? COMING_SOON_ADS[soon].title : 'Coming soon'}
        onClose={() => setSoon(null)}
        footer={
          soon ? (
            <ComingSoonAdActions
              product={soon}
              onDismiss={() => setSoon(null)}
              extraAction={
                soon === 'pro' ? { label: 'Owner unlock', onClick: openUnlock } : undefined
              }
            />
          ) : null
        }
      >
        {soon ? <ComingSoonAd product={soon} /> : null}
      </Sheet>
      <ProUnlockSheet open={unlockOpen} onClose={() => setUnlockOpen(false)} />
    </main>
  );
}

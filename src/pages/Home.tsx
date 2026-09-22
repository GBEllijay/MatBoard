import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { ComingSoonAd, ComingSoonAdActions } from '../components/ComingSoonAd';
import { HomeMark } from '../components/HomeMark';
import { ProUnlockSheet } from '../components/ProUnlockSheet';
import { Sheet } from '../components/Sheet';
import { TierLine } from '../components/TierLine';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import {
  COMING_SOON_ADS,
  type SoonProduct,
} from '../lib/comingSoonAds';
import { COACH_TOOLS_TEASER } from '../lib/coachCopy';
import { GYM_CONSOLE_NAME, PRO_LADDER_DETAIL, WHITE_LADDER_DETAIL } from '../lib/productNames';

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
            <span className="mode-card__sub">
              <TierLine tier="White" detail={WHITE_LADDER_DETAIL} />
            </span>
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
              <span className="mode-card__sub">
                <TierLine tier="Coach" detail={COACH_TOOLS_TEASER} />
              </span>
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
              <span className="mode-card__sub">
                <TierLine tier="Coach" detail={COACH_TOOLS_TEASER} />
              </span>
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
              <span className="mode-card__sub">
                <TierLine tier="Pro" detail={PRO_LADDER_DETAIL} />
              </span>
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
              <span className="mode-card__sub">
                <TierLine tier="Pro" detail={PRO_LADDER_DETAIL} />
              </span>
            </button>
          )}
        </nav>

        <div className="home__hints">
          <p className="home__hint">
            Install Advantage as an app from your browser menu for best results.
          </p>
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

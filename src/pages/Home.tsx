import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlphaAccessNote } from '../components/AlphaAccessNote';
import { BeltRail } from '../components/BeltRail';
import { ComingSoonAd, ComingSoonAdActions } from '../components/ComingSoonAd';
import { HomeMark } from '../components/HomeMark';
import { ProUnlockSheet } from '../components/ProUnlockSheet';
import { SeatSessionBar, useCurrentSeat } from '../components/SeatSessionBar';
import { Sheet } from '../components/Sheet';
import { SiteFooter } from '../components/SiteFooter';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useSeatDoor } from '../hooks/useSeatDoor';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import {
  COMING_SOON_ADS,
  type SoonProduct,
} from '../lib/comingSoonAds';
import {
  COACH_HOME_DESCRIPTION,
  GYM_CONSOLE_NAME,
  HOME_MOTTO,
  PRO_HOME_LINES,
  WHITE_HOME_DESCRIPTION,
  coachDoorOpen,
  visibleProHubs,
} from '../lib/productNames';
import { COACH_PRICE_LINE, PRO_PRICE_LINE } from '../lib/productPrices';
import { WHITE_PRICE_LABEL } from '../lib/whitePurchase';
import { whiteEntryPath } from '../lib/whiteUnlock';

export function HomePage() {
  const door = useSeatDoor();
  const proUnlocked = door.proUnlocked;
  const proHubs = visibleProHubs(door);
  const whiteUnlocked = useWhiteUnlocked();
  const coachOpen = coachDoorOpen(proUnlocked, useCoachUnlocked(), useCurrentSeat() !== null);
  const [unlockOpen, setUnlockOpen] = useState<'coach' | 'pro' | null>(null);
  const [soon, setSoon] = useState<SoonProduct | null>(null);

  const openUnlock = (product: 'coach' | 'pro') => {
    setSoon(null);
    setUnlockOpen(product);
  };

  return (
    <main className="home home--ladder">
      <div className="home__inner">
        <HomeMark motto={HOME_MOTTO} tagline="BJJ scoreboard, round timer, and gym tools." />

        <SeatSessionBar />
        <nav className="home__modes" aria-label="Products">
          <Link className="mode-card mode-card--white" to={whiteEntryPath(whiteUnlocked)}>
            <BeltRail kind="white" />
            <strong>Advantage White</strong>
            <HomeDescription text={WHITE_HOME_DESCRIPTION} />
            <span className="mode-card__actions">
              <span className="btn btn--white">
                {whiteUnlocked ? 'Open White' : `Buy — ${WHITE_PRICE_LABEL}`}
              </span>
            </span>
          </Link>

          {coachOpen ? (
            <article className="mode-card mode-card--coach">
              <Link
                className="mode-card__hit"
                to="/coach"
                tabIndex={-1}
                aria-label="Open Advantage Coach"
              />
              <BeltRail kind="blue" />
              <strong>Advantage Coach</strong>
              <HomeDescription text={COACH_HOME_DESCRIPTION} />
              <div className="mode-card__actions">
                <Link className="btn btn--white" to="/coach">
                  Open Coach
                </Link>
              </div>
            </article>
          ) : (
            <article className="mode-card mode-card--coach mode-card--locked">
              <button
                type="button"
                className="mode-card__hit"
                aria-haspopup="dialog"
                aria-label="Advantage Coach, coming soon"
                onClick={() => setSoon('coach')}
              />
              <BeltRail kind="blue" />
              <strong>Advantage Coach</strong>
              <HomeDescription text={COACH_HOME_DESCRIPTION} />
              <p className="mode-card__price">{COACH_PRICE_LINE}</p>
              <AlphaAccessNote />
            </article>
          )}

          {proHubs.length > 0 ? (
            <article className="mode-card mode-card--pro">
              <Link
                className="mode-card__hit"
                to="/pro"
                tabIndex={-1}
                aria-label={`Open ${GYM_CONSOLE_NAME}`}
              />
              <ProHomeCopy />
              <div className="mode-card__actions">
                <Link className="btn btn--white" to="/pro">
                  Open Console
                </Link>
              </div>
            </article>
          ) : (
            <article className="mode-card mode-card--pro mode-card--locked">
              <button
                type="button"
                className="mode-card__hit"
                aria-haspopup="dialog"
                aria-label="Advantage Pro, coming soon"
                onClick={() => setSoon('pro')}
              />
              <ProHomeCopy />
              <p className="mode-card__price">{PRO_PRICE_LINE}</p>
              <AlphaAccessNote />
            </article>
          )}
        </nav>

        <div className="home__hints">
          <p className="home__hint">
            Install Advantage as an app from your browser menu for best results.
          </p>
        </div>
        <SiteFooter />
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

function HomeDescription({ text }: { text: string }) {
  return (
    <span className="mode-card__copy">
      <span>{text}</span>
    </span>
  );
}

function HomeLines({ lines }: { lines: readonly string[] }) {
  return (
    <span className="mode-card__copy">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  );
}

function ProHomeCopy() {
  return (
    <>
      <BeltRail kind="black" />
      <strong>Advantage Pro</strong>
      <HomeLines lines={PRO_HOME_LINES} />
    </>
  );
}

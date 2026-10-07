import { Link, useNavigate } from 'react-router-dom';
import { BeltHeader } from '../components/BeltHeader';
import { HomeMark } from '../components/HomeMark';
import { InstructionsButton } from '../components/InstructionsButton';
import { ProToolboxCard } from '../components/ProToolboxCard';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { SiteFooter } from '../components/SiteFooter';
import { useSeatDoor } from '../hooks/useSeatDoor';
import { CHECKOUT_BUY_PATH } from '../lib/checkoutProducts';
import { PRO_LIST_PRICE_CENTS, PRO_MONTHLY_PRICE_CENTS } from '../lib/productPrices';
import { MEDIA_CONSOLE_NAME, PRO_LADDER_DETAIL, consoleHubs } from '../lib/productNames';
import { formatUsdFromCents } from '../lib/whitePurchase';
import { purchasePromptsHidden } from '../lib/instructorSeats';
import { lockPro } from '../lib/proUnlock';

export function ProPage() {
  const navigate = useNavigate();
  const door = useSeatDoor();
  const hubs = consoleHubs(door, door.seat?.permissions ?? null);
  const seat = useCurrentSeat();
  const mediaSeat = hubs.length > 0 && hubs.every((hub) => hub.belt === 'purple');

  return (
    <main className="home home--pro">
      <div className="home__inner">
        <HomeMark to="/" />

        <nav className="home__modes" aria-label="Advantage Pro">
          <BeltHeader
            kind={mediaSeat ? 'purple' : 'black'}
            worn={!mediaSeat}
            title={mediaSeat ? MEDIA_CONSOLE_NAME : 'Advantage Pro'}
            blurb={mediaSeat ? hubs.map((hub) => hub.title).join(', ') : PRO_LADDER_DETAIL}
          />
          <ProToolboxCard hubs={hubs} label={mediaSeat ? MEDIA_CONSOLE_NAME : 'Advantage Pro hubs'} />
        </nav>

        <div className="home__hints">
          <InstructionsButton controlsId="pro-instructions">
            <p className="home__hint">Install Advantage as an app from your browser menu.</p>
            <p className="home__hint">
              Gym TV: open this site on a computer plugged into the TV, then fullscreen the scoreboard,
              Rounds, {MEDIA_CONSOLE_NAME}, or Class Schedule. Press F for fullscreen. Roster lives on
              the phone.
            </p>
            <p className="home__hint">
              Control from your phone. Cast the scoreboard to your TV, or open Display on a second
              screen or computer.
            </p>
          </InstructionsButton>
          {purchasePromptsHidden(seat) ? null : (
            <p className="home__soon">
              <Link className="home__text-btn" to={CHECKOUT_BUY_PATH.pro}>
                {`Buy Advantage Pro — ${formatUsdFromCents(PRO_LIST_PRICE_CENTS)} + ${formatUsdFromCents(PRO_MONTHLY_PRICE_CENTS)}/month`}
              </Link>
            </p>
          )}
          {door.proUnlocked ? (
            <p className="home__soon">
              Advantage Pro is on for this browser.
              {door.seated ? ' This seat keeps the menus from its invite.' : ''}{' '}
              <Link className="home__text-btn" to="/">
                All products
              </Link>
              {' · '}
              <button
                type="button"
                className="home__text-btn"
                onClick={() => {
                  lockPro();
                  navigate('/');
                }}
              >
                Lock Pro
              </button>
            </p>
          ) : (
            <p className="home__soon">
              Program director seat. Media Console is open on this browser.{' '}
              <Link className="home__text-btn" to="/">
                All products
              </Link>
            </p>
          )}
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}

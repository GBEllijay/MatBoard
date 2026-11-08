import { Link, useNavigate } from 'react-router-dom';
import { BeltHeader } from '../components/BeltHeader';
import { EditionLadder } from '../components/EditionLadder';
import { HomeMark } from '../components/HomeMark';
import { PlayExitMark } from '../components/PlayExitMark';
import { FaqLink } from '../components/FaqLink';
import { InstructionsButton } from '../components/InstructionsButton';
import { LicenseShareButton } from '../components/LicenseShareButton';
import { ProToolboxCard } from '../components/ProToolboxCard';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { SiteFooter } from '../components/SiteFooter';
import { useSeatDoor } from '../hooks/useSeatDoor';
import { useProPlusCloudUnlocked } from '../hooks/useProPlusCloud';
import { CHECKOUT_BUY_PATH } from '../lib/checkoutProducts';
import { PRO_LIST_PRICE_CENTS, PRO_MONTHLY_PRICE_CENTS } from '../lib/productPrices';
import { entitlementNowMs, entitlementSnapshot } from '../lib/entitlement';
import { MEDIA_CONSOLE_NAME, PRO_LADDER_DETAIL, PRODUCTS_PATH, PRO_PLUS_CLOUD_PATH, consoleHubs, grantedConsoleHubs, mediaConsoleDoorOpen } from '../lib/productNames';
import { cameraHubs } from '../lib/pdCamera';
import { formatUsdFromCents } from '../lib/whitePurchase';
import { purchasePromptsHidden } from '../lib/instructorSeats';
import { lockMedia } from '../lib/mediaUnlock';
import { ownerIdentitySheetVisible } from '../lib/ownerIdentitySheet';
import { lockPro } from '../lib/proUnlock';
import { AdvantageCloudHome } from '../components/AdvantageCloudHome';
import { AcademyPathwayPanel } from '../components/AcademyPathwayPanel';
import { CloudLapseNotice } from '../components/CloudLapseNotice';
import { GymCharacterSheet } from '../components/GymCharacterSheet';
import { InstructorSheet } from '../components/InstructorSheet';
import { BeltRail } from '../components/BeltRail';
import './proHomeMenu.css';

export function ProPage() {
  const navigate = useNavigate();
  const door = useSeatDoor();
  const access = entitlementSnapshot();
  const hubs = grantedConsoleHubs(
    [
      ...consoleHubs(door, door.seat?.permissions ?? null),
      // Program director Camera window, beside the Media Console folders.
      ...(mediaConsoleDoorOpen(door) ? cameraHubs(door.seat ?? null) : []),
    ],
    access.claims,
    entitlementNowMs(),
    access.amnesty,
  );
  const seat = useCurrentSeat();
  const cloudConsole = useProPlusCloudUnlocked();
  const mediaSeat = hubs.length > 0 && hubs.every((hub) => hub.belt === 'purple');
  const proMenuHubs = hubs.map((hub) =>
    hub.to === '/slideshow?folder=gallery' && hub.title === MEDIA_CONSOLE_NAME
      ? { ...hub, title: 'Advantage Media Edition' }
      : hub,
  );

  return (
    <main className="home home--pro home--pro-menu">
      <div className="home__inner">
        {cloudConsole ? <PlayExitMark to={PRO_PLUS_CLOUD_PATH} /> : null}
        <HomeMark to={PRODUCTS_PATH} />
        <CloudLapseNotice />

        <nav className="home__modes" aria-label="Advantage Pro">
          <BeltHeader
            kind={mediaSeat ? 'purple' : 'black'}
            worn={!mediaSeat}
            title={mediaSeat ? MEDIA_CONSOLE_NAME : 'Advantage Pro'}
            blurb={mediaSeat ? hubs.map((hub) => hub.title).join(', ') : PRO_LADDER_DETAIL}
          />
          <GymCharacterSheet />
          {ownerIdentitySheetVisible({ page: 'pro', proUnlocked: door.proUnlocked, seated: door.seated }) ? (
            <InstructorSheet />
          ) : null}
          {cloudConsole && !seat ? <AdvantageCloudHome /> : null}
          <Link className="pro-hub" to="/white" data-pro-entry="white">
            <BeltRail kind="white" />
            <span>Advantage White</span>
          </Link>
          <Link className="pro-hub" to="/student" data-pro-entry="student">
            <BeltRail kind="blue" />
            <span>Advantage Student Edition</span>
          </Link>
          <ProToolboxCard hubs={proMenuHubs} label={mediaSeat ? MEDIA_CONSOLE_NAME : 'Advantage Pro hubs'} />
          <LicenseShareButton />
        </nav>

        <AcademyPathwayPanel />

        <EditionLadder page="pro" />
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
          <FaqLink />
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
              <Link className="home__text-btn" to={PRODUCTS_PATH}>
                All products
              </Link>
              {' · '}
              <button
                type="button"
                className="home__text-btn"
                onClick={() => {
                  lockPro();
                  navigate(PRODUCTS_PATH);
                }}
              >
                Lock Pro
              </button>
              {door.mediaUnlocked ? (
                <>
                  {' · '}
                  <button type="button" className="home__text-btn" onClick={() => lockMedia()}>
                    Lock Media
                  </button>
                </>
              ) : null}
            </p>
          ) : (
            <p className="home__soon">
              {door.programDirectorSeat
                ? 'Program director seat. Media Console is open on this browser.'
                : 'This seat keeps the menus from its invite. Media Console is open on this browser.'}{' '}
              <Link className="home__text-btn" to={PRODUCTS_PATH}>
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

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AdvantageCloudHome } from '../components/AdvantageCloudHome';
import { GymCharacterSheet } from '../components/GymCharacterSheet';
import { InstructorSheet } from '../components/InstructorSheet';
import { EditionLadder } from '../components/EditionLadder';
import { BeltHeader } from '../components/BeltHeader';
import { BeltRail } from '../components/BeltRail';
import { PlusCloudConduct } from '../components/PlusCloudConduct';
import { HomeMark } from '../components/HomeMark';
import { FaqLink } from '../components/FaqLink';
import { InstructionsButton } from '../components/InstructionsButton';
import { InstructorInvitePanel } from '../components/InstructorInvitePanel';
import { PlayExitMark } from '../components/PlayExitMark';
import { ProToolboxCard } from '../components/ProToolboxCard';
import { SiteFooter } from '../components/SiteFooter';
import { useSeatDoor } from '../hooks/useSeatDoor';
import {
  MEDIA_CONSOLE_NAME,
  PRODUCTS_PATH,
  PRO_PLUS_CLOUD_BELT_BLURB,
  PRO_PLUS_CLOUD_NAME,
  PRO_PLUS_CLOUD_PATH,
  consoleHubs,
} from '../lib/productNames';
import { ownerIdentitySheetVisible } from '../lib/ownerIdentitySheet';
import './proHomeMenu.css';

/**
 * Advantage Pro Plus Cloud menu.
 * Edition cards match Advantage Pro (src/pages/Pro.tsx): White opens /white
 * (the unlocked scoreboard and timer hub, not /buy), Student opens /student,
 * and the purple hub keeps the Media Console destination while showing
 * Advantage Media Edition. The other Pro hubs stay.
 * The header stays the worn black belt: white stripe, red bar, white stripe.
 * Advantage Cloud status and upload links stay above those cards.
 */
export function ProPlusCloudPage() {
  const door = useSeatDoor();
  const hubs = consoleHubs(door, door.seat?.permissions ?? null).map((hub) =>
    hub.to === '/slideshow?folder=gallery' && hub.title === MEDIA_CONSOLE_NAME
      ? { ...hub, title: 'Advantage Media Edition' }
      : hub,
  );

  useEffect(() => {
    const previous = document.title;
    document.title = PRO_PLUS_CLOUD_NAME;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <main className="home home--pro home--pro-menu" data-page={PRO_PLUS_CLOUD_PATH}>
      <div className="home__inner">
        <PlayExitMark to={PRODUCTS_PATH} />
        <HomeMark to={PRODUCTS_PATH} />

        <nav className="home__modes" aria-label={PRO_PLUS_CLOUD_NAME}>
          <BeltHeader kind="black" worn title={PRO_PLUS_CLOUD_NAME} blurb={PRO_PLUS_CLOUD_BELT_BLURB} />
          <GymCharacterSheet />
          {ownerIdentitySheetVisible({ page: 'pro-cloud', proUnlocked: door.proUnlocked, seated: door.seated }) ? (
            <InstructorSheet />
          ) : null}
          <PlusCloudConduct />
          <AdvantageCloudHome />
          <Link className="pro-hub" to="/white" data-pro-entry="white">
            <BeltRail kind="white" />
            <span>Advantage White</span>
          </Link>
          <Link className="pro-hub" to="/student" data-pro-entry="student">
            <BeltRail kind="blue" />
            <span>Advantage Student Edition</span>
          </Link>
          <ProToolboxCard hubs={hubs} label={`${PRO_PLUS_CLOUD_NAME} hubs`} />
          <InstructorInvitePanel />
        </nav>

        <EditionLadder page="pro-cloud" />
        <div className="home__hints">
          <InstructionsButton controlsId="pro-plus-cloud-instructions">
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
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}

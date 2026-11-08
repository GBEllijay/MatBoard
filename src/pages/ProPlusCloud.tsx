import { useEffect } from 'react';
import { AdvantageCloudHome } from '../components/AdvantageCloudHome';
import { GymCharacterSheet } from '../components/GymCharacterSheet';
import { EditionLadder } from '../components/EditionLadder';
import { BeltHeader } from '../components/BeltHeader';
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

/**
 * Advantage Pro Plus Cloud menu. Same four hubs as Advantage Pro.
 * The header stays the worn black belt: white stripe, red bar, white stripe.
 * Advantage Cloud status, upload links, and the instructor invite live under the hubs.
 */
export function ProPlusCloudPage() {
  const door = useSeatDoor();
  const hubs = consoleHubs(door, door.seat?.permissions ?? null);

  useEffect(() => {
    const previous = document.title;
    document.title = PRO_PLUS_CLOUD_NAME;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <main className="home home--pro" data-page={PRO_PLUS_CLOUD_PATH}>
      <div className="home__inner">
        <PlayExitMark to={PRODUCTS_PATH} />
        <HomeMark to={PRODUCTS_PATH} />
        <GymCharacterSheet />

        <nav className="home__modes" aria-label={PRO_PLUS_CLOUD_NAME}>
          <BeltHeader kind="black" worn title={PRO_PLUS_CLOUD_NAME} blurb={PRO_PLUS_CLOUD_BELT_BLURB} />
          <PlusCloudConduct />
          <AdvantageCloudHome />
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

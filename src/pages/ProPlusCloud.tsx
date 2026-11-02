import { useEffect } from 'react';
import { BeltHeader } from '../components/BeltHeader';
import { PlusCloudConduct } from '../components/PlusCloudConduct';
import { HomeMark } from '../components/HomeMark';
import { InstructionsButton } from '../components/InstructionsButton';
import { PlayExitMark } from '../components/PlayExitMark';
import { ProToolboxCard } from '../components/ProToolboxCard';
import { SiteFooter } from '../components/SiteFooter';
import { useSeatDoor } from '../hooks/useSeatDoor';
import {
  ADVANTAGE_CLOUD_DRIVE_NOTE,
  ADVANTAGE_CLOUD_HEADING,
  ADVANTAGE_CLOUD_STATUS,
  ADVANTAGE_CLOUD_UPLOAD_LEAD,
  ADVANTAGE_CLOUD_UPLOAD_STEPS,
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
 * The cloud block is plain text. Nothing here connects a drive or starts checkout.
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
        <PlusCloudConduct />

        <nav className="home__modes" aria-label={PRO_PLUS_CLOUD_NAME}>
          <BeltHeader kind="black" worn title={PRO_PLUS_CLOUD_NAME} blurb={PRO_PLUS_CLOUD_BELT_BLURB} />
          <ProToolboxCard hubs={hubs} label={`${PRO_PLUS_CLOUD_NAME} hubs`} />
          <section className="cloud-soon" aria-label={ADVANTAGE_CLOUD_HEADING} data-cloud-block="advantage-cloud">
            <div className="cloud-soon__row">
              <h2>{ADVANTAGE_CLOUD_HEADING}</h2>
              <p className="plan-card__kicker">{ADVANTAGE_CLOUD_STATUS}</p>
            </div>
            <h3>{ADVANTAGE_CLOUD_UPLOAD_LEAD}</h3>
            <ol>
              {ADVANTAGE_CLOUD_UPLOAD_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p>{ADVANTAGE_CLOUD_DRIVE_NOTE}</p>
          </section>
        </nav>

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
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}

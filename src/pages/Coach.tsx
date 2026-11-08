import { useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GymCoachPulse } from '../components/GymCoachPulse';
import { InstructorSheet } from '../components/InstructorSheet';
import { BeltHeader } from '../components/BeltHeader';
import { EditionLadder } from '../components/EditionLadder';
import { BeltRail } from '../components/BeltRail';
import { InviteAccept, useCurrentSeat } from '../components/SeatSessionBar';
import { HomeMark } from '../components/HomeMark';
import { FaqLink } from '../components/FaqLink';
import { InstructionsButton } from '../components/InstructionsButton';
import { SiteFooter } from '../components/SiteFooter';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { doorOpen, subscribeEntitlement } from '../lib/entitlement';
import { BASIC_COACH_BELT_LINES } from '../lib/coachCopy';
import { lockCoach } from '../lib/coachUnlock';
import { coachToolVisible, purchasePromptsHidden } from '../lib/instructorSeats';
import { INSTRUCTOR_DISPLAY_PRICE_LINE } from '../lib/productPrices';
import { COACH_HUBS, INSTRUCTOR_HOME_TITLE, PRODUCTS_PATH } from '../lib/productNames';
import { TIER_BUY_PATHS } from '../lib/tierBuyPages';

export function CoachPage() {
  const navigate = useNavigate();
  const seat = useCurrentSeat();
  // Coach door alone: a Pro token still counts there, and the Lock Coach mark closes it.
  const ownerOpen = useCoachUnlocked();
  const proOpen = useSyncExternalStore(subscribeEntitlement, () => doorOpen('pro'), () => false);
  const tools = COACH_HUBS.filter((tool) => coachToolVisible(tool.to, seat));

  return (
    <main className="home home--coach">
      <div className="home__inner">
        <HomeMark to={PRODUCTS_PATH} />

        <InviteAccept />
        {proOpen ? <InstructorSheet /> : <GymCoachPulse />}
        <nav className="home__modes" aria-label="Advantage Coach">
          <BeltHeader
            kind="blue"
            title="Advantage - Coach"
            blurb={BASIC_COACH_BELT_LINES.join('\n')}
          />
          {tools.map((tool) => (
            <Link key={tool.to} className="pro-hub" to={tool.to}>
              <BeltRail kind={tool.belt} />
              <span>{tool.title}</span>
            </Link>
          ))}
        </nav>

        <EditionLadder page="instructor" />
        <div className="home__hints">
          <InstructionsButton controlsId="coach-instructions">
            <p className="home__hint">Install Advantage as an app from your browser menu.</p>
            <p className="home__hint">
              Gym TV: open this site on a computer plugged into the TV, then fullscreen Display,
              Rounds, Daily Training Videos, or Mock Tournament. Press F for fullscreen. Daily
              Lesson Plan, Daily Training Videos, Technique Tree, Student Roster, and Mock
              Tournament stay on this phone.
            </p>
            <p className="home__hint">
              Control from your phone. Cast the scoreboard to your TV, or open Display on a second
              screen or computer.
            </p>
          </InstructionsButton>
          <FaqLink />
          {purchasePromptsHidden(seat) ? null : (
            <p className="home__soon">
              <Link className="home__text-btn" to={TIER_BUY_PATHS.instructor}>
                {`Buy ${INSTRUCTOR_HOME_TITLE} — ${INSTRUCTOR_DISPLAY_PRICE_LINE}`}
              </Link>
            </p>
          )}
          {ownerOpen ? (
            <p className="home__soon">
              Advantage Coach is on for this browser.{' '}
              <Link className="home__text-btn" to={PRODUCTS_PATH}>
                All products
              </Link>
              {' · '}
              <button
                type="button"
                className="home__text-btn"
                onClick={() => {
                  lockCoach();
                  navigate(PRODUCTS_PATH);
                }}
              >
                Lock Coach
              </button>
            </p>
          ) : null}
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}

import { Link, useNavigate } from 'react-router-dom';
import { BeltHeader } from '../components/BeltHeader';
import { BeltRail } from '../components/BeltRail';
import { InviteAccept, SeatSessionBar, useCurrentSeat } from '../components/SeatSessionBar';
import { HomeMark } from '../components/HomeMark';
import { InstructionsButton } from '../components/InstructionsButton';
import { SiteFooter } from '../components/SiteFooter';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { BASIC_COACH_BELT_LINES } from '../lib/coachCopy';
import { lockCoach } from '../lib/coachUnlock';
import { coachToolVisible } from '../lib/instructorSeats';
import { COACH_HUBS } from '../lib/productNames';

export function CoachPage() {
  const navigate = useNavigate();
  const seat = useCurrentSeat();
  const ownerOpen = useCoachUnlocked() || useProUnlocked();
  const tools = COACH_HUBS.filter((tool) => coachToolVisible(tool.to, seat));

  return (
    <main className="home home--coach">
      <div className="home__inner">
        <HomeMark to="/" />

        <InviteAccept />
        <SeatSessionBar />
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
          {ownerOpen ? (
            <p className="home__soon">
              Advantage Coach is on for this browser.{' '}
              <Link className="home__text-btn" to="/">
                All products
              </Link>
              {' · '}
              <button
                type="button"
                className="home__text-btn"
                onClick={() => {
                  lockCoach();
                  navigate('/');
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

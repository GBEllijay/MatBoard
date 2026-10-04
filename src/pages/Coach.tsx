import { Link, useNavigate } from 'react-router-dom';
import { BeltHeader } from '../components/BeltHeader';
import { CoachToolsCard } from '../components/CoachToolsCard';
import { InviteAccept, SeatSessionBar } from '../components/SeatSessionBar';
import { HomeMark } from '../components/HomeMark';
import { InstructionsButton } from '../components/InstructionsButton';
import { SiteFooter } from '../components/SiteFooter';
import { TierLine } from '../components/TierLine';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { lockCoach } from '../lib/coachUnlock';
import { COACH_TOOLS_TEASER } from '../lib/coachCopy';
import { COACHING_TOOLS_LABEL, COMPETITION_MANAGEMENT_LABEL } from '../lib/productNames';

export function CoachPage() {
  const navigate = useNavigate();
  const ownerOpen = useCoachUnlocked() || useProUnlocked();

  return (
    <main className="home home--coach">
      <div className="home__inner">
        <HomeMark to="/" tagline={<TierLine tier="Coach" detail={COACH_TOOLS_TEASER} />} />

        <InviteAccept />
        <SeatSessionBar />
        <nav className="home__modes" aria-label="Advantage Coach">
          <BeltHeader
            kind="blue"
            title="Advantage - Coach"
            blurb="Tools and Templates for Coaches and Competition Teams."
          />
          <CoachToolsCard />
        </nav>

        <div className="home__hints">
          <InstructionsButton controlsId="coach-instructions">
            <p className="home__hint">Install Advantage as an app from your browser menu.</p>
            <p className="home__hint">
              Gym TV: open this site on a computer plugged into the TV, then fullscreen Display,
              Rounds, Daily Training Videos, or Mock Tournament. Press F for fullscreen.{' '}
              {COACHING_TOOLS_LABEL} holds Daily Lesson Plan, Competition Class Curriculum, Daily
              Training Videos, and Technique Tree. {COMPETITION_MANAGEMENT_LABEL} holds Competitor Management System and Mock
              Tournament, then Scoreboard and Round Timer. Both folders live on the phone.
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

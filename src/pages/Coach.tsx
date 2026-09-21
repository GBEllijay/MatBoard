import { Link, useNavigate } from 'react-router-dom';
import { CoachToolsCard } from '../components/CoachToolsCard';
import { HomeMark } from '../components/HomeMark';
import { lockCoach } from '../lib/coachUnlock';
import { COACH_TOOLS_TEASER } from '../lib/coachCopy';

export function CoachPage() {
  const navigate = useNavigate();

  return (
    <main className="home home--coach">
      <div className="home__inner">
        <HomeMark to="/" tagline={`Coach — ${COACH_TOOLS_TEASER}`} />

        <nav className="home__modes" aria-label="Advantage Coach">
          <CoachToolsCard />
        </nav>

        <div className="home__hints">
          <p className="home__hint">Install Advantage as an app from your browser menu.</p>
          <p className="home__hint">
            Gym TV: open this site on a computer plugged into the TV, then fullscreen Display,
            Rounds, Mock Tournament, or Daily Training Videos. Press F for fullscreen. Competitor
            roster and Training notes live on the phone.
          </p>
          <p className="home__hint">
            Control from your phone. Cast the scoreboard to your TV, or open Display on a second
            screen or computer.
          </p>
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
        </div>
      </div>
    </main>
  );
}

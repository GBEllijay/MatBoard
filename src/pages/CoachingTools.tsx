import { Link, useSearchParams } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { SiteFooter } from '../components/SiteFooter';
import { TierLine } from '../components/TierLine';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { COACH_TOOLS_TEASER } from '../lib/coachCopy';
import { coachToolVisible } from '../lib/instructorSeats';
import {
  COACHING_TOOLS_DETAIL,
  COACHING_TOOLS_LABEL,
  COACHING_TOOLS_LEAD,
  UNLIMITED_LESSON_VALUE,
  coachingToolsMenu,
} from '../lib/productNames';

/**
 * Coaching Tools folder. Same card and hub buttons as Competition Team Management.
 * The subtitle names the tools inside, the way Live Bout names its contents.
 * `plan=unlimited` (Pro only) keeps Daily Lesson Plan on the Unlimited path.
 */
export function CoachingToolsPage() {
  const seat = useCurrentSeat();
  const proUnlocked = useProUnlocked();
  const [searchParams] = useSearchParams();
  const unlimitedPlan = proUnlocked && searchParams.get('plan') === UNLIMITED_LESSON_VALUE;
  const tools = coachingToolsMenu(unlimitedPlan).filter((tool) => coachToolVisible(tool.to, seat));

  return (
    <main className="home home--coach">
      <div className="home__inner">
        <HomeMark to="/coach" tagline={<TierLine tier="Coach" detail={COACH_TOOLS_TEASER} />} />

        <nav className="home__modes" aria-label={COACHING_TOOLS_LABEL}>
          <article className="mode-card mode-card--coach">
            <BeltRail kind="coach" />
            <strong>{COACHING_TOOLS_LABEL}</strong>
            <span className="mode-card__sub">{COACHING_TOOLS_DETAIL}</span>
            <span>{COACHING_TOOLS_LEAD}</span>
            <div className="pro-hubs">
              {tools.map((tool) => (
                <Link key={tool.to} className="pro-hub" to={tool.to}>
                  <BeltRail kind={tool.belt} />
                  <span>{tool.title}</span>
                </Link>
              ))}
            </div>
          </article>
        </nav>
        <SiteFooter />
      </div>
    </main>
  );
}

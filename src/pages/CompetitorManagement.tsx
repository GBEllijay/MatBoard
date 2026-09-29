import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import {
  COMPETITION_READY_CARD,
  COMPETITION_READY_LABEL,
  COMPETITOR_ROSTER_CARD,
  COMPETITOR_ROSTER_DESCRIPTION,
  COMPETITOR_ROSTER_LABEL,
  GAME_PLAN_CARD,
  GAME_PLAN_LABEL,
  RANKINGS_RESULTS_CARD,
} from '../lib/coachCopy';
import { COMPETITOR_SYSTEM_NAME } from '../lib/productNames';

const LINKS = [
  {
    to: '/roster?from=competitors',
    title: COMPETITOR_ROSTER_LABEL,
    body: COMPETITOR_ROSTER_CARD,
    belt: 'brown',
  },
  {
    to: '/competition-ready',
    title: COMPETITION_READY_LABEL,
    body: COMPETITION_READY_CARD,
    belt: 'blue',
  },
  {
    to: '/game-plan',
    title: GAME_PLAN_LABEL,
    body: GAME_PLAN_CARD,
    belt: 'purple',
  },
  {
    to: '/rankings',
    title: 'Rankings / Results',
    body: RANKINGS_RESULTS_CARD,
    belt: 'black',
  },
] as const;

export function CompetitorManagementPage() {
  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <HomeMark to="/pro" />
        <section className="suite competitor-hub">
          <h2 className="competitor-hub__title">
            <span>{COMPETITOR_SYSTEM_NAME}</span>
          </h2>
          <p>{COMPETITOR_ROSTER_DESCRIPTION}</p>
          <nav className="competitor-hub__nav" aria-label={COMPETITOR_SYSTEM_NAME}>
            {LINKS.map((link) => (
              <Link key={link.title} className="competitor-hub__link" to={link.to}>
                <BeltRail kind={link.belt} />
                <strong>{link.title}</strong>
                <span>{link.body}</span>
              </Link>
            ))}
          </nav>
          <p className="competitor-hub__note">Seeding and auto-fill from rankings are coming later.</p>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

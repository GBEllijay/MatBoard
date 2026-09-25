import { Link } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import {
  COMPETITION_READY_CARD,
  COMPETITION_READY_LABEL,
  COMPETITOR_ROSTER_CARD,
  COMPETITOR_ROSTER_DESCRIPTION,
  COMPETITOR_ROSTER_LABEL,
  RANKINGS_RESULTS_CARD,
} from '../lib/coachCopy';
import { COMPETITOR_SYSTEM_NAME } from '../lib/productNames';

const LINKS = [
  {
    to: '/roster?from=competitors',
    title: COMPETITOR_ROSTER_LABEL,
    body: COMPETITOR_ROSTER_CARD,
  },
  {
    to: '/competition-ready',
    title: COMPETITION_READY_LABEL,
    body: COMPETITION_READY_CARD,
  },
  {
    to: '/rankings',
    title: 'Rankings / Results',
    body: RANKINGS_RESULTS_CARD,
  },
] as const;

export function CompetitorManagementPage() {
  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <HomeMark to="/pro" />
        <section className="suite">
          <h2>{COMPETITOR_SYSTEM_NAME}</h2>
          <p>{COMPETITOR_ROSTER_DESCRIPTION}</p>
          <nav className="suite__nav" aria-label={COMPETITOR_SYSTEM_NAME}>
            {LINKS.map((link) => (
              <Link key={link.title} className="suite__link" to={link.to}>
                <strong>{link.title}</strong>
                <span>{link.body}</span>
              </Link>
            ))}
          </nav>
          <p className="suite__note">Seeding and auto-fill from rankings are coming later.</p>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

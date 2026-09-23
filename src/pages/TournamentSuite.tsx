import { Link } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { unlinkBracketBout } from '../lib/bracketBout';
import { TOURNAMENT_SUITE_NAME } from '../lib/productNames';

const LINKS = [
  {
    to: '/match',
    title: 'Scoreboard',
    body: 'Live Bout match timer and scoreboard.',
    clearBout: true,
  },
  {
    to: '/roster?from=suite',
    title: 'Competitor Roster',
    body: 'Names and belts for bouts, with CSV template, import, and export.',
  },
  {
    to: '/tournament?from=suite',
    title: 'Brackets',
    body: 'Saveable division brackets, up to 64 competitors on this device.',
  },
  {
    to: '/rankings',
    title: 'Rankings / Results',
    body: 'Tournament result files: name, date, division, placements, and win records.',
  },
] as const;

export function TournamentSuitePage() {
  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <HomeMark to="/pro" tagline="Pro tournament ops on this device." />
        <section className="suite">
          <h2>{TOURNAMENT_SUITE_NAME}</h2>
          <p>
            Score the mat, keep the competitor roster, run brackets, and file results. Saved on
            this device. Cloud sync comes later.
          </p>
          <nav className="suite__nav" aria-label={TOURNAMENT_SUITE_NAME}>
            {LINKS.map((link) => (
              <Link
                key={link.title}
                className="suite__link"
                to={link.to}
                onClick={'clearBout' in link && link.clearBout ? () => unlinkBracketBout() : undefined}
              >
                <strong>{link.title}</strong>
                <span>{link.body}</span>
              </Link>
            ))}
          </nav>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

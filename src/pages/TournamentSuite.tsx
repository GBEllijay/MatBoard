import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { unlinkBracketBout } from '../lib/bracketBout';
import {
  MATCH_CONTROLLER_PATH,
  ROUND_CONTROLLER_PATH,
  TOURNAMENT_SUITE_NAME,
  withSuiteFrom,
} from '../lib/productNames';

const BRACKETS = {
  to: '/tournament?from=suite',
  title: 'Brackets',
  body: 'Saveable division brackets, up to 64 competitors on this device.',
} as const;

const TOOLS = [
  {
    to: withSuiteFrom('/match', true),
    title: 'Scoreboard',
    clearBout: true,
  },
  {
    to: withSuiteFrom(MATCH_CONTROLLER_PATH, true),
    title: 'Match Controller',
    clearBout: true,
  },
  {
    to: withSuiteFrom('/training', true),
    title: 'Rounds',
  },
  {
    to: withSuiteFrom(ROUND_CONTROLLER_PATH, true),
    title: 'Round Controller',
  },
] as const;

export function TournamentSuitePage() {
  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <HomeMark to="/pro" tagline="Live event ops on this device." />
        <section className="suite">
          <h2>{TOURNAMENT_SUITE_NAME}</h2>
          <p>
            Brackets, the match scoreboard, and round timers for an in-house event. Competitor
            roster and rankings live in Competitor Management.
          </p>
          <nav className="suite__nav" aria-label={TOURNAMENT_SUITE_NAME}>
            <Link className="suite__link" to={BRACKETS.to}>
              <strong>{BRACKETS.title}</strong>
              <span>{BRACKETS.body}</span>
            </Link>
            {TOOLS.map((link) => (
              <Link
                key={link.title}
                className="pro-hub"
                to={link.to}
                onClick={'clearBout' in link && link.clearBout ? () => unlinkBracketBout() : undefined}
              >
                <BeltRail kind="tournament" />
                <span>{link.title}</span>
              </Link>
            ))}
          </nav>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

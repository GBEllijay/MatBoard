import { Link } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { unlinkBracketBout } from '../lib/bracketBout';
import {
  MATCH_CONTROLLER_PATH,
  ROUND_CONTROLLER_PATH,
  TOURNAMENT_SUITE_NAME,
} from '../lib/productNames';

const LINKS = [
  {
    to: '/tournament?from=suite',
    title: 'Brackets',
    body: 'Saveable division brackets, up to 64 competitors on this device.',
  },
  {
    to: '/match',
    title: 'Scoreboard (Match / Live Bout)',
    body: 'Live Bout match timer and scoreboard. Same screen as Advantage White.',
    clearBout: true,
  },
  {
    to: MATCH_CONTROLLER_PATH,
    title: 'Match Controller',
    body: 'Opens the White Live Bout controller at /match/control.',
    clearBout: true,
  },
  {
    to: '/training',
    title: 'Rounds',
    body: 'Round timer display. Same screen as Advantage White.',
  },
  {
    to: ROUND_CONTROLLER_PATH,
    title: 'Round Controller',
    body: 'Opens the White Rounds controller at /training/control.',
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

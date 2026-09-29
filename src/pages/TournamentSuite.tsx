import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { unlinkBracketBout } from '../lib/bracketBout';
import { COMPETITION_MANAGEMENT_PRO_LABEL, COMPETITION_PRO_MENU } from '../lib/productNames';

export function TournamentSuitePage() {
  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <HomeMark to="/pro" tagline="Live event ops on this device." />
        <section className="suite">
          <h2>{COMPETITION_MANAGEMENT_PRO_LABEL}</h2>
          <p>
            Competitor Roster, Brackets, Scoreboard, and Round Timer. Rankings stay in Competitor
            Management.
          </p>
          <nav className="suite__nav" aria-label={COMPETITION_MANAGEMENT_PRO_LABEL}>
            {COMPETITION_PRO_MENU.map((link) => (
              <Link
                key={link.title}
                className="pro-hub"
                to={link.to}
                onClick={link.clearBout ? () => unlinkBracketBout() : undefined}
              >
                {link.belt ? <BeltRail kind={link.belt} /> : null}
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

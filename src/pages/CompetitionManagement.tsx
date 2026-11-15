import { Link, useSearchParams } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { PlayExitMark } from '../components/PlayExitMark';
import { SiteFooter } from '../components/SiteFooter';
import { TierLine } from '../components/TierLine';
import { unlinkBracketBout } from '../lib/bracketBout';
import { COACH_TOOLS_TEASER } from '../lib/coachCopy';
import {
  COMPETITION_MANAGEMENT_LABEL,
  COMPETITION_MENU,
  COMPETITION_MENU_PRO,
  COACH_UNLIMITED_PATH,
  PRODUCTS_PATH,
  UNLIMITED_FROM,
} from '../lib/productNames';

export function CompetitionManagementPage() {
  const [searchParams] = useSearchParams();
  // Opened from the Instructor Edition tool card: Back returns to that list.
  const backTo = searchParams.get('from') === UNLIMITED_FROM ? COACH_UNLIMITED_PATH : '/coach';
  return (
    <main className="home home--coach">
      <div className="home__inner">
        <PlayExitMark to={backTo} />
        <HomeMark to={PRODUCTS_PATH} tagline={<TierLine tier="Instructor Edition" detail={COACH_TOOLS_TEASER} />} />

        <nav className="home__modes" aria-label={COMPETITION_MANAGEMENT_LABEL}>
          <article className="mode-card mode-card--coach">
            <BeltRail kind="coach" />
            <strong>{COMPETITION_MANAGEMENT_LABEL}</strong>
            <div className="pro-hubs">
              {COMPETITION_MENU.map((tool) => (
                <Link
                  key={tool.to}
                  className="pro-hub"
                  to={tool.to}
                  onClick={'clearBout' in tool && tool.clearBout ? () => unlinkBracketBout() : undefined}
                >
                  <BeltRail kind={tool.belt} />
                  <span>{tool.title}</span>
                </Link>
              ))}
              {/*
                Future Advantage Pro competition tools append to COMPETITION_MENU_PRO.
                Bout and bracket competitors only — not member progress tracking.
              */}
              {COMPETITION_MENU_PRO.map((tool) => (
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

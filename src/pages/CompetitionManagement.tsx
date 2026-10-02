import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { TierLine } from '../components/TierLine';
import { COACH_TOOLS_TEASER } from '../lib/coachCopy';
import {
  COMPETITION_MANAGEMENT_LABEL,
  COMPETITION_MENU,
  COMPETITION_MENU_PRO,
} from '../lib/productNames';

export function CompetitionManagementPage() {
  return (
    <main className="home home--coach">
      <div className="home__inner">
        <HomeMark to="/coach" tagline={<TierLine tier="Coach" detail={COACH_TOOLS_TEASER} />} />

        <nav className="home__modes" aria-label={COMPETITION_MANAGEMENT_LABEL}>
          <article className="mode-card mode-card--coach">
            <BeltRail kind="coach" />
            <strong>{COMPETITION_MANAGEMENT_LABEL}</strong>
            <div className="pro-hubs">
              {COMPETITION_MENU.map((tool) => (
                <Link key={tool.to} className="pro-hub" to={tool.to}>
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

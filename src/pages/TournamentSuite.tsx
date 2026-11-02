import { BeltHeader } from '../components/BeltHeader';
import { HomeMark } from '../components/HomeMark';
import { PlayExitMark } from '../components/PlayExitMark';
import { SiteFooter } from '../components/SiteFooter';
import { SuiteMenuLinks } from '../components/SuiteMenuLinks';
import {
  COMPETITION_PRO_MENU,
  PRODUCTS_PATH,
  TOURNAMENT_MANAGEMENT_PRO_LABEL,
  TOURNAMENT_MANAGEMENT_PRO_LEAD,
} from '../lib/productNames';

export function TournamentSuitePage() {
  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <PlayExitMark to="/pro" />
        <HomeMark to={PRODUCTS_PATH} tagline="Live event ops on this device." />
        <section className="suite">
          <BeltHeader
            kind="tournament"
            title={TOURNAMENT_MANAGEMENT_PRO_LABEL}
            blurb={TOURNAMENT_MANAGEMENT_PRO_LEAD}
          />
          <SuiteMenuLinks links={COMPETITION_PRO_MENU} label={TOURNAMENT_MANAGEMENT_PRO_LABEL} />
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

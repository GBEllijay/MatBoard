import { BeltHeader } from '../components/BeltHeader';
import { HomeMark } from '../components/HomeMark';
import { PlayExitMark } from '../components/PlayExitMark';
import { SiteFooter } from '../components/SiteFooter';
import { COACH_UNLIMITED_PATH, PRODUCTS_PATH } from '../lib/productNames';

/**
 * Future master student list. No roster store and no fields yet.
 * The Coach Unlimited route gate is the only door.
 */
export function StudentRosterPlaceholderPage() {
  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <PlayExitMark to={COACH_UNLIMITED_PATH} />
        <HomeMark to={PRODUCTS_PATH} />
        <section className="suite instructor-hub">
          <BeltHeader kind="brown" worn title="Student Roster" blurb="Coming soon." />
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

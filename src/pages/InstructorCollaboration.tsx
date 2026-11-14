import { Link, useSearchParams } from 'react-router-dom';
import { academyProfileHome } from '../lib/academySheetNav';
import { BeltHeader } from '../components/BeltHeader';
import { HomeMark } from '../components/HomeMark';
import { PlayExitMark } from '../components/PlayExitMark';
import { InstructorInvitePanel } from '../components/InstructorInvitePanel';
import { InviteAccept, useCurrentSeat } from '../components/SeatSessionBar';
import { SiteFooter } from '../components/SiteFooter';
import { PRODUCTS_PATH } from '../lib/productNames';

/**
 * Invite and access only. Unlimited lesson tools, Sunday review, and Drive
 * connect live on Advantage Coach Unlimited.
 */
export function InstructorCollaborationPage() {
  const seat = useCurrentSeat();
  const [params] = useSearchParams();
  const back = params.get('from') === 'academy' ? academyProfileHome(params.get('home')) : '/pro';

  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <PlayExitMark to={back} />
        <HomeMark to={PRODUCTS_PATH} />
        <section className="suite instructor-hub">
          <BeltHeader kind="black" title="Instructor Invitations and Access Management" />
          <InviteAccept />
          {seat ? (
            <p>
              This device is using that seat. The invite chooses which menus open. Cloud and sharing
              inside those menus match the owner.
            </p>
          ) : null}
          <InstructorInvitePanel />
          {seat ? (
            <Link className="btn btn--white" to="/coach">
              Open Instructor Edition
            </Link>
          ) : null}
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

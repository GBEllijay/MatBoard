import { Link } from 'react-router-dom';
import { BeltHeader } from '../components/BeltHeader';
import { HomeMark } from '../components/HomeMark';
import { InstructorInvitePanel } from '../components/InstructorInvitePanel';
import { InviteAccept, SeatSessionBar, useCurrentSeat } from '../components/SeatSessionBar';
import { SiteFooter } from '../components/SiteFooter';

/**
 * Invite and access only. Unlimited lesson tools, Sunday review, and Drive
 * connect live on Advantage Coach Unlimited.
 */
export function InstructorCollaborationPage() {
  const seat = useCurrentSeat();

  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <HomeMark to="/pro" />
        <section className="suite instructor-hub">
          <BeltHeader kind="black" title="Instructor Invitations and Access Management" />
          <InviteAccept />
          <SeatSessionBar />
          {seat ? (
            <p>This device is using that seat. Coach tools follow its permissions.</p>
          ) : null}
          <InstructorInvitePanel />
          {seat ? (
            <Link className="btn btn--white" to="/coach">
              Open Coach
            </Link>
          ) : null}
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

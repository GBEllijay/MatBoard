import { Link } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { InstructorInvitePanel } from '../components/InstructorInvitePanel';
import { InviteAccept, SeatSessionBar, useCurrentSeat } from '../components/SeatSessionBar';
import { SiteFooter } from '../components/SiteFooter';
import { INSTRUCTOR_COLLAB_NAME } from '../lib/productNames';

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
          <h2 className="instructor-hub__title">
            <span>{INSTRUCTOR_COLLAB_NAME}</span>
          </h2>
          <InviteAccept />
          <SeatSessionBar />
          {seat ? (
            <p>This device is using that seat. Coach tools follow its permissions.</p>
          ) : null}
          {seat ? (
            <Link className="btn btn--white" to="/coach">
              Open Coach
            </Link>
          ) : (
            <InstructorInvitePanel />
          )}
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { INSTRUCTOR_COLLAB_NAME } from '../lib/productNames';

const PLANS = [
  {
    title: 'Advantage Instructor console',
    body: 'Like Coach, labeled Instructor. Instructors collaborate with owners. No separate sign-in in this build.',
  },
  {
    title: 'Class photos and short videos',
    body: 'Instructors upload class photos or short videos for owner review. Approved media goes to next-day Gallery.',
  },
  {
    title: 'Share training to the instructor cloud',
    body: 'Share Lesson Plan, Daily Training Videos, Technique Trees, and Mock Tournament to the instructor cloud.',
  },
  {
    title: 'Instructor Competitor Roster',
    body: 'Instructor Competitor Roster CSV, then cloud sync with owner approval onto the gym roster.',
  },
] as const;

export function InstructorCollaborationPage() {
  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <HomeMark to="/pro" tagline="Plan only. Nothing is uploaded or synced." />
        <section className="suite">
          <h2>{INSTRUCTOR_COLLAB_NAME}</h2>
          <p>
            Coming soon. These Alpha cards describe the instructor plan. This page does not connect
            to a cloud.
          </p>
          <div className="suite__nav" aria-label={INSTRUCTOR_COLLAB_NAME}>
            {PLANS.map((plan) => (
              <article key={plan.title} className="plan-card">
                <p className="plan-card__kicker">Coming Soon · Alpha</p>
                <strong>{plan.title}</strong>
                <span>{plan.body}</span>
              </article>
            ))}
          </div>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { COACH_TOOL_LINKS } from '../components/CoachToolsCard';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { INSTRUCTOR_COACH_ENTRY, INSTRUCTOR_COLLAB_NAME } from '../lib/productNames';

export function InstructorCollaborationPage() {
  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <HomeMark to="/pro" />
        <section className="suite">
          <h2>{INSTRUCTOR_COLLAB_NAME}</h2>
          <p>
            Instructors share class plans, technique trees, and training videos with you. Each day
            they can send class photos and short clips for you to look over. Their screen works
            like Coach. You approve what plays on the gym TV and what joins the gym roster.
          </p>
          <nav className="instructor-jumps" aria-label="Advantage Coach">
            <Link className="btn btn--white instructor-jumps__entry" to="/coach">
              {INSTRUCTOR_COACH_ENTRY}
            </Link>
            <div className="instructor-jumps__tools">
              {COACH_TOOL_LINKS.map((tool) => (
                <Link key={tool.to} className="btn btn--white" to={tool.to}>
                  {'belt' in tool ? <BeltRail kind={tool.belt} /> : null}
                  {tool.title}
                </Link>
              ))}
            </div>
          </nav>
          <article className="plan-card">
            <p className="plan-card__kicker">Coming Soon · Alpha</p>
            <strong>Generate instructor invite / license</strong>
            <span>
              Send invites from your Advantage Pro to instructors to collaborate. Each person sets
              up their own login. You can later give someone, such as a program director, the full
              owner tools.
            </span>
            <button type="button" className="btn" disabled>
              Coming Soon
            </button>
          </article>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

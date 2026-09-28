import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { DriveConnectCard } from '../components/DriveConnectCard';
import { COACH_TOOL_LINKS } from '../components/CoachToolsCard';
import { HomeMark } from '../components/HomeMark';
import { InstructorInvitePanel } from '../components/InstructorInvitePanel';
import { SiteFooter } from '../components/SiteFooter';
import {
  OWNER_DRIVE_BODY,
  OWNER_DRIVE_KICKER,
  OWNER_DRIVE_QUEUE,
  OWNER_DRIVE_TITLE,
  lessonRevisionLabel,
  listLessonRevisions,
  type LessonRevision,
} from '../lib/lessonDrive';
import { INSTRUCTOR_COACH_ENTRY, INSTRUCTOR_COLLAB_NAME } from '../lib/productNames';

export function InstructorCollaborationPage() {
  const [revisions, setRevisions] = useState<LessonRevision[]>([]);
  useEffect(() => {
    setRevisions(listLessonRevisions());
  }, []);

  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <HomeMark to="/pro" />
        <section className="suite instructor-hub">
          <h2 className="instructor-hub__title">
            <BeltRail kind="black" />
            <span>{INSTRUCTOR_COLLAB_NAME}</span>
          </h2>
          <p>
            Instructors share class plans, technique trees, and training videos with you. Each day
            they can send class photos and short clips for you to look over. Their screen works
            like Coach. You approve what plays on the gym TV and what joins the gym roster.
          </p>
          <InstructorInvitePanel />
          <article className="plan-card">
            <p className="plan-card__kicker">{OWNER_DRIVE_KICKER}</p>
            <strong>{OWNER_DRIVE_TITLE}</strong>
            <span>{OWNER_DRIVE_BODY}</span>
            {revisions.length ? (
              <>
                <ul className="plan-card__revisions" aria-label="Lesson drafts waiting for Google Drive">
                  {revisions.map((revision) => (
                    <li key={revision.revisionId}>{lessonRevisionLabel(revision)}</li>
                  ))}
                </ul>
                <span>{OWNER_DRIVE_QUEUE}</span>
              </>
            ) : null}
          </article>
          <DriveConnectCard />
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
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

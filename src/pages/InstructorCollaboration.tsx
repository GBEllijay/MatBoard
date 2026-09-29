import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { DriveConnectCard } from '../components/DriveConnectCard';
import { HomeMark } from '../components/HomeMark';
import { InstructorInvitePanel } from '../components/InstructorInvitePanel';
import { InviteAccept, SeatSessionBar, useCurrentSeat } from '../components/SeatSessionBar';
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
import {
  COACH_HOME_DESCRIPTION,
  INSTRUCTOR_COACH_ENTRY,
  INSTRUCTOR_COLLAB_NAME,
} from '../lib/productNames';

export function InstructorCollaborationPage() {
  const seat = useCurrentSeat();
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
          <InviteAccept />
          <SeatSessionBar />
          {seat ? (
            <p>This device is using that seat. Coach tools follow its permissions.</p>
          ) : (
            <p>
              Instructors share class plans, technique trees, and training videos with you. Each day
              they can send class photos and short clips for you to look over. Their screen works
              like Coach. You approve what plays on the gym TV and what joins the gym roster.
            </p>
          )}
          {seat ? null : <InstructorInvitePanel />}
          {seat ? null : (
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
          )}
          {seat ? null : <DriveConnectCard />}
          <Link className="mode-card mode-card--coach instructor-coach-open" to="/coach">
            <BeltRail kind="blue" />
            <strong>{seat ? 'Open Coach' : INSTRUCTOR_COACH_ENTRY}</strong>
            <span className="mode-card__copy">
              <span>{COACH_HOME_DESCRIPTION}</span>
            </span>
          </Link>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

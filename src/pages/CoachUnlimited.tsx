import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AcademyPathwayPanel } from '../components/AcademyPathwayPanel';
import { BeltHeader } from '../components/BeltHeader';
import { BeltRail } from '../components/BeltRail';
import { DriveConnectCard } from '../components/DriveConnectCard';
import { HomeMark } from '../components/HomeMark';
import { PlayExitMark } from '../components/PlayExitMark';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { SiteFooter } from '../components/SiteFooter';
import { coachToolVisible } from '../lib/instructorSeats';
import {
  lessonRevisionLabel,
  listLessonRevisions,
  OWNER_DRIVE_BODY,
  OWNER_DRIVE_KICKER,
  OWNER_DRIVE_QUEUE,
  OWNER_DRIVE_TITLE,
  type LessonRevision,
} from '../lib/lessonDrive';
import { COACH_UNLIMITED_TOOLS, INSTRUCTOR_COACH_ENTRY } from '../lib/productNames';

/** Same pathway screen as the Pro page: link, QR, copy, and share folder. */
export function AcademyPathwayPage() {
  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <PlayExitMark to="/coach-unlimited" />
        <HomeMark to="/" />
        <section className="suite instructor-hub">
          <AcademyPathwayPanel />
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

/**
 * Advantage Pro hub that replaced Competitor Management System.
 * Unlimited lesson tools sit above the Sunday-review and Drive binders
 * that used to live under Binders on Instructor Collaboration.
 */
export function CoachUnlimitedPage() {
  const seat = useCurrentSeat();
  const [revisions, setRevisions] = useState<LessonRevision[]>([]);
  useEffect(() => {
    setRevisions(listLessonRevisions());
  }, []);

  const tools = COACH_UNLIMITED_TOOLS.filter((tool) => coachToolVisible(tool.to, seat));

  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <PlayExitMark to="/pro" />
        <HomeMark to="/" />
        <section className="suite instructor-hub">
          <BeltHeader kind="brown" worn title="Advantage - Coach Unlimited" />
          <nav className="instructor-jumps" aria-label={INSTRUCTOR_COACH_ENTRY}>
            <div className="pro-hubs">
              {tools.map((tool) => (
                <Link key={tool.to} className="pro-hub" to={tool.to}>
                  <BeltRail kind={tool.belt} stripes={'stripes' in tool ? tool.stripes : undefined} />
                  <span>{tool.title}</span>
                </Link>
              ))}
            </div>
          </nav>
          <article className="plan-card">
            <p className="plan-card__kicker">{OWNER_DRIVE_KICKER}</p>
            <strong>{OWNER_DRIVE_TITLE}</strong>
            <span>{OWNER_DRIVE_BODY}</span>
            {revisions.length ? (
              <>
                <ul className="plan-card__revisions" aria-label="Lesson drafts waiting for Google Drive">
                  {revisions.map((revision) => (
                    <li key={revision.revisionId}>
                      <Link
                        className="plan-card__review-link"
                        to={`/review?revision=${encodeURIComponent(revision.revisionId)}`}
                      >
                        {lessonRevisionLabel(revision)}
                      </Link>
                    </li>
                  ))}
                </ul>
                <span>{OWNER_DRIVE_QUEUE}</span>
              </>
            ) : null}
          </article>
          <DriveConnectCard />
          <p className="academy-menu-entry">
            <Link className="btn" to="/coach-unlimited/academy">
              Connect to my academy
            </Link>
          </p>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

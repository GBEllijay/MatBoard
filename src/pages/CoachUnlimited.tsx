import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BeltHeader } from '../components/BeltHeader';
import { BeltRail } from '../components/BeltRail';
import { DriveConnectCard } from '../components/DriveConnectCard';
import { HomeMark } from '../components/HomeMark';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { SiteFooter } from '../components/SiteFooter';
import { coachToolVisible, isLiveSeat, seatGrantsCoachMenus } from '../lib/instructorSeats';
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
        <HomeMark to="/pro" />
        <section className="suite instructor-hub">
          <BeltHeader kind="brown" title="Advantage - Coach Unlimited" />
          <nav className="instructor-jumps" aria-label={INSTRUCTOR_COACH_ENTRY}>
            <div className="pro-hubs">
              {tools.map((tool) => (
                <Link key={tool.to} className="pro-hub" to={tool.to}>
                  <BeltRail kind={tool.belt} />
                  <span>{tool.title}</span>
                </Link>
              ))}
            </div>
          </nav>
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
          {!seat || (isLiveSeat(seat) && seatGrantsCoachMenus(seat)) ? <DriveConnectCard /> : null}
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

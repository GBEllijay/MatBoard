import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AcademyPathwayPanel } from '../components/AcademyPathwayPanel';
import { EditionLadder } from '../components/EditionLadder';
import { BeltHeader } from '../components/BeltHeader';
import { BeltRail } from '../components/BeltRail';
import { DriveConnectCard } from '../components/DriveConnectCard';
import { HomeMark } from '../components/HomeMark';
import { LicenseShareButton } from '../components/LicenseShareButton';
import { PlayExitMark } from '../components/PlayExitMark';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { useSeatDoor } from '../hooks/useSeatDoor';
import { entitlementNowMs, entitlementSnapshot } from '../lib/entitlement';
import { SiteFooter } from '../components/SiteFooter';
import { unlinkBracketBout } from '../lib/bracketBout';
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
import { COACH_UNLIMITED_TOOLS, INSTRUCTOR_COACH_ENTRY, PRODUCTS_PATH, proConsoleEntryOpen } from '../lib/productNames';
import { previewEntryPath } from '../lib/techniqueTreePreview';

export { InstructorSharePage, StudentSharePage } from '../components/LicenseSharePage';

/** Same pathway screen as the Pro page: link, QR, copy, and share folder. */
export function AcademyPathwayPage() {
  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <PlayExitMark to="/coach-unlimited" />
        <HomeMark to={PRODUCTS_PATH} />
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
  const door = useSeatDoor();
  const access = entitlementSnapshot();
  const backTo = proConsoleEntryOpen(door, access.claims, entitlementNowMs(), access.amnesty) ? '/pro' : PRODUCTS_PATH;
  const [revisions, setRevisions] = useState<LessonRevision[]>([]);
  useEffect(() => {
    setRevisions(listLessonRevisions());
  }, []);

  const tools = COACH_UNLIMITED_TOOLS.filter((tool) => coachToolVisible(tool.to, seat));

  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <PlayExitMark to={backTo} />
        <HomeMark to={PRODUCTS_PATH} />
        <section className="suite instructor-hub">
          <BeltHeader kind="brown" worn title="Instructor Edition" />
          <nav className="instructor-jumps" aria-label={INSTRUCTOR_COACH_ENTRY}>
            <div className="pro-hubs">
              {tools.map((tool) => (
                <Link
                  key={tool.to}
                  className="pro-hub"
                  to={tool.to}
                  onClick={tool.clearBout ? () => unlinkBracketBout() : undefined}
                >
                  <BeltRail kind={tool.belt} stripes={'stripes' in tool ? tool.stripes : undefined} />
                  <span>{tool.title}</span>
                </Link>
              ))}
            </div>
          </nav>
          <LicenseShareButton />
          <p className="suite__note">
            <Link className="home__text-btn" to={previewEntryPath('unlimited')}>
              Preview
            </Link>
            {' — technique tree and fundamentals. Draft for owner review. Not live curriculum.'}
          </p>
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
        <EditionLadder page="instructor" />
        <SiteFooter />
      </div>
    </main>
  );
}

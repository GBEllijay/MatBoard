import { useState } from 'react';
import { useEntitlementSettled } from '../hooks/useEntitlementSettled';
import { ownerEditionTarget } from '../lib/ownerHome';
import { Link, useSearchParams } from 'react-router-dom';
import { HistoryBackMark } from '../components/HistoryBackMark';
import { AlphaAccessNote } from '../components/AlphaAccessNote';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { LearnMoreLink } from '../components/LearnMoreLink';
import { OwnerTestSheet } from '../components/OwnerTestSheet';
import { SignOutButton } from '../components/SignOutButton';
import { AccountLink } from '../components/AccountLink';
import { takeSignOutCleanupNotice } from '../lib/signOut';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { SiteFooter } from '../components/SiteFooter';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProPlusCloudUnlocked } from '../hooks/useProPlusCloud';
import { useSeatDoor } from '../hooks/useSeatDoor';
import { useStudentEditionUnlocked } from '../hooks/useStudentEditionUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import { studentDemoMode, studentEditionEntitled, studentEditionOpen, studentHomeEntryPath } from '../lib/studentEdition';
import {
  COACH_HOME_DESCRIPTION,
  COACH_UNLIMITED_PATH,
  HOME_MOTTO,
  INSTRUCTOR_DRIVE_REQUIREMENT,
  INSTRUCTOR_HOME_TITLE,
  MEDIA_HOME_DESCRIPTION,
  MEDIA_HOME_PATH,
  MEDIA_HOME_TITLE,
  PRO_DRIVE_NOTE,
  PRO_HOME_LINES,
  PRO_PLUS_CLOUD_OPEN_LABEL,
  PRO_PLUS_CLOUD_PATH,
  STUDENT_EDITION_NAME,
  STUDENT_HOME_DESCRIPTION,
  WHITE_HOME_DESCRIPTION,
  coachDoorOpen,
  homeConsoleLabel,
  coachUnlimitedDoorOpen,
  mediaEditionDoorOpen,
  proConsoleEntryOpen,
} from '../lib/productNames';
import { entitlementNowMs, entitlementSnapshot } from '../lib/entitlement';
import { purchasePromptsHidden } from '../lib/instructorSeats';
import {
  ALPHA_PRODUCT_STATUS,
  CLOUD_ADDON_LINE,
  INSTRUCTOR_DISPLAY_PRICE_LINE,
  EDITION_ALPHA_NOTE,
  EDITION_EMAIL_DISPLAY,
  MEDIA_PRICE_LINE,
  PRO_PRICE_LINE,
  STUDENT_ALPHA_ACCESS_NOTE,
  STUDENT_PRICE_LINE,
  WHITE_ALPHA_ACCESS_NOTE,
} from '../lib/productPrices';
import { WHITE_PRICE_LABEL } from '../lib/whitePurchase';
import { whiteEntryPath } from '../lib/whiteUnlock';
import { TIER_BUY_PATHS } from '../lib/tierBuyPages';

export function HomePage() {
  const door = useSeatDoor();
  const proUnlocked = door.proUnlocked;
  const consoleLabel = homeConsoleLabel(door);
  const access = entitlementSnapshot();
  const consoleOpen = proConsoleEntryOpen(door, access.claims, entitlementNowMs(), access.amnesty);
  const whiteUnlocked = useWhiteUnlocked();
  const coachUnlocked = useCoachUnlocked();
  const studentUnlocked = useStudentEditionUnlocked();
  const seat = useCurrentSeat();
  const seated = purchasePromptsHidden(seat);
  const coachOpen = coachDoorOpen(proUnlocked, coachUnlocked, seated);
  const [params] = useSearchParams();
  const studentPreview = params.get('student') === '1';
  const studentOwner = {
    pro: proUnlocked,
    coach: coachUnlocked,
    white: whiteUnlocked,
    student: studentUnlocked,
  };
  const studentOpen = studentEditionOpen(params, studentOwner);
  const studentDemo = studentDemoMode(params, studentOwner) || !studentEditionEntitled(studentOwner);
  const studentTo = studentPreview || !studentEditionEntitled(studentOwner) ? '/student?student=1' : studentHomeEntryPath(true);
  const cloudOpen = useProPlusCloudUnlocked();
  const settled = useEntitlementSettled();
  const proTo = ownerEditionTarget({
    entry: 'pro',
    settled,
    seated,
    proConsoleOpen: consoleOpen,
    cloudOpen,
  });
  const cloudTo = ownerEditionTarget({
    entry: 'pro-cloud',
    settled,
    seated,
    proConsoleOpen: consoleOpen,
    cloudOpen,
  });
  const openProHome = proTo === '/pro' && (!seated || Boolean(consoleLabel));
  const openCloudHome = cloudOpen && cloudTo === '/pro-plus-cloud';
  const instructorUnlimited = coachUnlimitedDoorOpen(door);
  const instructorOpenTo = instructorUnlimited ? COACH_UNLIMITED_PATH : '/coach';
  const instructorOpenLabel = instructorUnlimited ? 'Open Advantage Instructor Edition' : 'Open Instructor Edition';
  const [ownerTestOpen, setOwnerTestOpen] = useState(false);
  const [signOutNotice] = useState(() => takeSignOutCleanupNotice());

  return (
    <main className="home home--ladder">
      <div className="home__inner">
        {/* Top-left goes back one page (Home on a direct visit). Center logo is Home. */}
        <HistoryBackMark fallback="/" />
        <HomeMark to="/" motto={HOME_MOTTO} tagline="BJJ scoreboard, round timer, and gym tools." />

        {signOutNotice ? (
          <p className="home__hint" role="alert">
            {signOutNotice} Access on this browser is still signed out.
          </p>
        ) : null}
        <nav className="home__modes" aria-label="Products">
          {whiteUnlocked ? (
            <article className="mode-card mode-card--white">
              <Link className="mode-card__hit" to={whiteEntryPath(true)} tabIndex={-1} aria-label="Open White" />
              <BeltRail kind="white" />
              <strong>Advantage White</strong>
              <HomeDescription text={WHITE_HOME_DESCRIPTION} />
              <span className="mode-card__actions">
                <Link className="btn btn--white" to={whiteEntryPath(true)}>
                  Open White
                </Link>
              </span>
            </article>
          ) : (
            <article className="mode-card mode-card--white">
              <Link className="mode-card__hit" to={whiteEntryPath(false)} aria-label="Advantage White" />
              <BeltRail kind="white" />
              <strong>Advantage White</strong>
              <HomeDescription text={WHITE_HOME_DESCRIPTION} />
              <span className="mode-card__actions">
                <Link className="btn btn--white" to={whiteEntryPath(false)}>
                  {`Buy — ${WHITE_PRICE_LABEL}`}
                </Link>
                <LearnMoreLink tier="white" />
              </span>
              <AlphaAccessNote note={WHITE_ALPHA_ACCESS_NOTE} />
            </article>
          )}

          <StudentHomeCard open={studentOpen} demo={studentDemo} to={studentTo} />

          {/* Same rule as /media: the Media door, or a live seat that grants Media Console. A seat without that preset does not shut a Media door that is already open. */}
          <MediaHomeCard open={mediaEditionDoorOpen(door)} />

          {coachOpen ? (
            <article className="mode-card mode-card--coach">
              <Link
                className="mode-card__hit"
                to={instructorOpenTo}
                tabIndex={-1}
                aria-label={instructorOpenLabel}
              />
              <BeltRail kind="brown" />
              <strong>{INSTRUCTOR_HOME_TITLE}</strong>
              <HomeDescription text={COACH_HOME_DESCRIPTION} />
              <HomeDescription text={INSTRUCTOR_DRIVE_REQUIREMENT} />
              <div className="mode-card__actions">
                <Link className="btn btn--white" to={instructorOpenTo}>
                  {instructorOpenLabel}
                </Link>
              </div>
            </article>
          ) : (
            <article className="mode-card mode-card--coach mode-card--locked">
              <Link
                className="mode-card__hit"
                to={TIER_BUY_PATHS.instructor}
                aria-label={`${INSTRUCTOR_HOME_TITLE}, ${ALPHA_PRODUCT_STATUS}`}
              />
              <BeltRail kind="brown" />
              <strong>{INSTRUCTOR_HOME_TITLE}</strong>
              <HomeDescription text={COACH_HOME_DESCRIPTION} />
              <HomeDescription text={INSTRUCTOR_DRIVE_REQUIREMENT} />
              <p className="mode-card__price">{INSTRUCTOR_DISPLAY_PRICE_LINE}</p>
              <p className="mode-card__price">{CLOUD_ADDON_LINE}</p>
              <AlphaAccessNote note={EDITION_ALPHA_NOTE} display={EDITION_EMAIL_DISPLAY} />
              <div className="mode-card__actions">
                <LearnMoreLink tier="instructor" />
              </div>
            </article>
          )}

          {openProHome || openCloudHome ? (
            <article className="mode-card mode-card--pro">
              <Link
                className="mode-card__hit"
                to={openProHome ? '/pro' : PRO_PLUS_CLOUD_PATH}
                tabIndex={-1}
                aria-label={openProHome ? 'Open Pro Console' : PRO_PLUS_CLOUD_OPEN_LABEL}
              />
              <ProHomeCopy />
              <div className="mode-card__actions">
                {openProHome ? (
                  <Link className="btn btn--white" to="/pro">
                    Open Pro Console
                  </Link>
                ) : null}
                {openCloudHome ? (
                  <Link className="btn btn--white" to={PRO_PLUS_CLOUD_PATH}>
                    {PRO_PLUS_CLOUD_OPEN_LABEL}
                  </Link>
                ) : null}
              </div>
            </article>
          ) : (
            <article className="mode-card mode-card--pro mode-card--locked">
              <Link className="mode-card__hit" to={TIER_BUY_PATHS.pro} aria-label={`Advantage Pro, ${ALPHA_PRODUCT_STATUS}`} />
              <ProHomeCopy />
              {seated ? null : <p className="mode-card__price">{PRO_PRICE_LINE}</p>}
              <AlphaAccessNote note={EDITION_ALPHA_NOTE} display={EDITION_EMAIL_DISPLAY} />
              <div className="mode-card__actions">
                <LearnMoreLink tier="pro" />
              </div>
            </article>
          )}
        </nav>

        <div className="home__hints">
          <p className="home__hint">
            Install Advantage as an app from your browser menu for best results.
          </p>
          <p className="home__hint">
            <button type="button" className="btn btn--ghost" onClick={() => setOwnerTestOpen(true)}>
              Owner test unlock
            </button>
            {' '}
            <AccountLink />
            {' '}
            <SignOutButton />
          </p>
        </div>
        <SiteFooter />
      </div>

      <OwnerTestSheet open={ownerTestOpen} onClose={() => setOwnerTestOpen(false)} />
    </main>
  );
}

function StudentHomeCard({
  open,
  demo,
  to,
}: {
  open: boolean;
  demo: boolean;
  to: string;
}) {
  const body = (
    <>
      <BeltRail kind="blue" />
      <strong>{STUDENT_EDITION_NAME}</strong>
      <HomeDescription text={STUDENT_HOME_DESCRIPTION} />
    </>
  );
  if (open) {
    return (
      <article className="mode-card mode-card--student">
        <Link className="mode-card__hit" to={to} tabIndex={-1} aria-label="Open Advantage Student Edition" />
        {body}
        <div className="mode-card__actions">
          <Link className="btn btn--white" to={to}>
            {demo ? 'Open demo' : 'Open Student Edition'}
          </Link>
          {demo ? <LearnMoreLink tier="student" /> : null}
        </div>
      </article>
    );
  }
  return (
    <article className="mode-card mode-card--student mode-card--locked">
      <Link className="mode-card__hit" to={studentHomeEntryPath(false)} aria-label={`Advantage Student Edition, ${ALPHA_PRODUCT_STATUS}`} />
      {body}
      <p className="mode-card__price">{STUDENT_PRICE_LINE}</p>
      <div className="mode-card__actions">
        <Link className="btn btn--white" to="/student?student=1">
          Try the demo
        </Link>
        <LearnMoreLink tier="student" />
      </div>
      <AlphaAccessNote note={STUDENT_ALPHA_ACCESS_NOTE} />
    </article>
  );
}

/**
 * Advantage Media Edition on /products. Open reads mediaEditionDoorOpen, the same
 * rule as the /media route: the Media door, or a live seat that grants Media Console.
 * Locked shows the price, the alpha line, and Learn more, which opens the Media preview.
 * Unlocked shows only the Open button (no Learn more).
 * There is no Media product in Stripe, so there is no buy button.
 */
function MediaHomeCard({ open }: { open: boolean }) {
  if (open) {
    return (
      <article className="mode-card mode-card--media mode-card--feature">
        <Link className="mode-card__hit" to={MEDIA_HOME_PATH} tabIndex={-1} aria-label="Open Media Edition" />
        <BeltRail kind="purple" />
        <strong>{MEDIA_HOME_TITLE}</strong>
        <HomeDescription text={MEDIA_HOME_DESCRIPTION} />
        <div className="mode-card__actions">
          <Link className="btn btn--white" to={MEDIA_HOME_PATH}>
            Open Media Edition
          </Link>
        </div>
      </article>
    );
  }
  return (
    <article className="mode-card mode-card--media mode-card--locked">
      <Link className="mode-card__hit" to={TIER_BUY_PATHS.media} aria-label={`Advantage Media Edition, ${ALPHA_PRODUCT_STATUS}`} />
      <BeltRail kind="purple" />
      <strong>{MEDIA_HOME_TITLE}</strong>
      <HomeDescription text={MEDIA_HOME_DESCRIPTION} />
      <p className="mode-card__price">{MEDIA_PRICE_LINE}</p>
      <p className="mode-card__price">{CLOUD_ADDON_LINE}</p>
      <AlphaAccessNote note={EDITION_ALPHA_NOTE} display={EDITION_EMAIL_DISPLAY} />
      <div className="mode-card__actions">
        <LearnMoreLink tier="media" />
      </div>
    </article>
  );
}

function HomeDescription({ text }: { text: string }) {
  return (
    <span className="mode-card__copy">
      <span>{text}</span>
    </span>
  );
}

function HomeLines({ lines }: { lines: readonly string[] }) {
  return (
    <span className="mode-card__copy">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  );
}

function ProHomeCopy() {
  return (
    <>
      <BeltRail kind="black" bar="striped" />
      <strong>Advantage Pro</strong>
      <HomeLines lines={[...PRO_HOME_LINES, PRO_DRIVE_NOTE]} />
      <HomeDescription text={CLOUD_ADDON_LINE} />
    </>
  );
}


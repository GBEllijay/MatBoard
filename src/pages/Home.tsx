import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HistoryBackMark } from '../components/HistoryBackMark';
import { AlphaAccessNote } from '../components/AlphaAccessNote';
import { BeltRail } from '../components/BeltRail';
import { ComingSoonAd, ComingSoonAdActions } from '../components/ComingSoonAd';
import { HomeMark } from '../components/HomeMark';
import { OwnerTestSheet } from '../components/OwnerTestSheet';
import { ProUnlockSheet } from '../components/ProUnlockSheet';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { Sheet } from '../components/Sheet';
import { SiteFooter } from '../components/SiteFooter';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useSeatDoor } from '../hooks/useSeatDoor';
import { useStudentEditionUnlocked } from '../hooks/useStudentEditionUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import {
  COMING_SOON_ADS,
  type SoonProduct,
} from '../lib/comingSoonAds';
import { studentDemoMode, studentEditionEntitled, studentEditionOpen } from '../lib/studentEdition';
import {
  COACH_HOME_DESCRIPTION,
  HOME_MOTTO,
  INSTRUCTOR_HOME_TITLE,
  MEDIA_HOME_DESCRIPTION,
  MEDIA_HOME_PATH,
  MEDIA_HOME_TITLE,
  PRO_HOME_LINES,
  STUDENT_EDITION_NAME,
  STUDENT_HOME_DESCRIPTION,
  WHITE_HOME_DESCRIPTION,
  coachDoorOpen,
  homeConsoleLabel,
} from '../lib/productNames';
import { purchasePromptsHidden } from '../lib/instructorSeats';
import {
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

export function HomePage() {
  const door = useSeatDoor();
  const proUnlocked = door.proUnlocked;
  const consoleLabel = homeConsoleLabel(door);
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
  const studentTo = studentPreview || !studentEditionEntitled(studentOwner) ? '/student?student=1' : '/student';
  const [unlockOpen, setUnlockOpen] = useState<'coach' | 'pro' | 'student' | null>(null);
  const [ownerTestOpen, setOwnerTestOpen] = useState(false);
  const [soon, setSoon] = useState<SoonProduct | null>(null);

  const openUnlock = (product: 'coach' | 'pro' | 'student') => {
    setSoon(null);
    setUnlockOpen(product);
  };

  return (
    <main className="home home--ladder">
      <div className="home__inner">
        {/* Top-left goes back one page (Home on a direct visit). Center logo is Home. */}
        <HistoryBackMark fallback="/" />
        <HomeMark to="/" motto={HOME_MOTTO} tagline="BJJ scoreboard, round timer, and gym tools." />

        <nav className="home__modes" aria-label="Products">
          {whiteUnlocked ? (
            <Link className="mode-card mode-card--white" to={whiteEntryPath(true)}>
              <BeltRail kind="white" />
              <strong>Advantage White</strong>
              <HomeDescription text={WHITE_HOME_DESCRIPTION} />
              <span className="mode-card__actions">
                <span className="btn btn--white">Open White</span>
              </span>
            </Link>
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
              </span>
              <AlphaAccessNote note={WHITE_ALPHA_ACCESS_NOTE} />
            </article>
          )}

          <StudentHomeCard
            open={studentOpen}
            demo={studentDemo}
            to={studentTo}
            onSoon={() => setSoon('student')}
          />

          <MediaHomeCard />

          {coachOpen ? (
            <article className="mode-card mode-card--coach">
              <Link
                className="mode-card__hit"
                to="/coach"
                tabIndex={-1}
                aria-label={`Open ${INSTRUCTOR_HOME_TITLE}`}
              />
              <BeltRail kind="brown" />
              <strong>{INSTRUCTOR_HOME_TITLE}</strong>
              <HomeDescription text={COACH_HOME_DESCRIPTION} />
              <div className="mode-card__actions">
                <Link className="btn btn--white" to="/coach">
                  Open Coach
                </Link>
                <button type="button" className="btn btn--ghost mode-card__learn" onClick={() => setSoon('coach')}>
                  Learn more about Instructor Edition
                </button>
              </div>
            </article>
          ) : (
            <article className="mode-card mode-card--coach mode-card--locked">
              <button
                type="button"
                className="mode-card__hit"
                aria-haspopup="dialog"
                aria-label={`${INSTRUCTOR_HOME_TITLE}, coming soon`}
                onClick={() => setSoon('coach')}
              />
              <BeltRail kind="brown" />
              <strong>{INSTRUCTOR_HOME_TITLE}</strong>
              <HomeDescription text={COACH_HOME_DESCRIPTION} />
              <p className="mode-card__price">{INSTRUCTOR_DISPLAY_PRICE_LINE}</p>
              <AlphaAccessNote note={EDITION_ALPHA_NOTE} display={EDITION_EMAIL_DISPLAY} />
              <div className="mode-card__actions">
                <button type="button" className="btn btn--white mode-card__learn" onClick={() => setSoon('coach')}>
                  Learn more about Instructor Edition
                </button>
              </div>
            </article>
          )}

          {consoleLabel ? (
            <article className="mode-card mode-card--pro">
              <Link
                className="mode-card__hit"
                to="/pro"
                tabIndex={-1}
                aria-label={consoleLabel}
              />
              <ProHomeCopy />
              <div className="mode-card__actions">
                <Link className="btn btn--white" to="/pro">
                  {consoleLabel}
                </Link>
                <button type="button" className="btn btn--ghost mode-card__learn" onClick={() => setSoon('pro')}>
                  Learn more about Advantage Pro
                </button>
              </div>
            </article>
          ) : (
            <article className="mode-card mode-card--pro mode-card--locked">
              <button
                type="button"
                className="mode-card__hit"
                aria-haspopup="dialog"
                aria-label="Advantage Pro, coming soon"
                onClick={() => setSoon('pro')}
              />
              <ProHomeCopy />
              {seated ? null : <p className="mode-card__price">{PRO_PRICE_LINE}</p>}
              <AlphaAccessNote note={EDITION_ALPHA_NOTE} display={EDITION_EMAIL_DISPLAY} />
              <div className="mode-card__actions">
                <button type="button" className="btn btn--white mode-card__learn" onClick={() => setSoon('pro')}>
                  Learn more about Advantage Pro
                </button>
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
          </p>
        </div>
        <SiteFooter />
      </div>

      <Sheet
        className="sheet--ad"
        open={soon !== null}
        title={soon ? COMING_SOON_ADS[soon].title : 'Coming soon'}
        onClose={() => setSoon(null)}
        footer={
          soon ? (
            <ComingSoonAdActions
              product={soon}
              onDismiss={() => setSoon(null)}
              extraAction={
                soon === 'coach' || soon === 'pro' || soon === 'student'
                  ? {
                      label: 'Owner unlock',
                      onClick: () => openUnlock(soon),
                    }
                  : undefined
              }
            />
          ) : null
        }
      >
        {soon ? <ComingSoonAd product={soon} /> : null}
      </Sheet>
      <ProUnlockSheet
        product={unlockOpen ?? 'pro'}
        open={unlockOpen !== null}
        onClose={() => setUnlockOpen(null)}
      />
      <OwnerTestSheet open={ownerTestOpen} onClose={() => setOwnerTestOpen(false)} />
    </main>
  );
}

function StudentHomeCard({
  open,
  demo,
  to,
  onSoon,
}: {
  open: boolean;
  demo: boolean;
  to: string;
  onSoon: () => void;
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
        </div>
      </article>
    );
  }
  return (
    <article className="mode-card mode-card--student mode-card--locked">
      <button
        type="button"
        className="mode-card__hit"
        aria-haspopup="dialog"
        aria-label="Advantage Student Edition, coming soon"
        onClick={onSoon}
      />
      {body}
      <p className="mode-card__price">{STUDENT_PRICE_LINE}</p>
      <div className="mode-card__actions">
        <Link className="btn btn--white" to="/student?student=1">
          Try the demo
        </Link>
      </div>
      <AlphaAccessNote note={STUDENT_ALPHA_ACCESS_NOTE} />
    </article>
  );
}

/**
 * Display-only Media tier. No product, code kind, or entitlement exists yet, so it keeps the
 * locked look. The whole card (keyboard-focusable) opens the Media Edition page (draft PR #330).
 */
function MediaHomeCard() {
  return (
    <article className="mode-card mode-card--media mode-card--locked mode-card--feature">
      <Link className="mode-card__hit" to={MEDIA_HOME_PATH} aria-label={`${MEDIA_HOME_TITLE}, open the Media page`} />
      <BeltRail kind="purple" />
      <strong>{MEDIA_HOME_TITLE}</strong>
      <HomeDescription text={MEDIA_HOME_DESCRIPTION} />
      <p className="mode-card__price">{MEDIA_PRICE_LINE}</p>
      <AlphaAccessNote note={EDITION_ALPHA_NOTE} display={EDITION_EMAIL_DISPLAY} />
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
      <BeltRail kind="black" />
      <strong>Advantage Pro</strong>
      <HomeLines lines={PRO_HOME_LINES} />
    </>
  );
}

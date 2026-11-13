import { CAMERA_HREF, CAMERA_PATH, cameraWindowOpen } from './lib/pdCamera';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { InviteHandoffAccept } from './components/InviteHandoffAccept';
import { OneDriveConnectResume } from './components/OneDriveConnectResume';
import { SeatSessionChrome, useCurrentSeat } from './components/SeatSessionBar';
import { useCoachUnlocked } from './hooks/useCoachUnlocked';
import { useKeepFocusedFieldVisible } from './hooks/useKeepFocusedFieldVisible';
import { useProUnlocked } from './hooks/useProUnlocked';
import { useMediaUnlocked } from './hooks/useMediaUnlocked';
import { useSeatDoor } from './hooks/useSeatDoor';
import { useStudentEditionUnlocked } from './hooks/useStudentEditionUnlocked';
import { useProPlusCloudUnlocked } from './hooks/useProPlusCloud';
import { useWhiteUnlocked } from './hooks/useWhiteUnlocked';
import { consumeCoachUnlockQueryNow } from './lib/coachUnlock';
import {
  acceptInstructorInvite,
  currentNavigationType,
  inviteReloadBlocked,
  menuCloudSharing,
  peekInstructorInvite,
  seatMenuAllowed,
  stripInviteFromAddress,
} from './lib/instructorSeats';
import {
  MEDIA_CONSOLE_ROUTES,
  MEDIA_FOLDER_ROUTES,
  PRODUCTS_PATH,
  closedDoorPath,
  coachDoorOpen,
  coachUnlimitedDoorOpen,
  mediaConsoleDoorOpen,
  mediaEditionDoorOpen,
  mediaFolderDoorOpen,
  ownerProHubOpen,
  proDoorOpen,
  visibleProHubs,
  type MediaFolderId,
} from './lib/productNames';
import { proPurchaseReturn } from './lib/proEntitlement';
import { studentEditionEntitled, studentPurchaseReturn } from './lib/studentEdition';
import { consumeUnlockQueryNow } from './lib/proUnlock';
import { captureHalfOffQuery, consumeHalfOffQueryNow } from './lib/halfOff';
import { preservesAppHomeQuery } from './lib/submenuNav';
import { WHITE_BUY_PATH } from './lib/whitePurchase';
import { whiteHubAllowed, whiteLiveToolsAllowed } from './lib/whiteUnlock';
import { StudentEditionPage } from './pages/StudentEdition';
import { StudentJoinPage } from './pages/student/StudentLicenseClaim';
import { IndexCardProvider } from './indexCards/IndexCardHost';
import { Journal2036Page } from './preview/journal2036/Journal2036Page';
import { AssessmentRadarPreviewPage } from './preview/assessmentRadar/AssessmentRadarPreview';
import { AssessmentSpherePreview } from './preview/assessmentSphere/AssessmentSpherePreview';
import { TERM_CARD_PATH, TermCardPreviewPage } from './preview/termCard/TermCardPreview';
import { INDEX_CARD_PATH, IndexCardPreviewPage } from './preview/indexCard/IndexCardPreview';
import { CRYSTAL_PREVIEW_PATH, CrystallineSweepsPreview } from './preview/crystallineSweeps/CrystallineSweepsPreview';
import { D8_SUBFACTORS_PATH, D8SubfactorsPreview } from './preview/d8Subfactors/D8SubfactorsPreview';
import { D8_GRID_PREVIEW_PATH, D8GridPreview } from './indexCards/D8GridPreview';
import { InstructorProfilePreviewPage } from './preview/instructorProfile/InstructorProfilePreview';
import { InstructorSheetPreviewPage } from './preview/instructorSheet/InstructorSheetPreview';
import { ConnectCoachPreviewPage } from './preview/proHome/ConnectCoachPreview';
import { InstructorCardsPreviewPage } from './preview/proHome/InstructorCardsPreview';
import { ProHomePreviewPage } from './preview/proHome/ProHomePreview';
import { MediaMenuPreviewPage } from './preview/proHome/MediaMenuPreview';
import { WhiteHubPreviewPage } from './preview/proHome/WhiteHubPreview';
import { AncestryAcademyPreview, AncestryInstructorPreview, AncestryStudentPreview } from './preview/ancestryScope/AncestryScopePreview';
import { AcademyFullPage, InstructorFullPage, ProfileHubPage, StudentFullPage } from './preview/ancestryScope/ProfilePages';
import { Future2036Page } from './preview/ancestryScope/Future2036';
import { StudentAncestryPreview } from './preview/studentRecord/StudentAncestryPreview';
import { StudentHoursPreview } from './preview/studentRecord/StudentHoursPreview';
import { CoachPage } from './pages/Coach';
import { CoachingToolsPage } from './pages/CoachingTools';
import { CompetitionCurriculumPage } from './pages/CompetitionCurriculum';
import { HalfOffPage } from './pages/HalfOff';
import { ComingSoonPage } from './pages/ComingSoon';
import { CompetitionManagementPage } from './pages/CompetitionManagement';
import { CompetitionReadyPage } from './pages/CompetitionReady';
import { CompetitorManagementPage } from './pages/CompetitorManagement';
import { GamePlanPage } from './pages/GamePlan';
import { HomePage } from './pages/Home';
import { ProPlusCloudPage } from './pages/ProPlusCloud';
import { StorefrontPage } from './pages/Storefront';
import { FaqPage } from './pages/Faq';
import { CompactLineageCard, ExpandedLineageLine } from './preview/ownerLineage/OwnerLineageViews';
import { PrivacyPage } from './pages/Privacy';
import { InstructorCollaborationPage } from './pages/InstructorCollaboration';
import { MatchControllerPage } from './pages/MatchController';
import { MatchDisplayPage } from './pages/MatchDisplay';
import { RosterPage } from './pages/Roster';
import {
  PaidAcademyPathwayPage,
  PaidInstructorSharePage,
  PaidStudentSharePage,
  PaidClassHistoryPage,
  PaidCoachUnlimitedPage,
  PaidProPage,
  PaidReviewInboxPage,
  PaidSchedulePage,
  PaidScreensaverPage,
} from './components/PaidScreen';
import { TechniqueTreePage } from './pages/TechniqueTree';
import { PersonalGraphPreviewPage } from './pages/PersonalGraphPreview';
import { TechniqueTreePreviewPage } from './pages/TechniqueTreePreview';
import { TechniqueCloudPreview } from './preview/techniqueCloud/TechniqueCloudPreview';
import { VideoLibraryPreview } from './preview/techniqueCloud/VideoLibraryPreview';
import { TechniquesPage } from './pages/Techniques';
import { TermsPage } from './pages/Terms';
import { RankingsPage } from './pages/Rankings';
import { TournamentPage } from './pages/Tournament';
import { TournamentSuitePage } from './pages/TournamentSuite';
import { RecordForReviewPage } from './pages/RecordForReview';
import { TrainingNotesPage } from './pages/TrainingNotes';
import { TrainingControllerPage } from './pages/TrainingController';
import { TrainingPage } from './pages/Training';
import { LegacyAccessNotice } from './components/LegacyAccessNotice';
import { PaymentGraceBanner } from './components/PaymentGraceBanner';
import { bootEntitlement, entitlementNowMs, entitlementReady, entitlementSnapshot, proAccessPaused, subscribeEntitlement } from './lib/entitlement';
import { paidChunkMenuAgrees, type PaidChunkId } from './lib/paidChunkAccess';
import { proPlusCloudStripePro } from './lib/proPlusCloud';
import { acceptSignedSeat } from './lib/seatClient';
import { isSignedSeatInvite } from './lib/seatSunset';
import { ProLockedPage } from './pages/ProLocked';
import { BuyCoachPage, BuyMediaPage, BuyProPage, BuyStudentPage } from './pages/BuyTier';
import { BuyWhitePage } from './pages/BuyWhite';
import { BuyInstructorEditionPage, BuyProEditionPage, BuyStudentEditionPage } from './pages/BuyEdition';
import { MediaEditionPage } from './pages/MediaEdition';
import { ProPlusCloudInfoPage } from './pages/ProPlusCloudInfo';
import { MediaEditionGate } from './components/MediaEditionGate';
import { GuardRedirect } from './components/GuardRedirect';
import { MEDIA_EDITION_OLD_PATH, MEDIA_EDITION_PATH } from './lib/mediaEdition';
import { RestoreAccessPage } from './pages/RestoreAccess';
import { WhitePage } from './pages/White';
import { WhiteRosterPage } from './pages/WhiteRoster';

consumeUnlockQueryNow();
consumeCoachUnlockQueryNow();
consumeHalfOffQueryNow();
bootEntitlement();

/**
 * Full page loads read the invite before the router paints a locked route.
 * A live token accepts the seat and replaces the address with home.
 * The owner code is never added to that address.
 */
function closedOrPaused(seated: boolean): string {
  if (proAccessPaused()) return '/pro/paused';
  return closedDoorPath(seated);
}

function consumeInviteDoorNow(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite');
  if (token && isSignedSeatInvite(token)) {
    void acceptSignedSeat(token).then((ok) => {
      if (!ok) return;
      const url = new URL(window.location.href);
      url.pathname = PRODUCTS_PATH;
      url.search = '';
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.hash}`);
    });
    return;
  }
  if (!token || peekInstructorInvite(token) !== 'open') return;
  if (inviteReloadBlocked(token, currentNavigationType(), token)) {
    stripInviteFromAddress();
    return;
  }
  if (!acceptInstructorInvite(token).ok) return;
  const url = new URL(window.location.href);
  url.pathname = PRODUCTS_PATH;
  url.search = '';
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.hash}`);
}

consumeInviteDoorNow();

/**
 * The route may render a paid screen only when the menu door is open AND the
 * signed token would be granted that chunk. A refused token goes home instead
 * of the "could not be loaded" screen. No token during amnesty still reaches
 * the confirm screen; the import is not sent.
 */
function paidDoorAgrees(chunk: PaidChunkId, doorOpen: boolean): boolean {
  const snap = entitlementSnapshot();
  return paidChunkMenuAgrees({
    claims: snap.claims,
    chunk,
    nowMs: entitlementNowMs(),
    doorOpen,
    amnesty: snap.amnesty,
  });
}

/**
 * Advantage Pro Plus Cloud. The same check as the /products card.
 * A closed visit never paints this page. Stripe Pro goes to /pro.
 * Everyone else uses the existing closed-door redirect.
 */
function ProPlusCloudRoute() {
  const open = useProPlusCloudUnlocked();
  const ready = useSyncExternalStore(subscribeEntitlement, entitlementReady, () => false);
  const door = useSeatDoor();
  if (open) return <ProPlusCloudPage />;
  if (!ready) return null;
  if (proPlusCloudStripePro(entitlementSnapshot().claims)) return <Navigate to="/pro" replace />;
  return <Navigate to={closedOrPaused(door.seated)} replace />;
}

/** Full Pro hubs a seat is allowed to see. Owner-only hubs stay out. */
function ProConsoleRoute({ children }: { children: ReactNode }) {
  const door = useSeatDoor();
  if (!paidDoorAgrees('pro-console', visibleProHubs(door).length > 0)) {
    return <GuardRedirect to={closedOrPaused(door.seated)} />;
  }
  return children;
}

/** Gallery, Events, and Pro Shop. Program Director opens this with Pro locked. */
function MediaConsoleRoute({ children }: { children: ReactNode }) {
  const door = useSeatDoor();
  if (!paidDoorAgrees('media-console', mediaConsoleDoorOpen(door))) {
    return <GuardRedirect to={closedOrPaused(door.seated)} />;
  }
  return children;
}

/**
 * /media, the one Media Edition hub. A browser whose Media door is open (a Media
 * pass, Instructor, Pro, or owner) or whose live seat grants Media Console, and
 * whose token can download the chunk, gets the paid hub menu. Everyone else sees
 * the public $29.99 marketing page, never the paid chunk and never a raw 401.
 * MediaEditionGate checks a saved pass first, so a refresh does not flash the marketing page.
 * The /products Media card uses the same mediaEditionDoorOpen rule.
 */
function MediaEditionRoute() {
  const door = useSeatDoor();
  return <MediaEditionGate open={paidDoorAgrees('media-console', mediaEditionDoorOpen(door))} />;
}

/** Tournament suite and invite admin. A signed-in seat does not open these. */
function OwnerProRoute({ children }: { children: ReactNode }) {
  const door = useSeatDoor();
  if (!ownerProHubOpen(door.proUnlocked, door.seated)) return <GuardRedirect to={closedOrPaused(door.seated)} />;
  return children;
}

/** Coach Unlimited hub. A seat needs Pro on and a lesson or videos menu. */
function CoachUnlimitedRoute({ children }: { children: ReactNode }) {
  const door = useSeatDoor();
  if (!paidDoorAgrees('coach-unlimited', coachUnlimitedDoorOpen(door))) {
    return <GuardRedirect to={closedOrPaused(door.seated)} />;
  }
  return children;
}

/**
 * Class history reads the gym Drive folder.
 * Owner Pro unlock opens it. A seat opens it from an authorized lesson menu,
 * with the same cloud path, even when Pro is locked.
 */
function LessonCloudRoute({ children }: { children: ReactNode }) {
  const door = useSeatDoor();
  const open = menuCloudSharing(
    door.proUnlocked,
    door.seat,
    seatMenuAllowed(door.seat, 'dailyLessonPlanAccess'),
  );
  if (!paidDoorAgrees('lesson-cloud', open)) return <GuardRedirect to={closedOrPaused(door.seated)} />;
  return children;
}

/**
 * Buy Pro stays on the owner unlock and a Program Director seat.
 * Stripe's success return still renders so the webhook can unlock this device.
 */
function BuyProRoute({ children }: { children: ReactNode }) {
  const door = useSeatDoor();
  const [params] = useSearchParams();
  if (!door.proUnlocked && !door.programDirectorSeat && !proPurchaseReturn(params)) {
    return <GuardRedirect to={closedOrPaused(door.seated)} />;
  }
  return children;
}

/**
 * Buy Student Edition stays behind a real Student Edition or Pro grant.
 * Demo mode does not open checkout. A Stripe return still renders so the
 * server can confirm the session. The return URL does not unlock by itself.
 */
function BuyStudentRoute({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const seated = useCurrentSeat() !== null;
  const open = studentEditionEntitled({
    pro: useProUnlocked(),
    coach: useCoachUnlocked(),
    white: useWhiteUnlocked(),
    student: useStudentEditionUnlocked(),
  });
  if (!open && !studentPurchaseReturn(params)) {
    return <GuardRedirect to={closedOrPaused(seated)} />;
  }
  return children;
}

/** Advantage White hub and roster. A confirmed purchase or a server code opens them. */
function WhiteHubRoute({ children }: { children: ReactNode }) {
  const unlocked = useWhiteUnlocked();
  if (!whiteHubAllowed(unlocked)) return <GuardRedirect to={WHITE_BUY_PATH} />;
  return children;
}

/**
 * Scoreboard and round timer. White buyers use them from /white.
 * Coach and Pro keep the same screens through their existing doors.
 */
function WhiteLiveRoute({ children }: { children: ReactNode }) {
  const whiteUnlocked = useWhiteUnlocked();
  const pro = useProUnlocked();
  const coach = useCoachUnlocked();
  const seated = useCurrentSeat() !== null;
  const coachDoor = coachDoorOpen(pro, coach, seated);
  if (!whiteLiveToolsAllowed({ whiteUnlocked, coachDoor, proDoor: proDoorOpen(pro) })) {
    return <GuardRedirect to={WHITE_BUY_PATH} />;
  }
  return children;
}

/** Gallery, Events, or Pro Shop. A closed seat goes home. An unseated visitor sees Coming soon. */
/** Program director Camera window: a bookmarkable /camera that opens the Media Console camera view. */
function CameraRoute() {
  const door = useSeatDoor();
  if (!paidDoorAgrees('media-console', mediaConsoleDoorOpen(door) && cameraWindowOpen(door.seat ?? null))) {
    return <GuardRedirect to={closedOrPaused(door.seated)} />;
  }
  return <Navigate to={CAMERA_HREF} replace />;
}

function MediaFolderRoute({ folder }: { folder: MediaFolderId }) {
  const door = useSeatDoor();
  const open = mediaFolderDoorOpen(door, door.seat?.permissions ?? null, folder);
  if (!paidDoorAgrees('media-console', open)) {
    return <GuardRedirect to={closedOrPaused(door.seated)} />;
  }
  return <Navigate to={`/slideshow?folder=${folder}`} replace />;
}

/**
 * `/console` and `/media-console` open the same seat console as home. `/media` is Media Edition.
 * A Media Edition browser without Pro goes to the one Media hub at /media, never /pro (the Pro Console).
 */
function MediaConsoleEntryRoute() {
  const door = useSeatDoor();
  if (!paidDoorAgrees('media-console', mediaConsoleDoorOpen(door))) {
    return <GuardRedirect to={closedOrPaused(door.seated)} />;
  }
  if (!door.seated && !door.proUnlocked) return <Navigate to={MEDIA_EDITION_PATH} replace />;
  if (!paidDoorAgrees('pro-console', true)) return <Navigate to={MEDIA_EDITION_PATH} replace />;
  return <Navigate to="/pro" replace />;
}

/** Media checkout, gated like Student: an open Media (or Pro) door, or a Stripe return to confirm. */
function BuyMediaRoute({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const seated = useCurrentSeat() !== null;
  const media = useMediaUnlocked();
  const pro = useProUnlocked();
  const open = media || pro;
  if (!open && !studentPurchaseReturn(params)) {
    return <GuardRedirect to={closedOrPaused(seated)} />;
  }
  return children;
}

function CoachRoute({ children }: { children: ReactNode }) {
  const coach = useCoachUnlocked();
  const pro = useProUnlocked();
  const seated = useCurrentSeat() !== null;
  if (!coachDoorOpen(pro, coach, seated)) return <GuardRedirect to={closedOrPaused(seated)} />;
  return children;
}

/**
 * A live invite is its own door. Accept it before a Pro route can bounce the
 * link to the owner purchase lock, then land on home. The owner code stays out
 * of the link. A bad token does not open the door.
 */
function InviteDoor({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('invite');
  const signedInvite = Boolean(token && isSignedSeatInvite(token));
  const peek = token && !signedInvite ? peekInstructorInvite(token) : null;
  const open = peek === 'open';

  useEffect(() => {
    if (!token || !open) return;
    const result = acceptInstructorInvite(token);
    if (result.ok) {
      navigate(PRODUCTS_PATH, { replace: true });
      return;
    }
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('invite');
        return next;
      },
      { replace: true },
    );
  }, [token, open, navigate, setSearchParams]);

  useEffect(() => {
    if (!token || !signedInvite) return;
    void acceptSignedSeat(token).then((ok) => {
      if (ok) navigate(PRODUCTS_PATH, { replace: true });
    });
  }, [token, signedInvite, navigate]);

  if (signedInvite) return null;
  if (token && peek === 'missing') return <InviteHandoffAccept token={token} />;
  if (open) return null;
  return children;
}

/** Owner-code and `?student=1` links keep the edition picker. A bare `/` is the storefront. */
function PublicHomeRoute() {
  const [params] = useSearchParams();
  if (preservesAppHomeQuery(params)) {
    const search = params.toString();
    return <Navigate to={search ? `${PRODUCTS_PATH}?${search}` : PRODUCTS_PATH} replace />;
  }
  return <StorefrontPage />;
}

function EditionsRedirect() {
  const [params] = useSearchParams();
  const search = params.toString();
  return <Navigate to={search ? `${PRODUCTS_PATH}?${search}` : PRODUCTS_PATH} replace />;
}

export default function App() {
  useKeepFocusedFieldVisible();
  useProUnlocked();
  useCoachUnlocked();
  const [halfOffParams] = useSearchParams();
  useEffect(() => {
    captureHalfOffQuery(halfOffParams);
  }, [halfOffParams]);

  return (
    <IndexCardProvider>
    <SeatSessionChrome />
    <LegacyAccessNotice />
    <PaymentGraceBanner />
    <InviteDoor>
    <Routes>
      <Route path="/" element={<PublicHomeRoute />} />
      <Route path="/products" element={<HomePage />} />
      <Route path="/pro-plus-cloud" element={<ProPlusCloudRoute />} />
      <Route path="/editions" element={<EditionsRedirect />} />
      <Route
        path="/white"
        element={
          <WhiteHubRoute>
            <WhitePage />
          </WhiteHubRoute>
        }
      />
      <Route path="/buy" element={<BuyWhitePage />} />
      <Route path={MEDIA_EDITION_PATH} element={<MediaEditionRoute />} />
      <Route path={MEDIA_EDITION_OLD_PATH} element={<Navigate to={MEDIA_EDITION_PATH} replace />} />
      <Route path="/restore" element={<RestoreAccessPage />} />
      <Route path="/join/student" element={<StudentJoinPage />} />
      {/* Public tier buy pages (display + alpha line). The gated /buy/student, /buy/coach and /buy/pro checkouts are unchanged. */}
      <Route path="/editions/student" element={<BuyStudentEditionPage />} />
      <Route path="/editions/instructor" element={<BuyInstructorEditionPage />} />
      <Route path="/editions/pro" element={<BuyProEditionPage />} />
      <Route path="/editions/media" element={<MediaEditionPage />} />
      <Route path="/editions/pro-cloud" element={<ProPlusCloudInfoPage />} />
      <Route path="/editions/white" element={<Navigate to="/buy" replace />} />
      <Route path="/pro/paused" element={<ProLockedPage />} />
      <Route
        path="/buy/student"
        element={
          <BuyStudentRoute>
            <BuyStudentPage />
          </BuyStudentRoute>
        }
      />
      <Route
        path="/buy/coach"
        element={
          <CoachRoute>
            <BuyCoachPage />
          </CoachRoute>
        }
      />
      <Route
        path="/buy/media"
        element={
          <BuyMediaRoute>
            <BuyMediaPage />
          </BuyMediaRoute>
        }
      />
      <Route
        path="/buy/pro"
        element={
          <BuyProRoute>
            <BuyProPage />
          </BuyProRoute>
        }
      />
      <Route
        path="/white/roster"
        element={
          <WhiteHubRoute>
            <WhiteRosterPage />
          </WhiteHubRoute>
        }
      />
      <Route path="/lite" element={<Navigate to="/white" replace />} />
      <Route
        path="/match"
        element={
          <WhiteLiveRoute>
            <MatchDisplayPage />
          </WhiteLiveRoute>
        }
      />
      <Route
        path="/match/control"
        element={
          <WhiteLiveRoute>
            <MatchControllerPage />
          </WhiteLiveRoute>
        }
      />
      <Route
        path="/training"
        element={
          <WhiteLiveRoute>
            <TrainingPage />
          </WhiteLiveRoute>
        }
      />
      <Route
        path="/training/control"
        element={
          <WhiteLiveRoute>
            <TrainingControllerPage />
          </WhiteLiveRoute>
        }
      />
      <Route
        path="/coach"
        element={
          <CoachRoute>
            <CoachPage />
          </CoachRoute>
        }
      />
      <Route
        path="/pro"
        element={
          <ProConsoleRoute>
            <PaidProPage />
          </ProConsoleRoute>
        }
      />
      <Route
        path="/coaching-tools"
        element={
          <CoachRoute>
            <CoachingToolsPage />
          </CoachRoute>
        }
      />
      <Route
        path="/competition"
        element={
          <CoachRoute>
            <CompetitionManagementPage />
          </CoachRoute>
        }
      />
      <Route
        path="/tournament"
        element={
          <CoachRoute>
            <TournamentPage />
          </CoachRoute>
        }
      />
      <Route
        path="/suite"
        element={
          <OwnerProRoute>
            <TournamentSuitePage />
          </OwnerProRoute>
        }
      />
      <Route
        path="/coach-unlimited"
        element={
          <CoachUnlimitedRoute>
            <PaidCoachUnlimitedPage />
          </CoachUnlimitedRoute>
        }
      />
      <Route
        path="/student-roster"
        element={
          <CoachUnlimitedRoute>
            <RosterPage />
          </CoachUnlimitedRoute>
        }
      />
      <Route
        path="/coach-unlimited/academy"
        element={
          <CoachUnlimitedRoute>
            <PaidAcademyPathwayPage />
          </CoachUnlimitedRoute>
        }
      />
      <Route
        path="/coach-unlimited/share/instructor"
        element={
          <CoachUnlimitedRoute>
            <PaidInstructorSharePage />
          </CoachUnlimitedRoute>
        }
      />
      <Route
        path="/coach-unlimited/share/student"
        element={
          <CoachUnlimitedRoute>
            <PaidStudentSharePage />
          </CoachUnlimitedRoute>
        }
      />
      <Route
        path="/review"
        element={
          <CoachUnlimitedRoute>
            <PaidReviewInboxPage />
          </CoachUnlimitedRoute>
        }
      />
      <Route
        path="/competitors"
        element={
          <CoachRoute>
            <CompetitorManagementPage />
          </CoachRoute>
        }
      />
      <Route
        path="/instructors"
        element={
          <OwnerProRoute>
            <InstructorCollaborationPage />
          </OwnerProRoute>
        }
      />
      <Route
        path="/class-history"
        element={
          <LessonCloudRoute>
            <PaidClassHistoryPage />
          </LessonCloudRoute>
        }
      />
      <Route
        path="/rankings"
        element={
          <CoachRoute>
            <RankingsPage />
          </CoachRoute>
        }
      />
      <Route
        path="/competition-ready"
        element={
          <CoachRoute>
            <CompetitionReadyPage />
          </CoachRoute>
        }
      />
      <Route
        path="/game-plan"
        element={
          <CoachRoute>
            <GamePlanPage />
          </CoachRoute>
        }
      />
      <Route
        path="/techniques"
        element={
          <CoachRoute>
            <TechniquesPage />
          </CoachRoute>
        }
      />
      <Route
        path="/technique-tree"
        element={
          <CoachRoute>
            <TechniqueTreePage />
          </CoachRoute>
        }
      />
      <Route
        path="/notes"
        element={
          <CoachRoute>
            <TrainingNotesPage />
          </CoachRoute>
        }
      />
      <Route
        path="/record-for-review"
        element={
          <CoachRoute>
            <RecordForReviewPage />
          </CoachRoute>
        }
      />
      <Route
        path="/competition-curriculum"
        element={
          <CoachRoute>
            <CompetitionCurriculumPage />
          </CoachRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <MediaConsoleRoute>
            <PaidSchedulePage />
          </MediaConsoleRoute>
        }
      />
      <Route
        path="/roster"
        element={
          <CoachRoute>
            <RosterPage />
          </CoachRoute>
        }
      />
      <Route path={CAMERA_PATH} element={<CameraRoute />} />
      <Route
        path="/slideshow"
        element={
          <MediaConsoleRoute>
            <PaidScreensaverPage />
          </MediaConsoleRoute>
        }
      />
      {MEDIA_FOLDER_ROUTES.map((route) => (
        <Route key={route.path} path={route.path} element={<MediaFolderRoute folder={route.folder} />} />
      ))}
      {MEDIA_CONSOLE_ROUTES.map((path) => (
        <Route key={path} path={path} element={<MediaConsoleEntryRoute />} />
      ))}
      <Route
        path="/screensaver"
        element={
          <MediaConsoleRoute>
            <PaidScreensaverPage />
          </MediaConsoleRoute>
        }
      />
      <Route path="/preview/journal-2036" element={<Journal2036Page />} />
      {/* Owner previews. Direct links only. They do not write a student record. */}
      <Route path="/preview/assessment-radar" element={<AssessmentRadarPreviewPage />} />
      <Route path="/preview/assessment-sphere" element={<AssessmentSpherePreview />} />
      {/* Isolated indexed-term card. Direct link only. It does not write a journal, a rating, or a D8 score. */}
      <Route path={TERM_CARD_PATH} element={<TermCardPreviewPage />} />
      {/* Isolated index card. Direct link only. Sample data stays in memory. It does not write a journal, a rating, or a D8 score. */}
      <Route path={INDEX_CARD_PATH} element={<IndexCardPreviewPage />} />
      {/* Isolated Sweeps crystal proof. Direct link only. It does not write a record. */}
      <Route path={CRYSTAL_PREVIEW_PATH} element={<CrystallineSweepsPreview />} />
      {/* Isolated sub-factor diamond. Direct link only. It does not write a check-in. */}
      <Route path={D8_SUBFACTORS_PATH} element={<D8SubfactorsPreview />} />
      <Route path={D8_GRID_PREVIEW_PATH} element={<D8GridPreview />} />
      <Route path="/preview/student-ancestry" element={<StudentAncestryPreview />} />
      <Route path="/preview/student-hours" element={<StudentHoursPreview />} />
      <Route path="/student/*" element={<StudentEditionPage />} />
      {/* Public owner preview. The live Technique Tree stays at /technique-tree. */}
      <Route path="/preview/technique-tree" element={<TechniqueTreePreviewPage />} />
      <Route path="/preview/technique-cloud" element={<TechniqueCloudPreview />} />
      <Route path="/preview/video-library" element={<VideoLibraryPreview />} />
      {/* Public owner preview. The live working tree stays at /student/working. */}
      <Route path="/preview/personal-graph" element={<PersonalGraphPreviewPage />} />
      <Route path="/preview/lineage-card" element={<CompactLineageCard />} />
      <Route path="/preview/lineage-line" element={<ExpandedLineageLine />} />
      {/* Isolated instructor-sheet concept. Not in edition menus, and it does not write a profile. */}
      <Route path="/preview/instructor-profile" element={<InstructorProfilePreviewPage />} />
      {/* Isolated instructor character sheet. Fills the gap between the student profile and the owner identity card. Nothing is saved. */}
      <Route path="/preview/instructor-sheet" element={<InstructorSheetPreviewPage />} />
      {/* Isolated Pro hub preview. Live /pro is unchanged. */}
      <Route path="/preview/pro-home" element={<ProHomePreviewPage />} />
      {/* Isolated White hub. Live /white and /match stay on their current paths. */}
      <Route path="/preview/white-hub" element={<WhiteHubPreviewPage />} />
      {/* Isolated Media menu concept. Live /media keeps its purple rails. */}
      <Route path="/preview/media-edition" element={<MediaMenuPreviewPage />} />
      {/* Isolated Instructor card concept. Live /coach and /coach-unlimited are unchanged. */}
      <Route path="/preview/instructor-cards" element={<InstructorCardsPreviewPage />} />
      {/* Isolated coach-student pair. Not Connect to a gym, and it writes nothing. */}
      <Route path="/preview/connect-coach" element={<ConnectCoachPreviewPage />} />
      {/* Example scopes only. Not in edition menus, and nothing here is saved. */}
      <Route path="/preview/ancestry-student" element={<AncestryStudentPreview />} />
      <Route path="/preview/ancestry-instructor" element={<AncestryInstructorPreview />} />
      <Route path="/preview/ancestry-academy" element={<AncestryAcademyPreview />} />
      <Route path="/preview/profiles" element={<ProfileHubPage />} />
      <Route path="/preview/profile-student" element={<StudentFullPage />} />
      <Route path="/preview/profile-instructor" element={<InstructorFullPage />} />
      <Route path="/preview/profile-academy" element={<AcademyFullPage />} />
      <Route path="/preview/2036-student" element={<Future2036Page place="student" />} />
      <Route path="/preview/2036-instructor" element={<Future2036Page place="instructor" />} />
      <Route path="/preview/2036-academy" element={<Future2036Page place="academy" />} />
      <Route path="/coming-soon" element={<ComingSoonPage />} />
      <Route path="/card" element={<Navigate to="/" replace />} />
      <Route path="/half-off" element={<HalfOffPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <OneDriveConnectResume />
    </InviteDoor>
    </IndexCardProvider>
  );
}

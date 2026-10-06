import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { OneDriveConnectResume } from './components/OneDriveConnectResume';
import { SeatSessionChrome, useCurrentSeat } from './components/SeatSessionBar';
import { useCoachUnlocked } from './hooks/useCoachUnlocked';
import { useKeepFocusedFieldVisible } from './hooks/useKeepFocusedFieldVisible';
import { useProUnlocked } from './hooks/useProUnlocked';
import { useWhiteUnlocked } from './hooks/useWhiteUnlocked';
import { consumeCoachUnlockQueryNow } from './lib/coachUnlock';
import {
  acceptInstructorInvite,
  currentNavigationType,
  inviteReloadBlocked,
  peekInstructorInvite,
  stripInviteFromAddress,
} from './lib/instructorSeats';
import { coachDoorOpen, proDoorOpen } from './lib/productNames';
import { proPurchaseReturn } from './lib/proEntitlement';
import { consumeUnlockQueryNow } from './lib/proUnlock';
import { WHITE_BUY_PATH } from './lib/whitePurchase';
import { whiteHubAllowed, whiteLiveToolsAllowed } from './lib/whiteUnlock';
import { ClassHistoryPage } from './pages/ClassHistory';
import { CoachPage } from './pages/Coach';
import { CoachUnlimitedPage } from './pages/CoachUnlimited';
import { CoachingToolsPage } from './pages/CoachingTools';
import { CompetitionCurriculumPage } from './pages/CompetitionCurriculum';
import { ComingSoonPage } from './pages/ComingSoon';
import { CompetitionManagementPage } from './pages/CompetitionManagement';
import { CompetitionReadyPage } from './pages/CompetitionReady';
import { CompetitorManagementPage } from './pages/CompetitorManagement';
import { GamePlanPage } from './pages/GamePlan';
import { HomePage } from './pages/Home';
import { PrivacyPage } from './pages/Privacy';
import { InstructorCollaborationPage } from './pages/InstructorCollaboration';
import { MatchControllerPage } from './pages/MatchController';
import { MatchDisplayPage } from './pages/MatchDisplay';
import { ProPage } from './pages/Pro';
import { RosterPage } from './pages/Roster';
import { ScreensaverPage } from './pages/Screensaver';
import { SchedulePage } from './pages/Schedule';
import { TechniqueTreePage } from './pages/TechniqueTree';
import { TechniquesPage } from './pages/Techniques';
import { TermsPage } from './pages/Terms';
import { RankingsPage } from './pages/Rankings';
import { TournamentPage } from './pages/Tournament';
import { TournamentSuitePage } from './pages/TournamentSuite';
import { TrainingNotesPage } from './pages/TrainingNotes';
import { TrainingControllerPage } from './pages/TrainingController';
import { TrainingPage } from './pages/Training';
import { BuyCoachPage, BuyProPage } from './pages/BuyTier';
import { BuyWhitePage } from './pages/BuyWhite';
import { WhitePage } from './pages/White';
import { WhiteRosterPage } from './pages/WhiteRoster';

consumeUnlockQueryNow();
consumeCoachUnlockQueryNow();

/**
 * Full page loads read the invite before the router paints a locked route.
 * A live token accepts the seat and replaces the address with home.
 * The owner code is never added to that address.
 */
function consumeInviteDoorNow(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite');
  if (!token || peekInstructorInvite(token) !== 'open') return;
  if (inviteReloadBlocked(token, currentNavigationType(), token)) {
    stripInviteFromAddress();
    return;
  }
  if (!acceptInstructorInvite(token).ok) return;
  const url = new URL(window.location.href);
  url.pathname = '/';
  url.search = '';
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.hash}`);
}

consumeInviteDoorNow();

function ProRoute({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const unlocked = proDoorOpen(useProUnlocked());
  if (!unlocked && !proPurchaseReturn(params)) return <Navigate to="/coming-soon" replace />;
  return children;
}

/** Advantage White hub and roster. Purchase, WHITEFREE, or email restore opens them. */
function WhiteHubRoute({ children }: { children: ReactNode }) {
  const unlocked = useWhiteUnlocked();
  if (!whiteHubAllowed(unlocked)) return <Navigate to={WHITE_BUY_PATH} replace />;
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
    return <Navigate to={WHITE_BUY_PATH} replace />;
  }
  return children;
}

function CoachRoute({ children }: { children: ReactNode }) {
  const coach = useCoachUnlocked();
  const pro = useProUnlocked();
  const seated = useCurrentSeat() !== null;
  if (!coachDoorOpen(pro, coach, seated)) return <Navigate to="/coming-soon" replace />;
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
  const open = token !== null && peekInstructorInvite(token) === 'open';

  useEffect(() => {
    if (!token || !open) return;
    const result = acceptInstructorInvite(token);
    if (result.ok) {
      navigate('/', { replace: true });
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

  if (open) return null;
  return children;
}

export default function App() {
  useKeepFocusedFieldVisible();
  useProUnlocked();
  useCoachUnlocked();

  return (
    <>
    <SeatSessionChrome />
    <InviteDoor>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/white"
        element={
          <WhiteHubRoute>
            <WhitePage />
          </WhiteHubRoute>
        }
      />
      <Route path="/buy" element={<BuyWhitePage />} />
      <Route
        path="/buy/coach"
        element={
          <CoachRoute>
            <BuyCoachPage />
          </CoachRoute>
        }
      />
      <Route
        path="/buy/pro"
        element={
          <ProRoute>
            <BuyProPage />
          </ProRoute>
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
          <ProRoute>
            <ProPage />
          </ProRoute>
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
          <ProRoute>
            <TournamentSuitePage />
          </ProRoute>
        }
      />
      <Route
        path="/coach-unlimited"
        element={
          <ProRoute>
            <CoachUnlimitedPage />
          </ProRoute>
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
          <ProRoute>
            <InstructorCollaborationPage />
          </ProRoute>
        }
      />
      <Route
        path="/class-history"
        element={
          <ProRoute>
            <ClassHistoryPage />
          </ProRoute>
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
          <ProRoute>
            <SchedulePage />
          </ProRoute>
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
      <Route
        path="/slideshow"
        element={
          <ProRoute>
            <ScreensaverPage />
          </ProRoute>
        }
      />
      <Route
        path="/screensaver"
        element={
          <ProRoute>
            <ScreensaverPage />
          </ProRoute>
        }
      />
      <Route path="/coming-soon" element={<ComingSoonPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <OneDriveConnectResume />
    </InviteDoor>
    </>
  );
}

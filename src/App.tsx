import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useCoachUnlocked } from './hooks/useCoachUnlocked';
import { useKeepFocusedFieldVisible } from './hooks/useKeepFocusedFieldVisible';
import { useProUnlocked } from './hooks/useProUnlocked';
import { consumeCoachUnlockQueryNow } from './lib/coachUnlock';
import { consumeUnlockQueryNow } from './lib/proUnlock';
import { CoachPage } from './pages/Coach';
import { ComingSoonPage } from './pages/ComingSoon';
import { CompetitorManagementPage } from './pages/CompetitorManagement';
import { HomePage } from './pages/Home';
import { InstructorCollaborationPage } from './pages/InstructorCollaboration';
import { MatchControllerPage } from './pages/MatchController';
import { MatchDisplayPage } from './pages/MatchDisplay';
import { ProPage } from './pages/Pro';
import { RosterPage } from './pages/Roster';
import { ScreensaverPage } from './pages/Screensaver';
import { SchedulePage } from './pages/Schedule';
import { TechniqueTreePage } from './pages/TechniqueTree';
import { TechniquesPage } from './pages/Techniques';
import { RankingsPage } from './pages/Rankings';
import { TournamentPage } from './pages/Tournament';
import { TournamentSuitePage } from './pages/TournamentSuite';
import { TrainingNotesPage } from './pages/TrainingNotes';
import { TrainingControllerPage } from './pages/TrainingController';
import { TrainingPage } from './pages/Training';
import { WhitePage } from './pages/White';

consumeUnlockQueryNow();
consumeCoachUnlockQueryNow();

function ProRoute({ children }: { children: ReactNode }) {
  const unlocked = useProUnlocked();
  if (!unlocked) return <Navigate to="/coming-soon" replace />;
  return children;
}

function CoachRoute({ children }: { children: ReactNode }) {
  const coach = useCoachUnlocked();
  const pro = useProUnlocked();
  if (!coach && !pro) return <Navigate to="/coming-soon" replace />;
  return children;
}

export default function App() {
  useKeepFocusedFieldVisible();
  useProUnlocked();
  useCoachUnlocked();

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/white" element={<WhitePage />} />
      <Route path="/lite" element={<Navigate to="/white" replace />} />
      <Route path="/match" element={<MatchDisplayPage />} />
      <Route path="/match/control" element={<MatchControllerPage />} />
      <Route path="/training" element={<TrainingPage />} />
      <Route path="/training/control" element={<TrainingControllerPage />} />
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
        path="/competitors"
        element={
          <ProRoute>
            <CompetitorManagementPage />
          </ProRoute>
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
        path="/rankings"
        element={
          <ProRoute>
            <RankingsPage />
          </ProRoute>
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

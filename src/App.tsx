import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useProUnlocked } from './hooks/useProUnlocked';
import { consumeUnlockQueryNow } from './lib/proUnlock';
import { ComingSoonPage } from './pages/ComingSoon';
import { HomePage } from './pages/Home';
import { MatchControllerPage } from './pages/MatchController';
import { MatchDisplayPage } from './pages/MatchDisplay';
import { ProPage } from './pages/Pro';
import { RosterPage } from './pages/Roster';
import { ScreensaverPage } from './pages/Screensaver';
import { SchedulePage } from './pages/Schedule';
import { TournamentPage } from './pages/Tournament';
import { TrainingPage } from './pages/Training';
import { WhitePage } from './pages/White';

consumeUnlockQueryNow();

function ProRoute({ children }: { children: ReactNode }) {
  const unlocked = useProUnlocked();
  if (!unlocked) return <Navigate to="/coming-soon" replace />;
  return children;
}

export default function App() {
  useProUnlocked();

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/white" element={<WhitePage />} />
      <Route path="/lite" element={<Navigate to="/white" replace />} />
      <Route path="/match" element={<MatchDisplayPage />} />
      <Route path="/match/control" element={<MatchControllerPage />} />
      <Route path="/training" element={<TrainingPage />} />
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
          <ProRoute>
            <TournamentPage />
          </ProRoute>
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
          <ProRoute>
            <RosterPage />
          </ProRoute>
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

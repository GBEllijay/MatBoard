import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/Home';
import { MatchControllerPage } from './pages/MatchController';
import { MatchDisplayPage } from './pages/MatchDisplay';
import { ScreensaverPage } from './pages/Screensaver';
import { TrainingPage } from './pages/Training';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/match" element={<MatchDisplayPage />} />
      <Route path="/match/control" element={<MatchControllerPage />} />
      <Route path="/training" element={<TrainingPage />} />
      <Route path="/slideshow" element={<ScreensaverPage />} />
      <Route path="/screensaver" element={<ScreensaverPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

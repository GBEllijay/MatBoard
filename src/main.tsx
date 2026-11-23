import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { installStudentMockGuard } from './lib/studentDemo';
import { installStudentProfileScope } from './lib/studentProfiles';
import { initSignedInSync } from './lib/signedInSync';
import { initMatchSync } from './lib/matchStore';
import { initTrainingSync } from './lib/trainingStore';
import { settleOneDriveRedirect } from './lib/oneDriveAuth';
import { initRankingSync } from './lib/rankingStore';
import { initRosterSync } from './lib/rosterStore';
import { initScheduleSync } from './lib/scheduleStore';
import { initTournamentSync } from './lib/tournamentStore';
import { setPlaybackAudioSession, watchInstalledPersistence } from './lib/offlineShell';
import './index.css';
import './skins/whiteSkins.css';

installStudentMockGuard();
// After the demo guard, so ?student=1 still overlays the default profile
// and every other profile is stored under its own keys.
installStudentProfileScope();
initSignedInSync();
// Every buyer's small profile fields back up to Advantage Cloud (no photos or videos).
void import('./lib/profileBackupBoot')
  .then((mod) => mod.startProfileBackup())
  .catch(() => undefined);
initMatchSync();
initTrainingSync();
initTournamentSync();
initRosterSync();
initRankingSync();
void initScheduleSync();
registerSW({ immediate: true });
setPlaybackAudioSession();
watchInstalledPersistence();

void settleOneDriveRedirect()
  .catch(() => undefined)
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  });

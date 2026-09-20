import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { initMatchSync } from './lib/matchStore';
import { initRosterSync } from './lib/rosterStore';
import { initScheduleSync } from './lib/scheduleStore';
import { initTournamentSync } from './lib/tournamentStore';
import './index.css';

initMatchSync();
initTournamentSync();
initRosterSync();
void initScheduleSync();
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

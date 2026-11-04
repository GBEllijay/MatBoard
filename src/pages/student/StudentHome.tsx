/**
 * Student Edition home: the branded hub header (tiled navy, Parent approvals, clock logo,
 * Advantage title, Student Edition belt bar), then ONE character sheet frame with zones:
 * identity → stat strip (mat time + stopwatch, streak, wins, stripes) → radar | wins → body scan,
 * then the usual hub tiles. No profile yet → profile setup first.
 */
import { Navigate, useSearchParams } from 'react-router-dom';
import { studentDemoRequested } from '../../lib/studentDemo';
import { todayIso } from '../../lib/studentEdition';
import { readStreakTarget, streakLabel, streakWeekLine, trainingStreak } from '../../lib/trainingStreak';
import { BodyScanSection } from './BodyScan';
import { useStudentFile, useStudentPath } from './chrome';
import { useProfileMedia } from './ProfileIdentity';
import { StudentCardLayout } from './StudentCardLayout';
import { StudentHub } from './StudentMenus';
import './profile.css';
import './studentCardLayout.css';


/** Duolingo-style weekly streak. Always on; the 2 or 3 sessions target stays in Settings. */
export function StreakBadge({ journal }: { journal: Parameters<typeof trainingStreak>[0] }) {
  const target = typeof localStorage === 'undefined' ? 2 : readStreakTarget(localStorage);
  const view = trainingStreak(journal, todayIso(), target);
  const pct = Math.round((Math.min(view.thisWeek, view.target) / view.target) * 100);
  return (
    <div className="streak-badge" data-testid="streak-badge" data-weeks={view.weeks}>
      <svg className="streak-badge__flame" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
        <path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-.5-2-1-3 3 2 4 4.5 4 7a6 6 0 0 1-12 0c0-5 5-8 6-13z" fill={view.weeks ? '#ff9a2e' : '#8a94a6'} />
      </svg>
      <span className="streak-badge__text">
        <strong>{streakLabel(view)}</strong>
        <small>{streakWeekLine(view)}</small>
        <span className="streak-badge__bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
      </span>
    </div>
  );
}

export function StudentHome() {
  const { report, commit } = useStudentFile();
  const to = useStudentPath();
  const [params] = useSearchParams();
  const media = useProfileMedia();
  if (!report.profile.displayName.trim() && !studentDemoRequested()) {
    return <Navigate to={to('/student/profile?setup=1')} replace />;
  }
  const zone = params.get('zone') ?? '';
  return (
    <StudentHub
      sheet={
        <section className="student-home" aria-label="My character sheet" data-testid="student-home">
          <StudentCardLayout
            home
            portrait={media.portrait}
            logo={media.logo}
            to={to}
            bodyScan={<BodyScanSection key={zone} report={report} commit={commit} to={to} focusZone={zone} forceOpen={params.get('scan') === '1'} />}
          />
        </section>
      }
    />
  );
}

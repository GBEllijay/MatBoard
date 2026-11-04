/**
 * Student Edition home: the character sheet. Streak + mat hours on top, then the card
 * (belt → mat hours frame + timer → radar → medals → details), the private body scan,
 * and a menu with every hub section. No profile yet → profile setup first.
 * The classic hub stays at /student/hub.
 */
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { HomeMark } from '../../components/HomeMark';
import { SiteFooter } from '../../components/SiteFooter';
import { matHoursLongLabel, matHoursTotal } from '../../lib/matHours';
import { studentDemoRequested } from '../../lib/studentDemo';
import { todayIso } from '../../lib/studentEdition';
import { groupMenuLinks } from '../../lib/studentHubMenu';
import { tierHomeHref } from '../../lib/submenuNav';
import { readStreakTarget, streakLabel, streakWeekLine, trainingStreak } from '../../lib/trainingStreak';
import { lockStudentEditionBrowser } from '../../lib/studentUnlock';
import { BodyScanSection } from './BodyScan';
import { useStudentFile, useStudentPath } from './chrome';
import { useProfileMedia } from './ProfileIdentity';
import { StudentCardLayout } from './StudentCardLayout';
import './profile.css';
import './studentCardLayout.css';

export const HOME_EXTRA_LINKS = [
  { label: 'My report card', note: 'Mat hours, streak, and progress', to: '/student/report' },
  { label: 'Settings', note: 'Profile, training target, and switches', to: '/student/profile' },
  { label: 'Classic menu', note: 'The grouped hub', to: '/student/hub' },
] as const;

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
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const media = useProfileMedia();
  if (!report.profile.displayName.trim() && !studentDemoRequested()) {
    return <Navigate to={to('/student/profile?setup=1')} replace />;
  }
  const links = [...groupMenuLinks(report.profile.belt), ...HOME_EXTRA_LINKS];
  const seen = new Set<string>();
  const menu = links.filter((l) => (seen.has(l.to + l.label) ? false : (seen.add(l.to + l.label), true)));
  const zone = params.get('zone') ?? '';
  return (
    <main className="student student-frame student--arena student--profile student-home" data-testid="student-home">
      <div className="arena-scroll">
        <HomeMark to={tierHomeHref(params.toString())} />
        <header className="student-home__top" data-testid="student-home-top">
          <StreakBadge journal={report.journal} />
          <p className="student-home__hours" data-testid="home-mat-hours">{matHoursLongLabel(matHoursTotal(report.journal).minutes)}</p>
        </header>
        <StudentCardLayout portrait={media.portrait} logo={media.logo} to={to} />
        <BodyScanSection key={zone} report={report} commit={commit} to={to} focusZone={zone} forceOpen={params.get('scan') === '1'} />
        <nav className="student-home__menu" aria-label="Student Edition menu" data-testid="student-home-menu">
          <h2>Menu</h2>
          <ul>
            {menu.map((item) => (
              <li key={item.label + item.to}>
                <Link className="student-home__link" to={to(item.to)} data-testid="home-menu-link">
                  <strong>{item.label}</strong>
                  {item.note ? <small>{item.note}</small> : null}
                </Link>
              </li>
            ))}
          </ul>
          <button type="button" className="ink-btn student-home__lock" onClick={() => { lockStudentEditionBrowser(); navigate('/products'); }}>
            Lock Student Edition
          </button>
        </nav>
        <SiteFooter />
      </div>
    </main>
  );
}

import { Link, useSearchParams } from 'react-router-dom';
import { HomeMark } from '../../components/HomeMark';
import { SiteFooter } from '../../components/SiteFooter';
import { loadAcademyLink } from '../../lib/academyPathway';
import { STUDENT_EDITION_NAME, STUDENT_HOME_DESCRIPTION } from '../../lib/productNames';
import { tierHomeHref } from '../../lib/submenuNav';
import { todayIso } from '../../lib/studentEdition';
import {
  BACKUP_GROUP_LABEL,
  COACH_GROUP_LABEL,
  COACH_LINKS,
  COMPETE_EXTRAS,
  COMPETE_GROUP_LABEL,
  COMPETE_LINKS,
  LOG_TODAY_LABEL,
  RANK_GROUP_LABEL,
  TRAINING_EXTRAS,
  TRAINING_GROUP_LABEL,
  TRAINING_LINKS,
  competitorHubSummary,
  progressLinks,
} from '../../lib/studentHubMenu';
import { backupStampLabel, readStudentBackupStamp } from '../../lib/studentBackupStamp';
import { useStudentFile, useStudentPath } from './chrome';
import { GroupFrame, MenuList, MenuRow } from './groupChrome';

export function StudentHub() {
  const to = useStudentPath();
  const [params] = useSearchParams();
  const home = tierHomeHref(params.toString());
  const { report } = useStudentFile();
  const summary = competitorHubSummary(report, todayIso());
  const academy = loadAcademyLink(localStorage);
  const stamp = backupStampLabel(readStudentBackupStamp(localStorage));
  const coachNote = academy ? `Connected to ${academy.folderName}` : 'Academy, a file for your coach, and import';
  const tiles = [
    { label: TRAINING_GROUP_LABEL, note: "Today's page, cards, calendar, and videos", to: '/student/training' },
    { label: RANK_GROUP_LABEL, note: 'Rank, belt goals, fundamentals, and self-assessment', to: '/student/progress' },
    { label: COMPETE_GROUP_LABEL, note: summary.tile, to: '/student/compete' },
    { label: COACH_GROUP_LABEL, note: coachNote, to: '/student/coach' },
  ];

  return (
    <main className="home home--student student-menu-home">
      <div className="home__inner">
        <HomeMark to={home} />
        <nav className="s-hub" aria-label="Advantage Student Edition">
          <header className="s-hub__intro">
            <h2>{STUDENT_EDITION_NAME}</h2>
            <p>{STUDENT_HOME_DESCRIPTION}</p>
          </header>
          {tiles.map((item) => (
            <Link key={item.to} className="s-hub__tile" to={to(item.to)} aria-label={item.label}>
              <strong>{item.label}</strong>
              <small>{item.note}</small>
            </Link>
          ))}
          <Link
            className="s-hub__backup"
            to={to('/student/backup')}
            aria-label={`${BACKUP_GROUP_LABEL}. Last backup: ${stamp}`}
          >
            <span>{BACKUP_GROUP_LABEL}</span>
            <small>Last backup: {stamp}</small>
          </Link>
        </nav>
        <SiteFooter />
      </div>
    </main>
  );
}

export function TrainingMenu() {
  const to = useStudentPath();
  return (
    <GroupFrame title={TRAINING_GROUP_LABEL}>
      <Link className="s-pin" to={to('/student/journal')}>
        {LOG_TODAY_LABEL}
      </Link>
      <MenuList label={TRAINING_GROUP_LABEL}>
        {TRAINING_LINKS.map((item) => (
          <MenuRow key={item.to} label={item.label} note={item.note} to={item.to} />
        ))}
      </MenuList>
      <p className="s-extra">
        {TRAINING_EXTRAS.map((item) => (
          <Link key={item.label} className="s-extra__link" to={to(item.to)}>
            {item.label}
          </Link>
        ))}
      </p>
    </GroupFrame>
  );
}

export function ProgressMenu() {
  const { report } = useStudentFile();
  const links = progressLinks(report.profile.belt);
  return (
    <GroupFrame title={RANK_GROUP_LABEL}>
      <MenuList label={RANK_GROUP_LABEL}>
        {links.map((item) => (
          <MenuRow key={item.label} label={item.label} note={item.note} to={item.to} />
        ))}
      </MenuList>
    </GroupFrame>
  );
}

export function CompeteMenu() {
  const to = useStudentPath();
  const { report } = useStudentFile();
  const summary = competitorHubSummary(report, todayIso());
  return (
    <GroupFrame title={COMPETE_GROUP_LABEL}>
      <section className="s-summary" aria-label="Competitor summary">
        {summary.eventName ? (
          <Link className="s-summary__event" to={to('/student/competitor')}>
            {summary.eventName}
          </Link>
        ) : (
          <p className="s-summary__event">No tournament yet</p>
        )}
        <div className="s-summary__meta">
          {summary.countdown ? <span className="s-chip">{summary.countdown}</span> : null}
          <Link className="s-chip" to={to('/student/weight')}>
            {summary.weight || 'No weigh-in yet'}
          </Link>
          <Link className="s-chip" to={to('/student/results')}>
            {`Record ${summary.record}`}
          </Link>
        </div>
      </section>
      <MenuList label={COMPETE_GROUP_LABEL}>
        {COMPETE_LINKS.map((item) => (
          <MenuRow key={item.to + item.label} label={item.label} note={item.note} to={item.to} />
        ))}
      </MenuList>
      <p className="s-extra">
        {COMPETE_EXTRAS.map((item) => (
          <Link key={item.label} className="s-extra__link" to={to(item.to)}>
            {item.label}
          </Link>
        ))}
      </p>
    </GroupFrame>
  );
}

export function CoachMenu() {
  const academy = loadAcademyLink(localStorage);
  return (
    <GroupFrame title={COACH_GROUP_LABEL}>
      {academy ? (
        <p className="s-backup__stamp">Connected to {academy.folderName}.</p>
      ) : (
        <p className="s-backup__stamp">Not connected to an academy yet.</p>
      )}
      <MenuList label={COACH_GROUP_LABEL}>
        {COACH_LINKS.map((item) => (
          <MenuRow key={item.to} label={item.label} note={item.note} to={item.to} />
        ))}
      </MenuList>
    </GroupFrame>
  );
}

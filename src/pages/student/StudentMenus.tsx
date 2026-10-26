import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { HomeMark } from '../../components/HomeMark';
import { SiteFooter } from '../../components/SiteFooter';
import { loadAcademyLink } from '../../lib/academyPathway';
import { PRODUCTS_PATH, STUDENT_EDITION_NAME, STUDENT_HOME_DESCRIPTION } from '../../lib/productNames';
import { lockStudentEditionBrowser } from '../../lib/studentUnlock';
import { tierHomeHref } from '../../lib/submenuNav';
import { todayIso } from '../../lib/studentEdition';
import { wornBeltPreview } from '../../lib/studentRank';
import {
  ADD_TOURNAMENT_LABEL,
  BACKUP_GROUP_LABEL,
  COACH_GROUP_LABEL,
  COACH_LINKS,
  COMPETE_EXTRAS,
  COMPETE_GROUP_LABEL,
  COMPETE_LINKS,
  RANK_GROUP_LABEL,
  RANK_MENU_STRIPES,
  TRAINING_EXTRAS,
  TRAINING_GROUP_LABEL,
  TRAINING_LINKS,
  competitorHubSummary,
  progressLinks,
} from '../../lib/studentHubMenu';
import { backupStampLabel, readStudentBackupStamp } from '../../lib/studentBackupStamp';
import { subscribeStudentJournal } from '../../lib/studentDemo';
import { reportIdentity } from '../../lib/studentReport';
import type { StudentProgressReport } from '../../lib/progress/types';
import { useStudentFile, useStudentPath } from './chrome';
import { GroupFrame, MenuList, MenuRow } from './groupChrome';
import { BinderDecor, BracketArt, Chevron, JournalDecor, RowIcon } from './hubArt';
import { WornBeltMark } from './wornBelt';

function profileCardNote(report: StudentProgressReport): string {
  const identity = reportIdentity(report);
  if (!identity.named && !identity.gymNamed && !identity.startedSet) return 'Name, gym, and start date';
  const started = identity.startedSet ? `Started ${identity.started}` : 'Started not set';
  return `${identity.name} · ${identity.gym} · ${started}`;
}

export function ProfileCard() {
  const to = useStudentPath();
  const { report } = useStudentFile();
  return (
    <Link className="s-profile" to={to('/student/profile')} aria-label="My profile">
      <span className="s-profile__text">
        <strong>My profile</strong>
        <small>{profileCardNote(report)}</small>
      </span>
      <Chevron />
    </Link>
  );
}

export function StudentHub() {
  const to = useStudentPath();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const home = tierHomeHref(params.toString());
  const { report } = useStudentFile();
  const summary = competitorHubSummary(report, todayIso());
  const academy = loadAcademyLink(localStorage);
  const [stamp, setStamp] = useState(() => backupStampLabel(readStudentBackupStamp(localStorage)));
  useEffect(() => {
    return subscribeStudentJournal(() => {
      setStamp(backupStampLabel(readStudentBackupStamp(localStorage)));
    });
  }, []);
  const coachNote = academy ? `Connected to ${academy.folderName}` : 'Academy, a file for your coach, and import';
  const worn = wornBeltPreview(report);

  return (
    <main className="home home--student student-menu-home">
      <div className="home__inner">
        <HomeMark to={home} />
        <nav className="s-hub" aria-label="Advantage Student Edition">
          <header className="s-hub__intro">
            <h2>{STUDENT_EDITION_NAME}</h2>
            <p>{STUDENT_HOME_DESCRIPTION}</p>
          </header>
          <ProfileCard />
          <Link className="s-tile s-journal" to={to('/student/training')} aria-label={TRAINING_GROUP_LABEL}>
            <JournalDecor />
            <span className="s-tile__text">
              <strong>{TRAINING_GROUP_LABEL}</strong>
              <small>Today's page, cards, calendar, and videos</small>
            </span>
          </Link>
          <div className="s-tile s-navy s-rank">
            <Link className="s-rank__menu" to={to('/student/progress')} aria-label={RANK_GROUP_LABEL}>
              <span className="s-tile__text">
                <span className="s-rank__head">
                  <strong>{RANK_GROUP_LABEL}</strong>
                  <span className="s-rank__meta">{worn.meta}</span>
                </span>
                <small>Belt goals, fundamentals, and self-assessment</small>
                <WornBeltMark preview={worn} />
              </span>
            </Link>
            <Link className="s-rank__jump" to={to('/student/rank#current')} aria-label="Current belt">
              <span className="s-rank__jump-copy">
                <strong>Current belt</strong>
                <small>{worn.meta}</small>
              </span>
              <Chevron />
            </Link>
            <span className="s-meter" aria-hidden="true">
              <i style={{ width: `${worn.percent}%` }} />
            </span>
            <span className="s-rank__cap">
              <span>{worn.nextLabel}</span>
              <span>{`${worn.percent}%`}</span>
            </span>
          </div>
          <Link className="s-tile s-navy s-compete" to={to('/student/compete')} aria-label={COMPETE_GROUP_LABEL}>
            <BracketArt />
            <span className="s-tile__text">
              <strong>{COMPETE_GROUP_LABEL}</strong>
              <small>Tournaments, weight, opponents, results</small>
              <span className="s-chips">
                <span className="s-chip">{summary.next}</span>
                <span className="s-chip">{summary.record}</span>
              </span>
            </span>
          </Link>
          <Link className="s-tile s-binder" to={to('/student/coach')} aria-label={COACH_GROUP_LABEL}>
            <BinderDecor />
            <span className="s-tile__text">
              <strong>{COACH_GROUP_LABEL}</strong>
              <small>{coachNote}</small>
            </span>
          </Link>
          <Link
            className="s-ghost"
            to={to('/student/backup')}
            aria-label={`${BACKUP_GROUP_LABEL}. Last backup: ${stamp}`}
          >
            <RowIcon label={BACKUP_GROUP_LABEL} />
            <span className="s-ghost__label">{BACKUP_GROUP_LABEL}</span>
            <span className="s-ghost__status">
              <span className="s-dot" aria-hidden="true" />
              {`Last backup: ${stamp}`}
            </span>
          </Link>
        </nav>
        <div className="home__hints">
          <p className="home__soon">
            {STUDENT_EDITION_NAME} is on for this browser.{' '}
            <Link className="home__text-btn" to={PRODUCTS_PATH}>
              All products
            </Link>
            {' · '}
            <button
              type="button"
              className="home__text-btn"
              onClick={() => {
                lockStudentEditionBrowser();
                navigate(PRODUCTS_PATH);
              }}
            >
              Lock Student Edition
            </button>
          </p>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}

export function TrainingMenu() {
  const to = useStudentPath();
  return (
    <GroupFrame title={TRAINING_GROUP_LABEL}>
      <MenuList label={TRAINING_GROUP_LABEL}>
        {TRAINING_LINKS.map((item) => (
          <MenuRow key={item.to} skin="leather" label={item.label} note={item.note} to={item.to} />
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
  const worn = wornBeltPreview(report);
  const next = worn.nextLabel === 'Next stripe' ? `Next stripe ${worn.percent}%` : worn.nextLabel;
  return (
    <GroupFrame title={RANK_GROUP_LABEL}>
      <section className="s-rank-summary" aria-label="Belt summary">
        <span>{worn.summary}</span>
        <span>{next}</span>
        <WornBeltMark preview={worn} />
        <span className="s-meter" aria-hidden="true">
          <i style={{ width: `${worn.percent}%` }} />
        </span>
      </section>
      <ProfileCard />
      <MenuList label={RANK_GROUP_LABEL}>
        {links.map((item) => (
          <MenuRow
            key={item.label}
            skin="belt"
            label={item.label}
            note={item.note}
            to={item.to}
            stripes={RANK_MENU_STRIPES.find((row) => row.label === item.label)?.stripes}
          />
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
      <section className="s-score" aria-label="Competitor summary">
        <div>
          <small>Next event</small>
          <b>{summary.next}</b>
        </div>
        <div>
          <small>Weight</small>
          <b>{summary.weight}</b>
        </div>
        <div>
          <small>Record</small>
          <b>{summary.record}</b>
        </div>
      </section>
      {summary.eventName ? null : (
        <Link className="ink-btn ink-btn--save s-score__add" to={to('/student/competitor')}>
          {ADD_TOURNAMENT_LABEL}
        </Link>
      )}
      <MenuList label={COMPETE_GROUP_LABEL} bracket>
        {COMPETE_LINKS.map((item, index) => (
          <MenuRow
            key={item.to + item.label}
            skin="bracket"
            label={item.label}
            note={item.note}
            to={item.to}
            node={index === 0 ? 'on' : 'off'}
          />
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
      {academy ? <p className="s-note">Connected to {academy.folderName}.</p> : null}
      <MenuList label={COACH_GROUP_LABEL}>
        {COACH_LINKS.map((item) => (
          <MenuRow key={item.to} skin="binder" label={item.label} note={item.note} to={item.to} />
        ))}
      </MenuList>
    </GroupFrame>
  );
}

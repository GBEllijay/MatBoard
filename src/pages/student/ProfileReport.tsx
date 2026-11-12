/**
 * My report card: the student's own "character sheet". Read-only and derived:
 * belt, mat hours, week streak, game (self-assessment + accepted coach view),
 * session quality, injury/break status from journal cards and the injury list, weight only when
 * tracked. Every section is labeled by source. Nothing here is sent anywhere.
 * Kept as its own page/component so it does not collide with ProfilePage or
 * CoachClipboardCard work.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { assessmentSummary } from '../../lib/rosterCard';
import { readCoachOverlay } from '../../lib/coachSync';
import { loadAssessments } from '../../lib/studentAssessment';
import { matHoursTotal, formatHours } from '../../lib/matHours';
import { latestHowItWent, bodyStatus } from '../../lib/sessionQuality';
import { readStreakTarget, saveStreakTarget, streakLabel, streakWeekLine, trainingStreak, type StreakTarget } from '../../lib/trainingStreak';
import { todayIso } from '../../lib/studentEdition';
import { wornBeltPreview } from '../../lib/studentRank';
import type { StudentProgressReport } from '../../lib/progress/types';
import { coachEntriesFromOverlay, latestCoachNote } from '../../components/rosterCard/StudentCardPreview';
import { LeatherHeader, StudentMarks, useStudentFile, useStudentPath } from './chrome';
import { BeltHoursModel } from './BeltHoursModel';
import { MatHoursStat } from './MatTime';
import { WornBeltMark } from './wornBelt';
import './profileReport.css';

function Source({ who }: { who: 'you' | 'coach' | 'journal' }) {
  const text = who === 'coach' ? 'From coach · accepted' : who === 'journal' ? 'From your journal' : 'From you';
  return <span className={`report__source report__source--${who}`}>{text}</span>;
}

export function ProfileReport({ report, storage, today }: { report: StudentProgressReport; storage: Storage; today: string }) {
  const [target, setTarget] = useState<StreakTarget>(() => readStreakTarget(storage));
  const preview = wornBeltPreview(report);
  const total = matHoursTotal(report.journal);
  const streak = trainingStreak(report.journal, today, target);
  const howItWent = latestHowItWent(report.journal);
  const status = bodyStatus(report.journal, today, report.injuries);
  const overlay = readCoachOverlay(storage);
  const coach = coachEntriesFromOverlay(overlay);
  const self = loadAssessments(storage).entries;
  const mine = assessmentSummary([], self, 'self');
  const theirs = assessmentSummary(coach, [], 'coach');
  const note = latestCoachNote(overlay);
  const weighIns = report.competition?.weighIns ?? [];
  const weight = weighIns.length ? [...weighIns].sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
  const name = report.profile.displayName.trim() || 'Your name';
  const level = Math.floor(total.minutes / 60 / 25) + 1;
  const pick = (next: StreakTarget) => {
    saveStreakTarget(storage, next);
    setTarget(next);
  };

  return (
    <article className="report" data-testid="profile-report" aria-label="My report card">
      <header className="report__head">
        <div>
          <p className="report__kicker">Report card · level {level}</p>
          <h2 className="report__name">{name}</h2>
          <p className="report__meta">
            {preview.summary}
            {report.profile.gymName ? ` · ${report.profile.gymName}` : ''}
          </p>
        </div>
        <WornBeltMark preview={preview} />
      </header>

      <section className="report__section" aria-label="Training">
        <h3 className="report__title">
          Training <Source who="journal" />
        </h3>
        <MatHoursStat report={report} />
        <div className="report__stats">
          <p className="report__stat" data-testid="report-streak">
            <strong>{streakLabel(streak)}</strong>
            <span>{streakWeekLine(streak)}</span>
          </p>
          <div className="report__target" role="group" aria-label="Weekly goal">
            <span>Weekly goal</span>
            {([2, 3] as const).map((n) => (
              <button key={n} type="button" className="report__chip" aria-pressed={target === n} onClick={() => pick(n)}>
                {n} sessions
              </button>
            ))}
          </div>
          <p className="report__stat">
            <strong>{total.timed} timed sessions</strong>
            <span>{total.untimed ? `${total.untimed} older cards untimed` : `${formatHours(total.minutes)} h logged`}</span>
          </p>
          {howItWent ? (
            <p className="report__stat" data-testid="report-quality">
              <strong>Lately: {howItWent.text}</strong>
              <span>
                How it went · {howItWent.date} · {howItWent.count} {howItWent.count === 1 ? 'note' : 'notes'}
              </span>
            </p>
          ) : null}
        </div>
      </section>

      <BeltHoursModel />

      <section className="report__section" aria-label="Status">
        <h3 className="report__title">
          Status <Source who="journal" />
        </h3>
        <p className="report__stat" data-testid="report-status">
          <strong>{status.current ? (status.current.kind === 'injury' ? 'Working around an injury' : 'On a break') : 'Training'}</strong>
          <span>{status.current ? status.current.text : 'No injury or break marked.'}</span>
        </p>
        {status.history.length ? (
          <details className="report__more">
            <summary>History ({status.history.length})</summary>
            <ul>
              {status.history.map((row) => (
                <li key={row.id}>
                  {row.date} · {row.text}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <p className="report__private">Private. Injury and break marks never go to a coach.</p>
      </section>

      <section className="report__section" aria-label="Game">
        <h3 className="report__title">
          Game <Source who="you" />
        </h3>
        <div className="report__stats">
          {report.profile.trainingStyle ? (
            <p className="report__stat">
              <strong>Style</strong>
              <span>{report.profile.trainingStyle}</span>
            </p>
          ) : null}
          <p className="report__stat">
            <strong>Strengths</strong>
            <span>{mine.strengths || 'Take a self-assessment to see them.'}</span>
          </p>
          <p className="report__stat">
            <strong>Working on</strong>
            <span>{mine.weaknesses || '—'}</span>
          </p>
          {weight ? (
            <p className="report__stat" data-testid="report-weight">
              <strong>Weight</strong>
              <span>
                {weight.weight} {weight.unit} · {weight.date}
              </span>
            </p>
          ) : null}
        </div>
      </section>

      {note || theirs.coachLatest ? (
        <section className="report__section" aria-label="From coach">
          <h3 className="report__title">
            From coach <Source who="coach" />
          </h3>
          <details className="report__more" open>
            <summary>Latest from coach</summary>
            {note ? (
              <p className="report__stat">
                <strong>{note.issuedOn}</strong>
                <span>{note.note}</span>
              </p>
            ) : null}
            {theirs.coachLatest ? (
              <p className="report__stat">
                <strong>Coach assessment · {theirs.coachLatest.date}</strong>
                <span>
                  {theirs.strengths ? `Strengths: ${theirs.strengths}` : ''}
                  {theirs.weaknesses ? ` · Working on: ${theirs.weaknesses}` : ''}
                </span>
              </p>
            ) : null}
          </details>
        </section>
      ) : null}
    </article>
  );
}

export function ProfileReportPage() {
  const to = useStudentPath();
  const { report } = useStudentFile();
  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="My report card" />
      <div className="student-paper">
        <ProfileReport report={report} storage={localStorage} today={todayIso()} />
        <Link className="report__back" to={to('/student')}>
          Back to Student Edition
        </Link>
      </div>
    </main>
  );
}

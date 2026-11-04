import { useState } from 'react';
import { Link } from 'react-router-dom';
import { logMatTime } from '../../lib/matLog';
import { readStreakTarget, streakLabel, streakWeekLine, trainingStreak } from '../../lib/trainingStreak';
import type { JournalSession, StudentProgressReport } from '../../lib/progress/types';
import { MatHoursStat, MatTimeField } from './MatTime';
import { useStudentFile } from './chrome';
import './matHours.css';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Quick-add sheet: date, session type (Class / Open mat / Miscellaneous / Other), duration wheel, Save. Writes the shared log (the journal). */
export function MatQuickAddSheet({
  report,
  commit,
  date: initialDate,
  session: initialSession = 'class',
  onClose,
}: {
  report: StudentProgressReport;
  commit: (next: StudentProgressReport) => void;
  date?: string;
  session?: JournalSession;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initialDate ?? todayIso());
  const [session, setSession] = useState<JournalSession>(initialSession);
  const [minutes, setMinutes] = useState(60);
  const [sessionOther, setSessionOther] = useState('');
  const [error, setError] = useState('');
  const save = () => {
    try {
      commit(logMatTime(report, { date, session, minutes, sessionOther }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  };
  return (
    <div className="mat-quick" role="dialog" aria-modal="false" aria-label="Log mat time" data-testid="mat-quick-add">
      <h2 className="mat-quick__title">Log mat time</h2>
      <label className="mat-quick__date">
        <span>Date</span>
        <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      </label>
      <MatTimeField idPrefix="Quick " session={session} minutes={minutes} onSession={setSession} onMinutes={setMinutes} sessionOther={sessionOther} onSessionOther={setSessionOther} />
      <p className="mat-time__note">Adds to your journal and calendar. Same day and session updates the time, never counts twice.</p>
      {error ? <p role="alert" className="mat-quick__error">{error}</p> : null}
      <div className="mat-quick__actions">
        <button type="button" className="ink-btn" onClick={save} disabled={!minutes}>
          Save
        </button>
        <button type="button" className="ink-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Mat hours as one of the stats on the student's own card on the profile page. Self-contained. */
export function ProfileMatHoursStat({ to }: { to: (path: string) => string }) {
  const { report, commit } = useStudentFile();
  const [open, setOpen] = useState(false);
  const target = typeof localStorage === 'undefined' ? 2 : readStreakTarget(localStorage);
  const streak = trainingStreak(report.journal, todayIso(), target);
  return (
    <div className="card-stat card-stat--mat-hours" data-testid="profile-mat-hours">
      <span className="card-stat__label">Mat hours · from your journal</span>
      <MatHoursStat report={report} onAdd={() => setOpen(true)} />
      <p className="profile-mat-hours__streak" data-testid="profile-streak">
        <strong>{streakLabel(streak)}</strong>
        <span>{streakWeekLine(streak)}</span>
      </p>
      <Link className="ink-btn profile-mat-hours__report" to={to('/student/report')} aria-label="My report card">
        My report card
      </Link>
      {open ? <MatQuickAddSheet report={report} commit={commit} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

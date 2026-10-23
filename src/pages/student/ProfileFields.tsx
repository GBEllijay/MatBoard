import { useEffect, useState } from 'react';
import { PROGRESS_NAME_MAX, type StudentProgressReport } from '../../lib/progress/types';
import { setStudentProfile } from '../../lib/studentEdition';

/** Name, gym, and start date. Saved on this phone with the rest of the student file. */
export function StudentProfileFields({
  report,
  commit,
}: {
  report: StudentProgressReport;
  commit: (next: StudentProgressReport) => StudentProgressReport;
}) {
  const [name, setName] = useState(report.profile.displayName);
  const [gym, setGym] = useState(report.profile.gymName);
  const [started, setStarted] = useState(report.profile.startedOn);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setName(report.profile.displayName);
    setGym(report.profile.gymName);
    setStarted(report.profile.startedOn);
  }, [report.profile.displayName, report.profile.gymName, report.profile.startedOn]);

  const save = (patch: { displayName?: string; gymName?: string; startedOn?: string }) => {
    try {
      const next = setStudentProfile(report, patch);
      if (next !== report) {
        commit(next);
        setStatus('Saved on this phone.');
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
      setStatus('');
    }
  };

  return (
    <div className="profile-fields">
      <label className="ink">
        <span className="ink__label">Student name</span>
        <input
          aria-label="Student name"
          value={name}
          maxLength={PROGRESS_NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => save({ displayName: name })}
        />
      </label>
      <label className="ink">
        <span className="ink__label">Gym</span>
        <input
          aria-label="Gym name"
          value={gym}
          maxLength={PROGRESS_NAME_MAX}
          onChange={(event) => setGym(event.target.value)}
          onBlur={() => save({ gymName: gym })}
        />
      </label>
      <label className="ink">
        <span className="ink__label">Started</span>
        <input
          type="date"
          aria-label="Start date"
          value={started}
          onChange={(event) => setStarted(event.target.value)}
          onBlur={() => save({ startedOn: started })}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      {status ? <p className="student-quiet" role="status">{status}</p> : null}
    </div>
  );
}

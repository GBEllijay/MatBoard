import { useEffect, useState } from 'react';
import { PROGRESS_NAME_MAX, type StudentProgressReport } from '../../lib/progress/types';
import { setStudentProfile } from '../../lib/studentEdition';

/** Name, gym, and start date. Saved on this phone with the rest of the student file. */
export function StudentProfileFields({
  report,
  commit,
  variant = 'inline',
}: {
  report: StudentProgressReport;
  commit: (next: StudentProgressReport) => StudentProgressReport;
  /** `page` is the My profile screen. `inline` is the print prompt and My rank. */
  variant?: 'inline' | 'page';
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

  const save = (patch: { displayName?: string; gymName?: string; startedOn?: string }, confirm = false) => {
    try {
      const next = setStudentProfile(report, patch);
      if (next !== report) commit(next);
      if (next !== report || confirm) setStatus('Saved on this phone.');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
      setStatus('');
    }
  };

  const saveAll = () => save({ displayName: name, gymName: gym, startedOn: started }, true);
  const page = variant === 'page';
  const fields = (
    <>
      <label className={page ? 'profile-row' : 'ink'}>
        <span className="ink__label">Name</span>
        <input
          aria-label="Name"
          value={name}
          maxLength={PROGRESS_NAME_MAX}
          autoComplete="name"
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (!page) save({ displayName: name });
          }}
        />
      </label>
      <label className={page ? 'profile-row' : 'ink'}>
        <span className="ink__label">Gym</span>
        <input
          aria-label="Gym"
          value={gym}
          maxLength={PROGRESS_NAME_MAX}
          autoComplete="organization"
          onChange={(event) => setGym(event.target.value)}
          onBlur={() => {
            if (!page) save({ gymName: gym });
          }}
        />
      </label>
      <label className={page ? 'profile-row' : 'ink'}>
        <span className="ink__label">Training start date</span>
        <input
          type="date"
          aria-label="Training start date"
          value={started}
          onChange={(event) => setStarted(event.target.value)}
          onBlur={() => {
            if (!page) save({ startedOn: started });
          }}
        />
        {page ? <span className="profile-optional">Optional</span> : null}
      </label>
    </>
  );

  if (page) {
    return (
      <form
        className="profile-fields"
        aria-label="My profile"
        onSubmit={(event) => {
          event.preventDefault();
          saveAll();
        }}
      >
        <div className="profile-card">{fields}</div>
        <button type="submit" className="ink-btn ink-btn--save profile-save">
          Save profile
        </button>
        {error ? <p role="alert">{error}</p> : null}
        {status ? (
          <p className="student-quiet" role="status">
            {status}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <div className="profile-fields">
      {fields}
      {error ? <p role="alert">{error}</p> : null}
      {status ? (
        <p className="student-quiet" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}

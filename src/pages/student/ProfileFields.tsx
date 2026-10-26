import { useEffect, useState } from 'react';
import { PROGRESS_NAME_MAX, type StudentProgressReport, type TrainingStyle } from '../../lib/progress/types';
import { benchmarkView } from '../../lib/studentBenchmarks';
import { beltModeOf } from '../../lib/beltBook';
import { setStudentProfile, setTechniquePolicy, setTrainingStyle } from '../../lib/studentEdition';

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

const TRAINING_CHOICES: { id: TrainingStyle; label: string }[] = [
  { id: 'gi', label: 'Gi' },
  { id: 'nogi', label: 'No-Gi' },
  { id: 'both', label: 'Both' },
];

/** Gi, no-gi, and the technique prompts. Saved on this phone as soon as they change. */
export function TrainingSettings({
  report,
  commit,
}: {
  report: StudentProgressReport;
  commit: (next: StudentProgressReport) => StudentProgressReport;
}) {
  const view = benchmarkView(report);
  const kids = beltModeOf(report) === 'kids';
  const [error, setError] = useState('');
  const save = (next: StudentProgressReport) => {
    try {
      if (next !== report) commit(next);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    }
  };
  return (
    <section className="profile-card" aria-label="Training">
      <h2>Training</h2>
      <div className="training-choices" role="radiogroup" aria-label="Training style">
        {TRAINING_CHOICES.map((choice) => {
          const on = view.trainingStyle === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={on ? 'ink-btn ink-btn--save' : 'ink-btn'}
              onClick={() => save(setTrainingStyle(report, choice.id))}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
      <p className="profile-switch__note">Both shows a no-gi line under a benchmark that has one. Gi hides no-gi-only items. No-Gi uses the no-gi line and hides gi-only names.</p>
      <PolicySwitch
        on={view.policy.straightAnkleLock}
        label="Straight ankle lock"
        note={kids ? 'Illegal under 16. Hidden until a coach or parent turns it on.' : 'On for 16 and older, and when age is not set. Off under 16. You can change it.'}
        onToggle={() => save(setTechniquePolicy(report, 'straightAnkleLock', !view.policy.straightAnkleLock))}
      />
      <PolicySwitch
        on={view.policy.wristLocks}
        label="Wrist lock"
        note={kids ? 'Illegal for kids. Hidden until a coach or parent turns it on.' : 'On from blue belt. Off at white. You can change it.'}
        onToggle={() => save(setTechniquePolicy(report, 'wristLocks', !view.policy.wristLocks))}
      />
      <PolicySwitch
        on={view.policy.legLocks}
        label="Leg locks"
        note={kids ? 'Illegal for this age. Hidden until a coach or parent turns it on. Never shown on a gi list.' : 'Off until you turn them on. Never shown on a gi list.'}
        onToggle={() => save(setTechniquePolicy(report, 'legLocks', !view.policy.legLocks))}
      />
      <PolicySwitch
        on={view.policy.heelHooks}
        label="Heel hooks"
        note={kids ? 'Illegal for this age. Hidden until a coach or parent turns it on. Never shown on a gi list.' : 'Off through purple, and never shown on a gi list. At brown and black, turning this on also shows the leg-lock prompts.'}
        onToggle={() => save(setTechniquePolicy(report, 'heelHooks', !view.policy.heelHooks))}
      />
      <PolicySwitch
        on={view.policy.competition}
        label="Competition prompt"
        note="Optional. Off until you add it. It does not count toward a stripe or promotion."
        onToggle={() => save(setTechniquePolicy(report, 'competition', !view.policy.competition))}
      />
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function PolicySwitch({ on, label, note, onToggle }: { on: boolean; label: string; note: string; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="profile-switch" onClick={onToggle}>
      <span className="profile-switch__copy">
        <span className="profile-switch__label">{label}</span>
        <span className="profile-switch__note">{note}</span>
      </span>
      <span className={on ? 'profile-switch__track is-on' : 'profile-switch__track'} aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

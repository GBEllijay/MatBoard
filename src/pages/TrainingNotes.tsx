import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayExitMark } from '../components/PlayExitMark';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { NOTES_LEAD, TRAINING_NOTES_LABEL } from '../lib/coachCopy';
import {
  CLOSING_MAX,
  COACH_NAME_MAX,
  COOLDOWN_NOTE_MAX,
  INTRO_MAX,
  MAX_TECHNIQUES,
  MIN_TECHNIQUES,
  TECHNIQUE_NOTES_MAX,
  TECHNIQUE_TITLE_MAX,
  WARMUP_NOTE_MAX,
  addTechnique,
  loadTrainingNotes,
  removeTechnique,
  saveTrainingNotes,
  type TechniqueBlock,
  type TrainingNotesPlan,
} from '../lib/trainingNotesStore';

export function TrainingNotesPage() {
  const navigate = useNavigate();
  const parent = useToolboxParent();
  const [plan, setPlan] = useState(loadTrainingNotes);

  const commit = (next: TrainingNotesPlan) => {
    setPlan(saveTrainingNotes(next));
  };

  const patchTechnique = (id: string, patch: Partial<TechniqueBlock>) => {
    commit({
      ...plan,
      techniques: plan.techniques.map((tech) => (tech.id === id ? { ...tech, ...patch } : tech)),
    });
  };

  const atMax = plan.techniques.length >= MAX_TECHNIQUES;

  return (
    <main className="notes">
      <PlayExitMark
        to={parent.path}
        onExit={() => {
          navigate(parent.path);
        }}
      />
      <header className="notes__bar">
        <div className="notes__brand">
          <p className="notes__eyebrow">{parent.eyebrow}</p>
          <h1>{TRAINING_NOTES_LABEL}</h1>
        </div>
      </header>
      <p className="notes__lead">{NOTES_LEAD}</p>

      <div className="notes__plan">
        <section className="notes__card">
          <label className="notes__field" htmlFor="notes-coach">
            Coach name
            <input
              id="notes-coach"
              value={plan.coachName}
              maxLength={COACH_NAME_MAX}
              autoComplete="name"
              placeholder="Whose class this is"
              onChange={(event) => commit({ ...plan, coachName: event.target.value })}
            />
          </label>
          <label className="notes__field" htmlFor="notes-intro">
            Intro
            <textarea
              id="notes-intro"
              value={plan.intro}
              rows={4}
              maxLength={INTRO_MAX}
              placeholder="Announcements or a brief description of today's plan"
              onChange={(event) => commit({ ...plan, intro: event.target.value })}
            />
          </label>
        </section>

        <NoteSection
          id="notes-warmup"
          title="Warm-up"
          label="Special note"
          value={plan.warmupNote}
          maxLength={WARMUP_NOTE_MAX}
          placeholder="Sprawls, hard cardio, add push-ups"
          onChange={(warmupNote) => commit({ ...plan, warmupNote })}
        />

        {plan.techniques.map((tech, index) => (
          <TechniqueBlockView
            key={tech.id}
            index={index}
            tech={tech}
            canRemove={index >= MIN_TECHNIQUES}
            onChange={(patch) => patchTechnique(tech.id, patch)}
            onRemove={() => commit(removeTechnique(plan, tech.id))}
          />
        ))}

        <button
          type="button"
          className="btn notes__add"
          disabled={atMax}
          onClick={() => commit(addTechnique(plan))}
        >
          + Add another
        </button>

        <NoteSection
          id="notes-cooldown"
          title="Cool down"
          label="Special note"
          value={plan.cooldownNote}
          maxLength={COOLDOWN_NOTE_MAX}
          placeholder="Anything special for cool-down today"
          onChange={(cooldownNote) => commit({ ...plan, cooldownNote })}
        />

        <section className="notes__card">
          <label className="notes__field" htmlFor="notes-closing">
            Closing
            <textarea
              id="notes-closing"
              value={plan.closing}
              rows={4}
              maxLength={CLOSING_MAX}
              placeholder="Seminar date, promotion party, schedule changes"
              onChange={(event) => commit({ ...plan, closing: event.target.value })}
            />
          </label>
        </section>
      </div>
    </main>
  );
}

function NoteSection({
  id,
  title,
  label,
  value,
  maxLength,
  placeholder,
  onChange,
}: {
  id: string;
  title: string;
  label: string;
  value: string;
  maxLength: number;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="notes__card" aria-labelledby={`${id}-title`}>
      <div className="notes__section-head">
        <h2 id={`${id}-title`}>{title}</h2>
        <label className="notes__kicker" htmlFor={id}>
          {label}
        </label>
      </div>
      <textarea
        id={id}
        className="notes__area"
        value={value}
        rows={3}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </section>
  );
}

function TechniqueBlockView({
  index,
  tech,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  tech: TechniqueBlock;
  canRemove: boolean;
  onChange: (patch: Partial<TechniqueBlock>) => void;
  onRemove: () => void;
}) {
  const number = index + 1;
  const titleId = `notes-tech-${tech.id}`;
  const notesId = `notes-tech-notes-${tech.id}`;
  return (
    <div className="notes__block">
      <section className="notes__card" aria-labelledby={`notes-tech-heading-${tech.id}`}>
        <div className="notes__section-head">
          <h2 id={`notes-tech-heading-${tech.id}`}>Technique / Drill {number}</h2>
          {canRemove ? (
            <button type="button" className="btn btn--ghost notes__remove" onClick={onRemove}>
              Remove
            </button>
          ) : null}
        </div>
        <label className="notes__field" htmlFor={titleId}>
          Title
          <input
            id={titleId}
            value={tech.title}
            maxLength={TECHNIQUE_TITLE_MAX}
            placeholder="Drop seoi nage"
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>
        <label className="notes__field" htmlFor={notesId}>
          Notes
          <textarea
            id={notesId}
            value={tech.notes}
            rows={4}
            maxLength={TECHNIQUE_NOTES_MAX}
            placeholder="Stance, grips, turn, throw…"
            onChange={(event) => onChange({ notes: event.target.value })}
          />
        </label>
      </section>
      <button
        type="button"
        className={tech.waterBreak ? 'notes__break notes__break--on' : 'notes__break'}
        role="switch"
        aria-checked={tech.waterBreak}
        aria-label={`Water break after Technique / Drill ${number}`}
        onClick={() => onChange({ waterBreak: !tech.waterBreak })}
      >
        <span className="notes__switch" aria-hidden="true" />
        <span className="notes__break-copy">
          <span className="notes__break-label">Water break</span>
          {tech.waterBreak ? (
            <span className="notes__break-hint">Before the next section</span>
          ) : null}
        </span>
        <span className="notes__break-state">{tech.waterBreak ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

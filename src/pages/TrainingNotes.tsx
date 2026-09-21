import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyHint } from '../components/EmptyHint';
import { PlayExitMark } from '../components/PlayExitMark';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { EMPTY_NOTES_BODY, EMPTY_NOTES_TITLE, NOTES_LEAD, TRAINING_NOTES_LABEL } from '../lib/coachCopy';
import {
  TRAINING_NOTES_MAX,
  loadTrainingNotes,
  saveTrainingNotes,
} from '../lib/trainingNotesStore';

export function TrainingNotesPage() {
  const navigate = useNavigate();
  const parent = useToolboxParent();
  const [text, setText] = useState(loadTrainingNotes);

  const commit = (next: string) => {
    setText(saveTrainingNotes(next));
  };

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
      {!text.trim() ? <EmptyHint title={EMPTY_NOTES_TITLE} body={EMPTY_NOTES_BODY} /> : null}
      <label className="notes__field">
        Notes
        <textarea
          value={text}
          onChange={(event) => commit(event.target.value)}
          rows={16}
          maxLength={TRAINING_NOTES_MAX}
          placeholder="Warm-up, techniques, positional rounds…"
          aria-label={TRAINING_NOTES_LABEL}
        />
        <span className="notes__count">
          {text.trim().length}/{TRAINING_NOTES_MAX}
        </span>
      </label>
    </main>
  );
}

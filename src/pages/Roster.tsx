import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayExitMark } from '../components/PlayExitMark';
import { RankChip } from '../components/RankChip';
import { Sheet } from '../components/Sheet';
import { useRosterState } from '../hooks/useStores';
import {
  ADULT_BELTS,
  KIDS_BELTS,
  NOTE_MAX,
  addStudent,
  isKnownBelt,
  draftFromStudent,
  emptyDraft,
  formatPromotion,
  removeStudent,
  searchStudents,
  updateStudent,
  type Student,
  type StudentDraft,
} from '../lib/rosterStore';

export function RosterPage() {
  const roster = useRosterState();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ id: string | null; draft: StudentDraft } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const students = useMemo(
    () => (query.trim() ? searchStudents(roster.students, query) : roster.students),
    [query, roster.students],
  );

  return (
    <main className="roster">
      <PlayExitMark
        onExit={() => {
          navigate('/');
        }}
      />
      <header className="roster__bar">
        <div className="roster__brand">
          <p className="roster__eyebrow">Owner’s Toolbox</p>
          <h1>Roster</h1>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setEditor({ id: null, draft: emptyDraft() })}
        >
          Add student
        </button>
      </header>

      <p className="roster__lead">
        Gym names and belt ranks for this device. Pick them into Match and Mock Tournament — notes
        and last promotion stay here.
      </p>

      <label className="roster__search">
        Find
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or belt"
          aria-label="Find student"
          autoComplete="off"
        />
      </label>

      {students.length ? (
        <ul className="roster__list">
          {students.map((student) => (
            <StudentCard
              key={student.id}
              student={student}
              pending={pendingRemove === student.id}
              onEdit={() => setEditor({ id: student.id, draft: draftFromStudent(student) })}
              onAskRemove={() => setPendingRemove(student.id)}
              onCancelRemove={() => setPendingRemove(null)}
              onConfirmRemove={() => {
                removeStudent(student.id);
                setPendingRemove(null);
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="roster__empty">
          {roster.students.length
            ? 'No match on this roster.'
            : 'No students yet. Add a name and belt, then pick them into a match or bracket.'}
        </p>
      )}

      <StudentEditor
        open={Boolean(editor)}
        title={editor?.id ? 'Edit student' : 'Add student'}
        draft={editor?.draft ?? emptyDraft()}
        onChange={(draft) => setEditor((current) => (current ? { ...current, draft } : current))}
        onClose={() => setEditor(null)}
        onSave={() => {
          if (!editor) return;
          const saved = editor.id ? updateStudent(editor.id, editor.draft) : addStudent(editor.draft);
          if (saved) setEditor(null);
        }}
      />
    </main>
  );
}

function StudentCard({
  student,
  pending,
  onEdit,
  onAskRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  student: Student;
  pending: boolean;
  onEdit: () => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
}) {
  const promoted = formatPromotion(student.lastPromotion);

  return (
    <li>
      <article className="roster-card">
        <header className="roster-card__head">
          <h2>{student.name}</h2>
          <RankChip belt={student.belt} />
        </header>
        {promoted ? <p className="roster-card__meta">Last promotion {promoted}</p> : null}
        {student.note ? <p className="roster-card__note">{student.note}</p> : null}
        {pending ? (
          <div className="roster-card__actions">
            <span className="roster-card__confirm">Remove {student.name}?</span>
            <button type="button" className="btn" onClick={onConfirmRemove}>
              Yes, remove
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCancelRemove}>
              Keep
            </button>
          </div>
        ) : (
          <div className="roster-card__actions">
            <button type="button" className="btn" onClick={onEdit}>
              Edit
            </button>
            <button type="button" className="btn btn--ghost" onClick={onAskRemove}>
              Remove
            </button>
          </div>
        )}
      </article>
    </li>
  );
}

function StudentEditor({
  open,
  title,
  draft,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  draft: StudentDraft;
  onChange: (draft: StudentDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const ready = Boolean(draft.name.trim() && draft.belt.trim());
  const patch = (partial: Partial<StudentDraft>) => onChange({ ...draft, ...partial });

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <p className="roster-edit__copy">
        Fat-thumb card for this gym. Name and belt are enough to prefill a match. Notes stay off the
        scoreboard.
      </p>
      <label>
        Name
        <input
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder="Required"
          aria-label="Student name"
          autoComplete="off"
        />
      </label>
      <fieldset className="roster-edit__belts">
        <legend>Belt rank</legend>
        <p className="roster-edit__hint">Required to pick this student into Match or a bracket.</p>
        <div className="presets roster-edit__belt-row" role="radiogroup" aria-label="Adult belts">
          {ADULT_BELTS.map((belt) => (
            <button
              key={belt}
              type="button"
              role="radio"
              aria-checked={draft.belt === belt}
              className={`preset${draft.belt === belt ? ' preset--on' : ''}`}
              onClick={() => patch({ belt })}
            >
              {belt}
            </button>
          ))}
        </div>
        <div className="presets roster-edit__belt-row" role="radiogroup" aria-label="Kids belts">
          {KIDS_BELTS.map((belt) => (
            <button
              key={belt}
              type="button"
              role="radio"
              aria-checked={draft.belt === belt}
              className={`preset${draft.belt === belt ? ' preset--on' : ''}`}
              onClick={() => patch({ belt })}
            >
              {belt}
            </button>
          ))}
        </div>
        <label>
          Other belt
          <input
            value={isKnownBelt(draft.belt) ? '' : draft.belt}
            onChange={(event) => patch({ belt: event.target.value })}
            placeholder="Optional — type a custom rank"
            aria-label="Other belt"
          />
        </label>
      </fieldset>
      <label>
        Last promotion
        <input
          type="date"
          value={draft.lastPromotion}
          onChange={(event) => patch({ lastPromotion: event.target.value })}
          aria-label="Last promotion"
        />
      </label>
      <label>
        Short note
        <textarea
          value={draft.note}
          onChange={(event) => patch({ note: event.target.value })}
          placeholder="Optional — stays on this card"
          rows={3}
          maxLength={NOTE_MAX}
          aria-label="Short note"
        />
        <span className="roster-edit__count">
          {draft.note.trim().length}/{NOTE_MAX}
        </span>
      </label>
      {!ready ? <p className="roster-edit__error">Add a name and a belt to save.</p> : null}
      <button type="button" className="btn" disabled={!ready} onClick={onSave}>
        Save student
      </button>
    </Sheet>
  );
}

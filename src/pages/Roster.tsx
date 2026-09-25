import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyHint } from '../components/EmptyHint';
import { PlayExitMark } from '../components/PlayExitMark';
import { useCoachPageSwipe } from '../hooks/useCoachSwipe';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { RankChip } from '../components/RankChip';
import { Sheet } from '../components/Sheet';
import { useRosterState } from '../hooks/useStores';
import { COMPETITOR_SYSTEM_NAME } from '../lib/productNames';
import {
  COMPETITOR_ROSTER_LABEL,
  EMPTY_ROSTER_BODY,
  EMPTY_ROSTER_SEARCH,
  EMPTY_ROSTER_TITLE,
  ROSTER_CSV_DEVICE_NOTE,
  ROSTER_CSV_INSTRUCTIONS,
  ROSTER_CSV_PRO_TEASER,
  ROSTER_LEAD_COACH,
  ROSTER_LEAD_PRO,
  rosterCsvAvailable,
} from '../lib/coachCopy';
import {
  formatRosterCsvSummary,
  importRosterCsvFile,
  isSpreadsheetWorkbook,
  rosterCsvTemplate,
  serializeRosterCsv,
  withUtf8Bom,
} from '../lib/rosterCsv';
import { readGymName } from '../lib/gymName';
import {
  ADULT_BELTS,
  KIDS_BELTS,
  NOTE_MAX,
  addStudent,
  addStudents,
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

function downloadRosterCsv(filename: string, csv: string): void {
  const blob = new Blob([withUtf8Bom(csv)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function RosterPage() {
  const roster = useRosterState();
  const navigate = useNavigate();
  const parent = useToolboxParent();
  const proUnlocked = useProUnlocked();
  const coachUnlocked = useCoachUnlocked();
  useCoachPageSwipe();
  const [searchParams] = useSearchParams();
  const coachRoster =
    searchParams.get('from') === 'coach' || (coachUnlocked && !proUnlocked);
  const showCsv = rosterCsvAvailable(proUnlocked, coachRoster);
  const fromSuite = searchParams.get('from') === 'suite';
  const fromCompetitors = searchParams.get('from') === 'competitors';
  const exitPath = coachRoster
    ? '/coach'
    : fromCompetitors
      ? '/competitors'
      : fromSuite
        ? '/suite'
        : parent.path;
  const csvRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ id: string | null; draft: StudentDraft } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [csvNote, setCsvNote] = useState('');
  const competitors = useMemo(
    () => (query.trim() ? searchStudents(roster.students, query) : roster.students),
    [query, roster.students],
  );
  const openAdd = () => setEditor({ id: null, draft: { ...emptyDraft(), gym: readGymName() } });

  const onImportFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (isSpreadsheetWorkbook(file)) {
      setCsvNote('That looks like an Excel workbook. Save it as a CSV, then import.');
      return;
    }
    void importRosterCsvFile(file)
      .then((result) => {
        if (result.error) {
          setCsvNote(result.error);
          return;
        }
        addStudents(result.students);
        setCsvNote(formatRosterCsvSummary(result.imported, result.skipped, result.skippedDetail));
      })
      .catch(() => {
        setCsvNote('Could not read that file. Save it as a CSV and try again.');
      });
  };

  const csvTools = (
    <div className="roster__csv">
      <div className="roster__csv-bar">
        <div className="roster__csv-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => downloadRosterCsv('advantage-roster-template.csv', rosterCsvTemplate())}
          >
            Download template
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => csvRef.current?.click()}>
            Import CSV
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => downloadRosterCsv('advantage-roster.csv', serializeRosterCsv(roster.students))}
          >
            Export CSV
          </button>
        </div>
        <CsvInstructions />
      </div>
      <p className="roster__csv-hint">{ROSTER_CSV_DEVICE_NOTE}</p>
      {csvNote ? (
        <p className="roster__csv-summary" role="status">
          {csvNote}
        </p>
      ) : null}
      <input
        ref={csvRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        hidden
        aria-label="Import roster CSV"
        onChange={(event) => {
          onImportFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );

  return (
    <main className={coachRoster ? 'roster roster--coach' : 'roster'}>
      <PlayExitMark
        to={exitPath}
        onExit={() => {
          navigate(exitPath);
        }}
      />
      <header className="roster__bar">
        <div className="roster__brand">
          <p className="roster__eyebrow">
            {coachRoster ? 'Advantage Coach' : fromCompetitors ? COMPETITOR_SYSTEM_NAME : parent.eyebrow}
          </p>
          <h1>{COMPETITOR_ROSTER_LABEL}</h1>
        </div>
        {coachRoster ? null : (
          <button type="button" className="btn" onClick={openAdd}>
            Add competitor
          </button>
        )}
      </header>

      <p className="roster__lead">{coachRoster ? ROSTER_LEAD_COACH : ROSTER_LEAD_PRO}</p>

      {coachRoster ? (
        <div className="roster__add">
          <button type="button" className="btn" onClick={openAdd}>
            Add Competitor
          </button>
        </div>
      ) : null}

      {showCsv ? csvTools : null}

      {roster.students.length ? (
      <label className="roster__search">
        Find
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, belt, or division"
          aria-label="Find competitor"
          autoComplete="off"
        />
      </label>
      ) : null}

      {competitors.length ? (
        <ul className="roster__list">
          {competitors.map((competitor) => (
            <StudentCard
              key={competitor.id}
              student={competitor}
              pending={pendingRemove === competitor.id}
              onEdit={() => setEditor({ id: competitor.id, draft: draftFromStudent(competitor) })}
              onAskRemove={() => setPendingRemove(competitor.id)}
              onCancelRemove={() => setPendingRemove(null)}
              onConfirmRemove={() => {
                removeStudent(competitor.id);
                setPendingRemove(null);
              }}
            />
          ))}
        </ul>
      ) : (
        <EmptyHint
          title={roster.students.length ? 'No match' : EMPTY_ROSTER_TITLE}
          body={roster.students.length ? EMPTY_ROSTER_SEARCH : EMPTY_ROSTER_BODY}
          action={
            roster.students.length || coachRoster ? undefined : (
              <button type="button" className="btn" onClick={openAdd}>
                Add competitor
              </button>
            )
          }
        />
      )}

      {coachRoster ? (
        <div className="roster__csv">
          <p className="roster__csv-hint">{ROSTER_CSV_PRO_TEASER}</p>
        </div>
      ) : null}

      <StudentEditor
        open={Boolean(editor)}
        title={editor?.id ? 'Edit competitor' : 'Add competitor'}
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

function CsvInstructions() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const open = pinned || hover;

  useEffect(() => {
    if (!pinned) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPinned(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  return (
    <div
      className="roster__instructions"
      ref={rootRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        className="roster__instructions-btn"
        aria-expanded={open}
        aria-controls="roster-csv-instructions"
        onClick={() => setPinned((value) => !value)}
      >
        Instructions
      </button>
      {open ? (
        <p id="roster-csv-instructions" className="roster__instructions-pop" role="tooltip">
          {ROSTER_CSV_INSTRUCTIONS}
        </p>
      ) : null}
    </div>
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
        {student.division ? <p className="roster-card__meta">{student.division}</p> : null}
        {student.gym ? <p className="roster-card__meta">{student.gym}</p> : null}
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
        Name and belt are enough to prefill a match. Division is optional and stays on this card.
        Gym name is optional and shows on the scoreboard and brackets. A new competitor starts with
        the Media Console gym name when one is saved. Notes stay on this card.
      </p>
      <label>
        Name
        <input
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder="Required"
          aria-label="Competitor name"
          autoComplete="off"
        />
      </label>
      <fieldset className="roster-edit__belts">
        <legend>Belt rank</legend>
        <p className="roster-edit__hint">Required to pick this competitor into Match or a bracket.</p>
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
        Division
        <input
          value={draft.division}
          onChange={(event) => patch({ division: event.target.value })}
          placeholder="Adult Blue, Kids Gi — optional"
          aria-label="Division"
          autoComplete="off"
        />
      </label>
      <label>
        Gym name
        <input
          value={draft.gym}
          onChange={(event) => patch({ gym: event.target.value })}
          placeholder="School or academy — optional"
          aria-label="Gym name"
          autoComplete="off"
        />
      </label>
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
        Save competitor
      </button>
    </Sheet>
  );
}

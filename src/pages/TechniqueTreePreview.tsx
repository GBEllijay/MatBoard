import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PlayExitMark } from '../components/PlayExitMark';
import { JOURNAL_NOTES_LABEL, formatJournalDate } from '../lib/journalCopy';
import {
  PREVIEW_VIEWS,
  RATING_WORDS,
  TECHNIQUE_TREE_PREVIEW_BANNER,
  attachLesson,
  beltCoverage,
  coreMoves,
  coresOnPosition,
  entryContext,
  findEntry,
  formatRatingAverage,
  fundamentalsChecklist,
  loadPreviewState,
  logJournal,
  matchIndex,
  normalizeTechniqueName,
  positionHubs,
  previewBackTarget,
  previewView,
  ratingWord,
  removeJournal,
  removeLesson,
  saveIndexEntry,
  savePreviewState,
  seedPreview,
  setLessonFundamentals,
  variationsOf,
  type BeltCoverage,
  type IndexEntry,
  type JournalRating,
  type MoveKind,
  type PreviewState,
  type PreviewView,
} from '../lib/techniqueTreePreview';
import './techniqueTreePreview.css';

const RATINGS = [1, 2, 3, 4, 5] as const;

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function saveReason(reason: 'blank' | 'duplicate' | 'missing-position' | 'missing-parent' | 'bad-parent'): string {
  if (reason === 'blank') return 'Type a technique name.';
  if (reason === 'duplicate') return 'That name is already in the index. Attach the existing entry.';
  if (reason === 'missing-position') return 'Choose a position hub.';
  if (reason === 'missing-parent') return 'Choose the core move this variation hangs from.';
  return 'A variation hangs from a core move, not from another variation.';
}

function journalReason(reason: 'bad-rating' | 'unknown-index' | 'unknown-student' | 'not-a-move'): string {
  if (reason === 'bad-rating') return 'Choose a rating from poorly to really well.';
  if (reason === 'not-a-move') return 'Pick a move or a variation. Position hubs stay on the index.';
  if (reason === 'unknown-student') return 'Choose a sample student.';
  return 'That technique is not in the index.';
}

export function TechniqueTreePreviewPage() {
  const [params, setParams] = useSearchParams();
  const view = previewView(params.get('view'));
  const backTo = previewBackTarget(params.get('from'));
  const [state, setState] = useState(() => loadPreviewState(browserStorage()));
  const [status, setStatus] = useState('');
  const [storeNote, setStoreNote] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [epoch, setEpoch] = useState(0);

  const commit = (next: PreviewState, message: string) => {
    const saved = savePreviewState(browserStorage(), next);
    setState(next);
    setStatus(message);
    setStoreNote(saved ? '' : 'This browser could not store the preview. It stays on this screen until you leave.');
  };

  const restore = () => {
    commit(seedPreview(), 'Sample class restored.');
    setConfirmReset(false);
    setEpoch((value) => value + 1);
  };

  const openView = (next: PreviewView) => {
    const query = new URLSearchParams(params);
    query.set('view', next);
    setParams(query, { replace: true });
  };

  const counts = useMemo(() => {
    const cores = state.entries.filter((entry) => entry.kind === 'core').length;
    const hubs = state.entries.filter((entry) => entry.kind === 'position').length;
    return `${hubs} position hubs · ${cores} core moves`;
  }, [state.entries]);

  return (
    <main className="ttp">
      <PlayExitMark to={backTo} />
      <p className="ttp-banner" role="note">
        {TECHNIQUE_TREE_PREVIEW_BANNER}
      </p>
      <div className="ttp-shell">
        <header className="ttp-head">
          <p className="ttp-kicker">Advantage</p>
          <h1>Technique tree</h1>
          <p className="ttp-lead">
            One sample index for the class, the journal, and belt coverage. {counts}.
          </p>
          <div className="ttp-head__row">
            <button type="button" className="ttp-btn" onClick={() => setConfirmReset(true)}>
              Reset to sample class
            </button>
          </div>
          {confirmReset ? (
            <div className="ttp-confirm" role="group" aria-label="Reset the sample class">
              <p>Restore the sample class? New index entries, lesson lines, and journal ratings on this phone go back to the seed.</p>
              <div className="ttp-actions">
                <button type="button" className="ttp-btn--primary" onClick={restore}>
                  Restore sample
                </button>
                <button type="button" className="ttp-btn" onClick={() => setConfirmReset(false)}>
                  Keep my edits
                </button>
              </div>
            </div>
          ) : null}
        </header>

        {status ? (
          <p className="ttp-status" role="status">
            {status}
          </p>
        ) : null}
        {storeNote ? (
          <p className="ttp-alert" role="alert">
            {storeNote}
          </p>
        ) : null}

        <div className="ttp-tabs" role="tablist" aria-label="Technique tree preview">
          {PREVIEW_VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`ttp-tab-${item.id}`}
              className={view === item.id ? 'ttp-tab is-on' : 'ttp-tab'}
              aria-selected={view === item.id}
              aria-controls={`ttp-panel-${item.id}`}
              onClick={() => openView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div key={epoch} role="tabpanel" id={`ttp-panel-${view}`} aria-labelledby={`ttp-tab-${view}`}>
          {view === 'index' ? <IndexView entries={state.entries} /> : null}
          {view === 'lesson' ? <LessonView state={state} commit={commit} /> : null}
          {view === 'journal' ? <JournalView state={state} commit={commit} onBelts={() => openView('belts')} /> : null}
          {view === 'belts' ? <BeltView state={state} /> : null}
        </div>
      </div>
    </main>
  );
}

function IndexView({ entries }: { entries: IndexEntry[] }) {
  const [mode, setMode] = useState<'position' | 'move'>('position');
  const [query, setQuery] = useState('');
  const [positionId, setPositionId] = useState('pos-mount');
  const hubs = positionHubs(entries);
  const needle = normalizeTechniqueName(query);
  const hits = needle ? matchIndex(entries, query) : [];
  const visibleHubs = hubs.filter((hub) => {
    if (!needle) return true;
    if (hits.some((hit) => hit.id === hub.id)) return true;
    return coresOnPosition(entries, hub.id).some(
      (core) =>
        hits.some((hit) => hit.id === core.id) ||
        variationsOf(entries, core.id, hub.id).some((item) => hits.some((hit) => hit.id === item.id)),
    );
  });
  const activeHub = visibleHubs.some((hub) => hub.id === positionId) ? positionId : (visibleHubs[0]?.id ?? positionId);
  const cores =
    mode === 'position'
      ? coresOnPosition(entries, activeHub).filter((core) => branchVisible(entries, core, hits, needle, activeHub))
      : coreMoves(entries).filter((core) => branchVisible(entries, core, hits, needle));

  return (
    <div className="ttp-stack">
      <section className="ttp-card">
        <label className="ttp-field">
          <span>Search by name</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Armbar, mount, triangle"
            aria-label="Search the index by name"
          />
        </label>
        <div className="ttp-actions" role="group" aria-label="Browse the index">
          <button type="button" className={mode === 'position' ? 'ttp-choice is-on' : 'ttp-choice'} aria-pressed={mode === 'position'} onClick={() => setMode('position')}>
            By position
          </button>
          <button type="button" className={mode === 'move' ? 'ttp-choice is-on' : 'ttp-choice'} aria-pressed={mode === 'move'} onClick={() => setMode('move')}>
            By move
          </button>
        </div>
        {needle ? <p className="ttp-quiet">{hits.length === 0 ? 'No index entry matches that name.' : `${hits.length} match${hits.length === 1 ? '' : 'es'}.`}</p> : null}
      </section>

      <div className={mode === 'position' ? 'ttp-index' : undefined}>
        {mode === 'position' ? (
          <div className="ttp-hubs" role="group" aria-label="Position hubs">
            {visibleHubs.map((hub) => (
              <button
                key={hub.id}
                type="button"
                className={hub.id === activeHub ? 'ttp-chip is-on' : 'ttp-chip'}
                aria-pressed={hub.id === activeHub}
                onClick={() => setPositionId(hub.id)}
              >
                {hub.name}
              </button>
            ))}
          </div>
        ) : null}
        {cores.length === 0 ? (
          <p className="ttp-quiet">Nothing in this view matches that name.</p>
        ) : (
          <ul className="ttp-tree" aria-label={mode === 'position' ? 'Techniques from this position' : 'Core moves and variations'}>
            {cores.map((core) => {
              const variations = variationsOf(entries, core.id, mode === 'position' ? activeHub : undefined).filter(
                (item) => !needle || hits.some((hit) => hit.id === item.id || hit.id === core.id),
              );
              return (
                <li key={core.id}>
                  <article className="ttp-node ttp-node--core">
                    <span className="ttp-node__kind">Core move</span>
                    <strong>{core.name}</strong>
                    <small>{entryContext(entries, core)}</small>
                  </article>
                  {variations.length === 0 ? null : (
                    <ul>
                      {variations.map((item) => (
                        <li key={item.id}>
                          <article className="ttp-node ttp-node--var">
                            <span className="ttp-node__kind">Variation</span>
                            <strong>{item.name}</strong>
                            <small>{entryContext(entries, item)}</small>
                          </article>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function branchVisible(
  entries: IndexEntry[],
  core: IndexEntry,
  hits: IndexEntry[],
  needle: string,
  positionId?: string,
): boolean {
  if (!needle) return true;
  if (hits.some((hit) => hit.id === core.id)) return true;
  return variationsOf(entries, core.id, positionId).some((item) => hits.some((hit) => hit.id === item.id));
}

function LessonView({ state, commit }: { state: PreviewState; commit: (next: PreviewState, message: string) => void }) {
  const [query, setQuery] = useState('');
  const [fundamentals, setFundamentals] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<MoveKind>('core');
  const [positionId, setPositionId] = useState('pos-mount');
  const [parentId, setParentId] = useState('core-armbar');
  const [error, setError] = useState('');
  const hits = normalizeTechniqueName(query) ? matchIndex(state.entries, query) : [];
  const checklist = fundamentalsChecklist(state);
  const hubs = positionHubs(state.entries);
  const cores = coreMoves(state.entries);

  const attach = (entry: IndexEntry) => {
    if (entry.kind === 'position') {
      setError(`${entry.name} is a position hub. Pick a move that sprouts from it.`);
      return;
    }
    const result = attachLesson(state, { indexId: entry.id, fundamentals });
    if (!result.ok) {
      setError(result.reason === 'not-a-move' ? 'Pick a move or a variation.' : 'That technique is not in the index.');
      return;
    }
    setError('');
    commit(
      result.state,
      fundamentals
        ? `${entry.name} is on this lesson and on the fundamentals list.`
        : `${entry.name} is on this lesson.`,
    );
  };

  const saveNew = () => {
    const created = saveIndexEntry(state, {
      name,
      kind,
      positionId,
      parentId: kind === 'variation' ? parentId : null,
    });
    if (!created.ok) {
      setError(saveReason(created.reason));
      return;
    }
    const attached = attachLesson(created.state, { indexId: created.entry.id, fundamentals });
    if (!attached.ok) {
      commit(created.state, `${created.entry.name} is in the index.`);
      setError('Saved to the index, but it could not be added to the lesson.');
      return;
    }
    setError('');
    setSaving(false);
    setQuery('');
    setName('');
    commit(
      attached.state,
      fundamentals
        ? `${created.entry.name} is in the index, on this lesson, and on the fundamentals list.`
        : `${created.entry.name} is in the index and on this lesson.`,
    );
  };

  return (
    <div className="ttp-lesson">
      <section className="ttp-card">
        <h2>Add to today’s class</h2>
        <p className="ttp-quiet">Type a technique. Tap a match to attach it. A new name can be saved into the same index.</p>
        <label className="ttp-field">
          <span>Technique name</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setName(event.target.value);
              setError('');
            }}
            placeholder="Spinning armbar"
            aria-label="Technique name"
          />
        </label>
        <button
          type="button"
          className={fundamentals ? 'ttp-toggle is-on' : 'ttp-toggle'}
          aria-pressed={fundamentals}
          onClick={() => setFundamentals((value) => !value)}
        >
          <span className="ttp-toggle__box" aria-hidden="true" />
          Add to fundamentals list
        </button>
        {hits.length ? (
          <ul className="ttp-hits" aria-label="Matching index entries">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button type="button" className="ttp-hit" onClick={() => attach(hit)}>
                  <strong>{hit.name}</strong>
                  <small>{entryContext(state.entries, hit)}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {normalizeTechniqueName(query) && hits.length === 0 ? <p className="ttp-quiet">No index entry matches that name.</p> : null}
        <button
          type="button"
          className="ttp-text"
          onClick={() => {
            setSaving((value) => !value);
            setName(query);
          }}
        >
          {saving ? 'Close new entry' : 'Save a new index entry'}
        </button>
        {saving ? (
          <div className="ttp-card">
            <label className="ttp-field">
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} aria-label="New index entry name" />
            </label>
            <div className="ttp-actions" role="group" aria-label="Kind of index entry">
              <button type="button" className={kind === 'core' ? 'ttp-choice is-on' : 'ttp-choice'} aria-pressed={kind === 'core'} onClick={() => setKind('core')}>
                Core move
              </button>
              <button type="button" className={kind === 'variation' ? 'ttp-choice is-on' : 'ttp-choice'} aria-pressed={kind === 'variation'} onClick={() => setKind('variation')}>
                Variation
              </button>
            </div>
            <label className="ttp-field">
              <span>Position hub</span>
              <select value={positionId} aria-label="Position hub" onChange={(event) => setPositionId(event.target.value)}>
                {hubs.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.name}
                  </option>
                ))}
              </select>
            </label>
            {kind === 'variation' ? (
              <label className="ttp-field">
                <span>Hangs from</span>
                <select value={parentId} aria-label="Parent core move" onChange={(event) => setParentId(event.target.value)}>
                  {cores.map((core) => (
                    <option key={core.id} value={core.id}>
                      {core.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button type="button" className="ttp-btn--primary" onClick={saveNew}>
              Save into the index and add to this lesson
            </button>
          </div>
        ) : null}
        {error ? (
          <p className="ttp-alert" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <div className="ttp-stack">
        <section className="ttp-card">
          <h2>This lesson</h2>
          {state.lessons.length === 0 ? <p className="ttp-quiet">Nothing attached yet.</p> : null}
          <ul className="ttp-lines" aria-label="Lesson techniques">
            {state.lessons.map((lesson) => {
              const entry = findEntry(state.entries, lesson.indexId);
              if (!entry) return null;
              return (
                <li key={lesson.id} className="ttp-line">
                  <strong>{entry.name}</strong>
                  <small>{entryContext(state.entries, entry)}</small>
                  <button
                    type="button"
                    className={lesson.fundamentals ? 'ttp-toggle is-on' : 'ttp-toggle'}
                    aria-pressed={lesson.fundamentals}
                    onClick={() =>
                      commit(
                        setLessonFundamentals(state, lesson.id, !lesson.fundamentals),
                        lesson.fundamentals
                          ? `${entry.name} left the fundamentals list.`
                          : `${entry.name} is on the fundamentals list.`,
                      )
                    }
                  >
                    <span className="ttp-toggle__box" aria-hidden="true" />
                    Add to fundamentals list
                  </button>
                  <button
                    type="button"
                    className="ttp-text"
                    onClick={() => commit(removeLesson(state, lesson.id), `${entry.name} left this lesson.`)}
                  >
                    Remove {entry.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="ttp-card">
          <h2>Fundamentals list</h2>
          <p className="ttp-quiet">First pass through a curriculum. These marks stay on the shared index entry.</p>
          {checklist.length === 0 ? <p className="ttp-quiet">Nothing is on the fundamentals list yet.</p> : null}
          <ul className="ttp-lines" aria-label="Fundamentals checklist">
            {checklist.map((entry) => (
              <li key={entry.id} className="ttp-line">
                <strong>{entry.name}</strong>
                <small>{entryContext(state.entries, entry)}</small>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function JournalView({
  state,
  commit,
  onBelts,
}: {
  state: PreviewState;
  commit: (next: PreviewState, message: string) => void;
  onBelts: () => void;
}) {
  const [studentId, setStudentId] = useState(state.students[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState('');
  const [rating, setRating] = useState<JournalRating | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const student = state.students.find((item) => item.id === studentId) ?? state.students[0];
  const hits = normalizeTechniqueName(query) ? matchIndex(state.entries, query) : [];
  const picked = pickedId ? findEntry(state.entries, pickedId) : null;
  const mine = state.journal.filter((entry) => entry.studentId === student?.id).slice().reverse();

  const save = () => {
    if (!student) {
      setError('Choose a sample student.');
      return;
    }
    if (!picked || picked.kind === 'position') {
      setError('Pick a technique from the index.');
      return;
    }
    if (!rating) {
      setError('Choose a rating from poorly to really well.');
      return;
    }
    const result = logJournal(state, { studentId: student.id, indexId: picked.id, rating, note });
    if (!result.ok) {
      setError(journalReason(result.reason));
      return;
    }
    setError('');
    setNote('');
    setRating(null);
    setPickedId('');
    setQuery('');
    commit(
      result.state,
      `${picked.name} is on ${student.name}'s journal at ${ratingWord(rating).toLowerCase()}. Belt coverage uses this same index entry.`,
    );
  };

  return (
    <div className="ttp-stack">
      <section className="ttp-card">
        <h2>Log a drilled technique</h2>
        <p className="ttp-quiet">Same index as the lesson plan. The rating is Advantage chrome. Notes stay on the paper.</p>
        <StudentSwitch
          students={state.students}
          belts={state.belts}
          value={student?.id ?? ''}
          onChange={(id) => {
            setStudentId(id);
            setError('');
          }}
        />
        <label className="ttp-field">
          <span>Technique</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPickedId('');
              setError('');
            }}
            placeholder="Search the index"
            aria-label="Search techniques to log"
          />
        </label>
        {picked ? <p className="ttp-quiet">Selected: {picked.name}. {entryContext(state.entries, picked)}.</p> : null}
        {hits.length ? (
          <ul className="ttp-hits" aria-label="Index matches">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className={hit.id === pickedId ? 'ttp-hit is-on' : 'ttp-hit'}
                  aria-pressed={hit.id === pickedId}
                  onClick={() => {
                    if (hit.kind === 'position') {
                      setError(`${hit.name} is a position hub. Pick a move under it.`);
                      setPickedId('');
                      return;
                    }
                    setPickedId(hit.id);
                    setQuery(hit.name);
                    setError('');
                  }}
                >
                  <strong>{hit.name}</strong>
                  <small>{entryContext(state.entries, hit)}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="ttp-rate" role="group" aria-label="How it went, from poorly to really well">
          {RATINGS.map((value) => (
            <button
              key={value}
              type="button"
              className={rating === value ? 'ttp-rate__tap is-on' : 'ttp-rate__tap'}
              aria-pressed={rating === value}
              aria-label={`${value} ${RATING_WORDS[value]}`}
              onClick={() => setRating(value)}
            >
              <span className="ttp-rate__num">{value}</span>
              <span className="ttp-rate__word">{RATING_WORDS[value]}</span>
            </button>
          ))}
        </div>
        <label className="ttp-paper">
          <span className="ttp-paper__label">{JOURNAL_NOTES_LABEL}</span>
          <span className="ttp-quiet">Optional. The rating stays on the controls above.</span>
          <textarea
            className="ttp-paper__sheet"
            value={note}
            rows={4}
            maxLength={400}
            aria-label={JOURNAL_NOTES_LABEL}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {error ? (
          <p className="ttp-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div className="ttp-actions">
          <button type="button" className="ttp-btn--primary" onClick={save}>
            Save journal line
          </button>
          <button type="button" className="ttp-text" onClick={onBelts}>
            See belt coverage
          </button>
        </div>
      </section>

      <section className="ttp-card">
        <h2>{student ? `${student.name}'s lines` : 'Journal'}</h2>
        {mine.length === 0 ? <p className="ttp-quiet">No journal lines for this student yet.</p> : null}
        <ul className="ttp-lines" aria-label="Journal lines">
          {mine.map((entry) => {
            const technique = findEntry(state.entries, entry.indexId);
            return (
              <li key={entry.id} className="ttp-line">
                <strong>{technique?.name ?? 'Missing index entry'}</strong>
                <small>
                  {ratingWord(entry.rating)} ({entry.rating}) · {formatJournalDate(entry.loggedAt.slice(0, 10))}
                </small>
                {entry.note ? <small>{entry.note}</small> : null}
                <button
                  type="button"
                  className="ttp-text"
                  onClick={() =>
                    commit(removeJournal(state, entry.id), `${technique?.name ?? 'That line'} left the journal.`)
                  }
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function BeltView({ state }: { state: PreviewState }) {
  const [studentId, setStudentId] = useState(state.students[0]?.id ?? '');
  const student = state.students.find((item) => item.id === studentId) ?? state.students[0];
  return (
    <div className="ttp-stack">
      <section className="ttp-card">
        <h2>Belt coverage</h2>
        <p className="ttp-quiet">
          Each belt maps to index entries. Coverage comes from that student’s journal: logged, average, latest, and what is still missing.
          Kids belts are a stub. Brown and black are not in this draft.
        </p>
        <StudentSwitch students={state.students} belts={state.belts} value={student?.id ?? ''} onChange={setStudentId} />
      </section>
      {student
        ? state.belts.map((belt) => {
            const coverage = beltCoverage(state, student.id, belt.belt);
            if (!coverage) return null;
            return <BeltSection key={belt.belt} coverage={coverage} kids={belt.belt.startsWith('kids-')} />;
          })
        : null}
    </div>
  );
}

function BeltSection({ coverage, kids }: { coverage: BeltCoverage; kids: boolean }) {
  return (
    <details className="ttp-belt" data-belt={coverage.belt} open={coverage.currentBelt}>
      <summary>
        <span>
          <strong>
            {coverage.beltLabel}
            {coverage.currentBelt ? ' · this belt' : ''}
            {kids ? ' · stub' : ''}
          </strong>
          <small>
            {coverage.logged} of {coverage.total} logged
            {coverage.average == null ? '' : ` · average ${formatRatingAverage(coverage.average)}`}
          </small>
        </span>
      </summary>
      <div className="ttp-belt__body">
        <ul className="ttp-rows" aria-label={`${coverage.beltLabel} fundamentals`}>
          {coverage.rows.map((row) => (
            <li key={row.indexId} className={row.logged ? 'ttp-row' : 'ttp-row is-gap'}>
              <span>
                <strong>{row.name}</strong>
                <small>
                  {row.logged
                    ? `Latest ${ratingWord(row.latest ?? 0).toLowerCase()} (${row.latest}) · average ${formatRatingAverage(row.average)} · ${row.count} log${row.count === 1 ? '' : 's'}`
                    : 'Not logged'}
                  {row.onFundamentalsList ? ' · On the fundamentals list' : ''}
                </small>
              </span>
              <span className="ttp-row__tag">{row.logged ? 'Logged' : 'Gap'}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function StudentSwitch({
  students,
  belts,
  value,
  onChange,
}: {
  students: PreviewState['students'];
  belts: PreviewState['belts'];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="ttp-switch" role="group" aria-label="Sample student">
      {students.map((student) => {
        const label = belts.find((belt) => belt.belt === student.belt)?.label ?? student.belt;
        return (
          <button
            key={student.id}
            type="button"
            className={student.id === value ? 'is-on' : ''}
            aria-pressed={student.id === value}
            onClick={() => onChange(student.id)}
          >
            <strong>{student.name}</strong>
            <small>{label}</small>
          </button>
        );
      })}
    </div>
  );
}

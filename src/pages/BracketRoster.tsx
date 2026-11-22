import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SubmenuMarks } from '../components/TierHomeMark';
import { WhiteBeltPicker } from '../components/WhiteBeltPicker';
import { useBracketRosterState } from '../hooks/useStores';
import {
  BRACKET_ROSTER_MAX,
  BRACKET_ROSTER_SAMPLE_PATH,
  WHITE_BRACKETS_PATH,
  addBracketRosterEntry,
  emptyEntry,
  formatBracketRosterCsv,
  parseBracketRosterCsv,
  removeBracketRosterEntry,
  replaceBracketRoster,
  seedWhiteBracketFromRoster,
  updateBracketRosterEntry,
  type BracketRosterEntry,
} from '../lib/bracketRosterStore';

type Draft = Omit<BracketRosterEntry, 'id'>;

function downloadCsv(entries: readonly BracketRosterEntry[]) {
  const blob = new Blob([formatBracketRosterCsv(entries)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bracket-roster.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BracketRosterPage() {
  const roster = useBracketRosterState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(emptyEntry);
  const [addError, setAddError] = useState('');
  const [fileNote, setFileNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyEntry);
  const [editError, setEditError] = useState('');
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const addEntry = () => {
    const saved = addBracketRosterEntry(draft);
    if (!saved) {
      setAddError(
        roster.entries.length >= BRACKET_ROSTER_MAX
          ? `The Bracket Roster holds up to ${BRACKET_ROSTER_MAX} competitors.`
          : 'Enter a name. That name may already be on the list.',
      );
      return;
    }
    setDraft(emptyEntry());
    setAddError('');
    setFileNote('');
  };

  const startEdit = (entry: BracketRosterEntry) => {
    setEditingId(entry.id);
    setEditDraft({
      name: entry.name,
      gym: entry.gym,
      weight: entry.weight,
      division: entry.division,
      age: entry.age,
      rank: entry.rank,
    });
    setEditError('');
    setPendingRemove(null);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const saved = updateBracketRosterEntry(editingId, editDraft);
    if (!saved) {
      setEditError('Enter a name. That name may already be on the list.');
      return;
    }
    setEditingId(null);
    setEditError('');
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const raw = await file.text();
    const result = parseBracketRosterCsv(raw);
    if (result.error) {
      setFileNote(result.error);
      return;
    }
    if (!result.entries.length) {
      setFileNote('No named rows were in that file.');
      return;
    }
    replaceBracketRoster(result.entries);
    const bits = [`Loaded ${result.entries.length} competitor${result.entries.length === 1 ? '' : 's'}.`];
    if (result.skipped) bits.push(`Skipped ${result.skipped}.`);
    if (result.truncated) bits.push(`Kept the first ${result.entries.length}.`);
    setFileNote(bits.join(' '));
    setAddError('');
  };

  const loadSample = async () => {
    const response = await fetch(BRACKET_ROSTER_SAMPLE_PATH);
    if (!response.ok) {
      setFileNote('The sample file could not be loaded.');
      return;
    }
    const result = parseBracketRosterCsv(await response.text());
    if (result.error || !result.entries.length) {
      setFileNote(result.error ?? 'The sample file could not be read.');
      return;
    }
    replaceBracketRoster(result.entries);
    setFileNote(`Loaded ${result.entries.length} sample competitors.`);
  };

  const fillBracket = () => {
    const placed = seedWhiteBracketFromRoster();
    setFileNote(
      placed
        ? `Placed ${placed} competitor${placed === 1 ? '' : 's'} on the bracket.`
        : 'Add at least two names before filling a bracket.',
    );
  };

  return (
    <main className="white-roster bracket-roster">
      <SubmenuMarks to="/white" />
      <header className="white-roster__head">
        <p className="white-roster__eyebrow">Advantage White</p>
        <h1>Bracket Roster</h1>
      </header>
      <p className="white-roster__lead">
        Names for a mock tournament on this device. Gym name sits under the competitor name, the
        same way Competitor 1 is entered on the scoreboard. The list holds up to {BRACKET_ROSTER_MAX}{' '}
        people. Import or download a CSV with the header name,gym,weight,division,age,rank.
      </p>

      <div className="names-sheet bracket-roster__sheet">
        <div className="names-sheet__chrome">
          <div className="names-sheet__tabs">
            <span className="names-sheet__tab">bracket-roster.csv</span>
          </div>
          <div className="names-sheet__tools">
            <button type="button" className="names-sheet__tool names-sheet__tool--btn" onClick={() => fileRef.current?.click()}>
              Upload
            </button>
            <button
              type="button"
              className="names-sheet__tool names-sheet__tool--btn"
              onClick={() => downloadCsv(roster.entries)}
              disabled={!roster.entries.length}
            >
              Download
            </button>
            <a className="names-sheet__tool" href={BRACKET_ROSTER_SAMPLE_PATH} download="bracket-roster-sample.csv">
              Sample CSV
            </a>
          </div>
        </div>
        <div className="bracket-roster__sheet-scroll">
          <table className="names-sheet__grid">
            <thead>
              <tr>
                <th className="names-sheet__corner" />
                <th>A</th>
                <th>B</th>
                <th>C</th>
                <th>D</th>
                <th>E</th>
                <th>F</th>
              </tr>
            </thead>
            <tbody>
              <tr className="names-sheet__head-row">
                <th>1</th>
                <td>Name</td>
                <td>Gym</td>
                <td>Weight</td>
                <td>Division</td>
                <td>Age</td>
                <td>Rank</td>
              </tr>
              {(roster.entries.length ? roster.entries : [null]).map((entry, index) => (
                <tr key={entry?.id ?? 'empty'}>
                  <th>{index + 2}</th>
                  <td>{entry?.name ?? ''}</td>
                  <td>{entry?.gym ?? ''}</td>
                  <td>{entry?.weight ?? ''}</td>
                  <td>{entry?.division ?? ''}</td>
                  <td>{entry?.age ?? ''}</td>
                  <td>{entry?.rank ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        aria-label="Upload Bracket Roster CSV"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void importFile(file);
        }}
      />

      <div className="bracket-roster__files">
        <button type="button" className="btn btn--ghost" onClick={() => void loadSample()}>
          Load sample list
        </button>
        <Link className="btn" to={WHITE_BRACKETS_PATH} onClick={fillBracket}>
          Fill bracket
        </Link>
      </div>
      {fileNote ? <p className="white-roster__lead">{fileNote}</p> : null}

      <form
        className="white-roster__add bracket-roster__form"
        onSubmit={(event) => {
          event.preventDefault();
          addEntry();
        }}
      >
        <div className="bracket-roster__who">
          <label>
            Competitor name
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Name for the bracket"
              aria-label="Competitor name"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label>
            Gym
            <input
              value={draft.gym}
              onChange={(event) => setDraft((current) => ({ ...current, gym: event.target.value }))}
              placeholder="Optional"
              aria-label="Gym name"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="bracket-roster__meta">
          <label>
            Weight
            <input
              value={draft.weight}
              onChange={(event) => setDraft((current) => ({ ...current, weight: event.target.value }))}
              placeholder="Optional"
              aria-label="Weight"
              autoComplete="off"
            />
          </label>
          <label>
            Division
            <input
              value={draft.division}
              onChange={(event) => setDraft((current) => ({ ...current, division: event.target.value }))}
              placeholder="Optional"
              aria-label="Division"
              autoComplete="off"
            />
          </label>
          <label>
            Age
            <input
              value={draft.age}
              onChange={(event) => setDraft((current) => ({ ...current, age: event.target.value }))}
              placeholder="Optional"
              aria-label="Age"
              autoComplete="off"
              inputMode="numeric"
            />
          </label>
        </div>
        <WhiteBeltPicker belt={draft.rank} onBelt={(rank) => setDraft((current) => ({ ...current, rank }))} />
        <button type="submit" className="btn" disabled={roster.entries.length >= BRACKET_ROSTER_MAX}>
          Add to Bracket Roster
        </button>
        {roster.entries.length >= BRACKET_ROSTER_MAX ? (
          <p className="bracket-roster__full" role="status">
            Roster full (36)
          </p>
        ) : null}
        {addError ? <p className="roster-edit__error">{addError}</p> : null}
      </form>

      {roster.entries.length ? (
        <ul className="white-roster__list">
          {roster.entries.map((entry) => (
            <li key={entry.id} className="white-roster__item">
              {editingId === entry.id ? (
                <form
                  className="white-roster__edit bracket-roster__form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveEdit();
                  }}
                >
                  <div className="bracket-roster__who">
                    <label>
                      Competitor name
                      <input
                        value={editDraft.name}
                        onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))}
                        aria-label={`Edit ${entry.name}`}
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      Gym
                      <input
                        value={editDraft.gym}
                        onChange={(event) => setEditDraft((current) => ({ ...current, gym: event.target.value }))}
                        aria-label={`Edit gym for ${entry.name}`}
                        autoComplete="off"
                      />
                    </label>
                  </div>
                  <div className="bracket-roster__meta">
                    <label>
                      Weight
                      <input
                        value={editDraft.weight}
                        onChange={(event) => setEditDraft((current) => ({ ...current, weight: event.target.value }))}
                        aria-label={`Edit weight for ${entry.name}`}
                      />
                    </label>
                    <label>
                      Division
                      <input
                        value={editDraft.division}
                        onChange={(event) => setEditDraft((current) => ({ ...current, division: event.target.value }))}
                        aria-label={`Edit division for ${entry.name}`}
                      />
                    </label>
                    <label>
                      Age
                      <input
                        value={editDraft.age}
                        onChange={(event) => setEditDraft((current) => ({ ...current, age: event.target.value }))}
                        aria-label={`Edit age for ${entry.name}`}
                      />
                    </label>
                  </div>
                  <WhiteBeltPicker
                    belt={editDraft.rank}
                    onBelt={(rank) => setEditDraft((current) => ({ ...current, rank }))}
                  />
                  {editError ? <p className="roster-edit__error">{editError}</p> : null}
                  <div className="white-roster__actions">
                    <button type="submit" className="btn">
                      Save
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="white-roster__row">
                  <div className="white-roster__who bracket-roster__who-line">
                    <strong>{entry.name}</strong>
                    {entry.gym ? <span className="bracket-roster__gym">{entry.gym}</span> : null}
                    <span className="bracket-roster__bits">
                      {[entry.weight, entry.division, entry.age, entry.rank].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <div className="white-roster__actions">
                    <button type="button" className="btn btn--ghost" onClick={() => startEdit(entry)}>
                      Edit
                    </button>
                    {pendingRemove === entry.id ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          removeBracketRosterEntry(entry.id);
                          setPendingRemove(null);
                        }}
                      >
                        Confirm remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => {
                          setPendingRemove(entry.id);
                          setEditingId(null);
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="white-roster__empty">
          No competitors yet. Add a name, or upload a CSV, or load the sample list.
        </p>
      )}
    </main>
  );
}

import { useState } from 'react';
import { BeltTip } from '../components/BeltTip';
import { PlayExitMark } from '../components/PlayExitMark';
import { WhiteBeltPicker } from '../components/WhiteBeltPicker';
import { useWhiteRosterState } from '../hooks/useStores';
import {
  addWhiteMatchName,
  removeWhiteMatchName,
  updateWhiteMatchName,
} from '../lib/whiteRosterStore';

/**
 * Advantage White match names on this phone.
 * Coach may later unlock or share this list. This page does not open the Competitor Roster.
 */
export function WhiteRosterPage() {
  const roster = useWhiteRosterState();
  const [name, setName] = useState('');
  const [belt, setBelt] = useState('');
  const [addError, setAddError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBelt, setEditBelt] = useState('');
  const [editError, setEditError] = useState('');
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const addName = () => {
    const saved = addWhiteMatchName(name, belt);
    if (!saved) {
      setAddError('Enter a name and pick a belt.');
      return;
    }
    setName('');
    setBelt('');
    setAddError('');
  };

  const startEdit = (id: string, currentName: string, currentBelt: string) => {
    setEditingId(id);
    setEditName(currentName);
    setEditBelt(currentBelt);
    setEditError('');
    setPendingRemove(null);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const saved = updateWhiteMatchName(editingId, editName, editBelt);
    if (!saved) {
      setEditError('Enter a name and belt. That name may already be saved.');
      return;
    }
    setEditingId(null);
    setEditError('');
  };

  return (
    <main className="white-roster">
      <PlayExitMark to="/white" />
      <header className="white-roster__head">
        <p className="white-roster__eyebrow">Advantage White</p>
        <h1>Match names</h1>
      </header>
      <p className="white-roster__lead">
        Competitor names and belt ranks for the scoreboard. Saved on this phone only.
      </p>

      <form
        className="white-roster__add"
        onSubmit={(event) => {
          event.preventDefault();
          addName();
        }}
      >
        <label>
          Competitor name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name for a match"
            aria-label="Competitor name"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <WhiteBeltPicker belt={belt} onBelt={setBelt} />
        <button type="submit" className="btn">
          Add name
        </button>
        {addError ? <p className="roster-edit__error">{addError}</p> : null}
      </form>

      {roster.names.length ? (
        <ul className="white-roster__list">
          {roster.names.map((entry) => (
            <li key={entry.id} className="white-roster__item">
              {editingId === entry.id ? (
                <form
                  className="white-roster__edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveEdit();
                  }}
                >
                  <label>
                    Competitor name
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      aria-label={`Edit ${entry.name}`}
                      autoComplete="off"
                    />
                  </label>
                  <WhiteBeltPicker belt={editBelt} onBelt={setEditBelt} />
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
                  <div className="white-roster__who">
                    <BeltTip belt={entry.belt} />
                    <strong>{entry.name}</strong>
                  </div>
                  <div className="white-roster__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => startEdit(entry.id, entry.name, entry.belt)}
                    >
                      Edit
                    </button>
                    {pendingRemove === entry.id ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          removeWhiteMatchName(entry.id);
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
        <p className="white-roster__empty">No names yet. Add a competitor name and belt for the scoreboard.</p>
      )}
    </main>
  );
}

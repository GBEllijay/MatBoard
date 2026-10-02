import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useWhiteRosterState } from '../hooks/useStores';
import { clipName } from '../lib/rosterStore';
import {
  addWhiteMatchName,
  findWhiteMatchName,
  getWhiteRoster,
  searchWhiteMatchNames,
  whiteMatchPrefill,
  type WhiteMatchPrefill,
} from '../lib/whiteRosterStore';
import { BeltTip } from './BeltTip';
import { WhiteBeltPicker } from './WhiteBeltPicker';

type Props = {
  query: string;
  onQuery: (value: string) => void;
  saveOnPhone: boolean;
  onSaveOnPhone: (value: boolean) => void;
  belt: string;
  onBelt: (value: string) => void;
  onPick: (prefill: WhiteMatchPrefill) => void;
};

/**
 * Pick a White scoreboard name from this phone.
 * Coach may later unlock or share this list. This picker does not read the Competitor Roster.
 */
export function WhiteNamePicker({
  query,
  onQuery,
  saveOnPhone,
  onSaveOnPhone,
  belt,
  onBelt,
  onPick,
}: Props) {
  const roster = useWhiteRosterState();
  const matches = searchWhiteMatchNames(roster.names, query);
  const inputRef = useRef<HTMLInputElement>(null);
  const typed = clipName(query);
  const canUseTyped = Boolean(typed);
  const canSave = canUseTyped && Boolean(belt.trim());

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const useTypedName = () => {
    if (!typed) return;
    if (saveOnPhone) {
      const saved = addWhiteMatchName(typed, belt);
      if (!saved) return;
      onPick(whiteMatchPrefill(saved));
      return;
    }
    const existing = findWhiteMatchName(getWhiteRoster().names, typed);
    if (existing) {
      onPick(whiteMatchPrefill(existing));
      return;
    }
    onPick({ name: typed, belt: '', gym: '', division: '' });
  };

  return (
    <>
      <p className="roster-pick__copy">
        Type a competitor name or pick one saved on this phone. A belt rank is saved with the name.
      </p>
      <div className="roster-pick__manual">
        <label>
          Competitor name
          <input
            ref={inputRef}
            className="roster-pick__name"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Type a name"
            aria-label="Competitor name"
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              if (!canUseTyped) return;
              if (saveOnPhone && !canSave) return;
              event.preventDefault();
              useTypedName();
            }}
          />
        </label>
        <label className="toggle roster-pick__add">
          <input
            type="checkbox"
            checked={saveOnPhone}
            onChange={(event) => onSaveOnPhone(event.target.checked)}
          />
          Save name and belt on this phone
        </label>
        {saveOnPhone ? <WhiteBeltPicker belt={belt} onBelt={onBelt} /> : null}
        <button
          type="button"
          className="btn roster-pick__use"
          disabled={!canUseTyped || (saveOnPhone && !canSave)}
          onClick={useTypedName}
        >
          {saveOnPhone ? 'Save and use this name' : 'Use this name'}
        </button>
        {saveOnPhone && canUseTyped && !canSave ? (
          <p className="roster-edit__error">Pick a belt to save this name on this phone.</p>
        ) : null}
      </div>
      {matches.length ? (
        <ul className="roster-pick__list">
          {matches.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="roster-pick__row"
                onClick={() => onPick(whiteMatchPrefill(entry))}
              >
                <span>
                  <strong>{entry.name}</strong>
                  <BeltTip belt={entry.belt} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="roster-pick__empty">
          {roster.names.length
            ? 'No match on this phone. Use the name above, or save it.'
            : 'No names saved on this phone yet.'}
        </p>
      )}
      <Link className="text-link" to="/white/roster">
        Edit match names
      </Link>
    </>
  );
}

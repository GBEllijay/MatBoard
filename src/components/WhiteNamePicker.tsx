import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useBracketRosterState } from '../hooks/useStores';
import {
  BRACKET_ROSTER_MAX,
  WHITE_BRACKET_ROSTER_PATH,
  bracketRosterPrefill,
  findBracketRosterName,
  getBracketRoster,
  importWhiteMatchNamesOnce,
  searchBracketRoster,
  upsertBracketRosterName,
} from '../lib/bracketRosterStore';
import { clipName } from '../lib/rosterStore';
import { BeltTip } from './BeltTip';
import { WhiteBeltPicker } from './WhiteBeltPicker';

type Props = {
  query: string;
  onQuery: (value: string) => void;
  saveOnPhone: boolean;
  onSaveOnPhone: (value: boolean) => void;
  belt: string;
  onBelt: (value: string) => void;
  onPick: (prefill: { name: string; belt: string; gym: string; division: string }) => void;
};

/**
 * Pick a White scoreboard name from the Bracket Roster on this device.
 * Does not read the Coach/Pro Competitor Roster.
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
  importWhiteMatchNamesOnce();
  const roster = useBracketRosterState();
  const matches = searchBracketRoster(roster.entries, query);
  const inputRef = useRef<HTMLInputElement>(null);
  const typed = clipName(query);
  const canUseTyped = Boolean(typed);
  const canSave = canUseTyped && Boolean(belt.trim());
  const rosterFull =
    roster.entries.length >= BRACKET_ROSTER_MAX && !findBracketRosterName(roster.entries, typed);

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
      const saved = upsertBracketRosterName(typed, belt);
      if (!saved) return;
      onPick(bracketRosterPrefill(saved));
      return;
    }
    const existing = findBracketRosterName(getBracketRoster().entries, typed);
    if (existing) {
      onPick(bracketRosterPrefill(existing));
      return;
    }
    onPick({ name: typed, belt: '', gym: '', division: '' });
  };

  return (
    <>
      <p className="roster-pick__copy">
        Type a competitor name or pick one from your Bracket Roster. A belt rank is saved with the
        name.
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
          Save name and belt to the Bracket Roster
        </label>
        {saveOnPhone ? <WhiteBeltPicker belt={belt} onBelt={onBelt} /> : null}
        <button
          type="button"
          className="btn roster-pick__use"
          disabled={!canUseTyped || (saveOnPhone && (!canSave || rosterFull))}
          onClick={useTypedName}
        >
          {saveOnPhone ? 'Save and use this name' : 'Use this name'}
        </button>
        {saveOnPhone && canUseTyped && rosterFull ? (
          <p className="roster-edit__error">The Bracket Roster is full.</p>
        ) : saveOnPhone && canUseTyped && !canSave ? (
          <p className="roster-edit__error">Pick a belt to save this name on this device.</p>
        ) : null}
      </div>
      {matches.length ? (
        <ul className="roster-pick__list">
          {matches.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="roster-pick__row"
                onClick={() => onPick(bracketRosterPrefill(entry))}
              >
                <span>
                  <strong>{entry.name}</strong>
                  {entry.rank ? <BeltTip belt={entry.rank} /> : null}
                  {entry.gym ? <em className="roster-pick__division">{entry.gym}</em> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="roster-pick__empty">
          {roster.entries.length
            ? 'No match on this device. Use the name above, or save it.'
            : 'No names on the Bracket Roster yet.'}
        </p>
      )}
      <Link className="text-link" to={WHITE_BRACKET_ROSTER_PATH}>
        Edit Bracket Roster
      </Link>
    </>
  );
}

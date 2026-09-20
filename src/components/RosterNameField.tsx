import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useRosterState } from '../hooks/useStores';
import {
  ADULT_BELTS,
  KIDS_BELTS,
  confirmManualCompetitor,
  prefillFields,
  searchStudents,
  type RosterPrefill,
} from '../lib/rosterStore';
import { RankChip } from './RankChip';
import { Sheet } from './Sheet';

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onPrefill: (prefill: RosterPrefill) => void;
  placeholder?: string;
  ariaLabel?: string;
  compact?: boolean;
};

export function RosterNameField({
  id,
  value,
  onChange,
  onPrefill,
  placeholder,
  ariaLabel,
  compact = false,
}: Props) {
  const proUnlocked = useProUnlocked();
  const coachUnlocked = useCoachUnlocked();
  const unlocked = proUnlocked || coachUnlocked;
  const [pickOpen, setPickOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [addToRoster, setAddToRoster] = useState(false);
  const [belt, setBelt] = useState('');
  const skipFocusRef = useRef(false);

  const openPicker = () => {
    setQuery(value);
    setAddToRoster(false);
    setBelt('');
    setPickOpen(true);
  };

  const closePicker = () => {
    skipFocusRef.current = true;
    setPickOpen(false);
    setQuery('');
    setAddToRoster(false);
    setBelt('');
  };

  const pick = (prefill: RosterPrefill) => {
    onPrefill(prefill);
    closePicker();
  };

  const input = (
    <input
      id={id}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      readOnly={unlocked}
      inputMode={unlocked ? 'none' : undefined}
      aria-haspopup={unlocked ? 'dialog' : undefined}
      aria-expanded={unlocked ? pickOpen : undefined}
      onChange={unlocked ? undefined : (event) => onChange(event.target.value)}
      onFocus={() => {
        if (!unlocked) return;
        if (skipFocusRef.current) {
          skipFocusRef.current = false;
          return;
        }
        openPicker();
      }}
      onClick={() => {
        if (unlocked) openPicker();
      }}
    />
  );

  if (!unlocked) return input;

  return (
    <div className={`roster-field${compact ? ' roster-field--compact' : ''}`}>
      <div className="roster-field__row">{input}</div>
      <Sheet open={pickOpen} title="Pick a competitor" onClose={closePicker} stacked>
        <RosterPicker
          query={query}
          onQuery={setQuery}
          addToRoster={addToRoster}
          onAddToRoster={setAddToRoster}
          belt={belt}
          onBelt={setBelt}
          onPick={pick}
        />
      </Sheet>
    </div>
  );
}

function RosterPicker({
  query,
  onQuery,
  addToRoster,
  onAddToRoster,
  belt,
  onBelt,
  onPick,
}: {
  query: string;
  onQuery: (value: string) => void;
  addToRoster: boolean;
  onAddToRoster: (value: boolean) => void;
  belt: string;
  onBelt: (value: string) => void;
  onPick: (prefill: RosterPrefill) => void;
}) {
  const roster = useRosterState();
  const matches = searchStudents(roster.students, query);
  const inputRef = useRef<HTMLInputElement>(null);
  const typed = query.trim();
  const canUseTyped = Boolean(typed);
  const canAdd = canUseTyped && Boolean(belt.trim());

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const useTypedName = () => {
    const next = confirmManualCompetitor(query, { addToRoster, belt });
    if (!next) return;
    onPick(next);
  };

  return (
    <>
      <p className="roster-pick__copy">
        Type a name or pick one already on this device. Notes and last promotion stay on the roster
        card.
      </p>
      <div className="roster-pick__manual">
        <label>
          Competitor name
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Type a name not on the roster"
            aria-label="Competitor name"
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              if (!canUseTyped) return;
              if (addToRoster && !canAdd) return;
              event.preventDefault();
              useTypedName();
            }}
          />
        </label>
        <label className="toggle roster-pick__add">
          <input
            type="checkbox"
            checked={addToRoster}
            onChange={(event) => onAddToRoster(event.target.checked)}
          />
          Add Competitor to Roster?
        </label>
        {addToRoster ? (
          <fieldset className="roster-edit__belts">
            <legend>Belt rank</legend>
            <p className="roster-edit__hint">Needed to save this name on the local roster.</p>
            <div className="presets roster-edit__belt-row" role="radiogroup" aria-label="Adult belts">
              {ADULT_BELTS.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={belt === choice}
                  className={`preset${belt === choice ? ' preset--on' : ''}`}
                  onClick={() => onBelt(choice)}
                >
                  {choice}
                </button>
              ))}
            </div>
            <div className="presets roster-edit__belt-row" role="radiogroup" aria-label="Kids belts">
              {KIDS_BELTS.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={belt === choice}
                  className={`preset${belt === choice ? ' preset--on' : ''}`}
                  onClick={() => onBelt(choice)}
                >
                  {choice}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}
        <button
          type="button"
          className="btn roster-pick__use"
          disabled={!canUseTyped || (addToRoster && !canAdd)}
          onClick={useTypedName}
        >
          {addToRoster ? 'Use name and add to roster' : 'Use this name'}
        </button>
        {addToRoster && canUseTyped && !canAdd ? (
          <p className="roster-edit__error">Pick a belt to add this competitor to the roster.</p>
        ) : null}
      </div>
      {matches.length ? (
        <ul className="roster-pick__list">
          {matches.map((student) => {
            const prefill = prefillFields(student);
            if (!prefill) return null;
            return (
              <li key={student.id}>
                <button type="button" className="roster-pick__row" onClick={() => onPick(prefill)}>
                  <span>
                    <strong>{student.name}</strong>
                    <RankChip belt={student.belt} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="roster-pick__empty">
          {roster.students.length
            ? 'No match on this device. Use the name above, or add it to the roster.'
            : 'No competitors yet. Type a name above, or add them on Competitor roster.'}
        </p>
      )}
      <Link className="text-link" to="/roster">
        Open competitor roster
      </Link>
    </>
  );
}

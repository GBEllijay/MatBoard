import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useRosterState } from '../hooks/useStores';
import { prefillFields, searchStudents, type RosterPrefill } from '../lib/rosterStore';
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
  const unlocked = useProUnlocked();
  const roster = useRosterState();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [query, setQuery] = useState('');
  const suggestions = useMemo(
    () => (unlocked ? searchStudents(roster.students, value).slice(0, 6) : []),
    [unlocked, roster.students, value],
  );
  const showSuggest = unlocked && open && suggestions.length > 0 && value.trim().length > 0;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const pick = (prefill: RosterPrefill) => {
    onPrefill(prefill);
    setOpen(false);
    setPickOpen(false);
    setQuery('');
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
      aria-autocomplete={unlocked ? 'list' : undefined}
      aria-controls={showSuggest ? listId : undefined}
      aria-expanded={unlocked ? showSuggest : undefined}
      onFocus={() => setOpen(true)}
      onChange={(event) => {
        onChange(event.target.value);
        setOpen(true);
      }}
    />
  );

  if (!unlocked) return input;

  return (
    <div ref={rootRef} className={`roster-field${compact ? ' roster-field--compact' : ''}`}>
      <div className="roster-field__row">
        {input}
        <button
          type="button"
          className={`btn btn--ghost roster-field__pick${compact ? ' roster-field__pick--compact' : ''}`}
          onClick={() => setPickOpen(true)}
        >
          {compact ? 'Pick' : 'Roster'}
        </button>
      </div>
      {showSuggest ? (
        <ul id={listId} className="roster-field__suggest" role="listbox" aria-label="Roster matches">
          {suggestions.map((student) => {
            const prefill = prefillFields(student);
            if (!prefill) return null;
            return (
              <li key={student.id}>
                <button type="button" role="option" onClick={() => pick(prefill)}>
                  <strong>{student.name}</strong>
                  <RankChip belt={student.belt} compact />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Sheet open={pickOpen} title="Pick from roster" onClose={() => setPickOpen(false)} stacked>
        <RosterPicker query={query} onQuery={setQuery} onPick={pick} />
      </Sheet>
    </div>
  );
}

function RosterPicker({
  query,
  onQuery,
  onPick,
}: {
  query: string;
  onQuery: (value: string) => void;
  onPick: (prefill: RosterPrefill) => void;
}) {
  const roster = useRosterState();
  const matches = searchStudents(roster.students, query);

  return (
    <>
      <p className="roster-pick__copy">
        Name and belt only. Notes and last promotion stay on the roster card.
      </p>
      <label>
        Find student
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Name or belt"
          aria-label="Find student"
          autoComplete="off"
        />
      </label>
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
            ? 'No match on this device.'
            : 'No students yet. Add them on Roster, then pick a name here.'}
        </p>
      )}
      <Link className="text-link" to="/roster">
        Open Roster
      </Link>
    </>
  );
}

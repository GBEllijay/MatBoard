import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useRosterState } from '../hooks/useStores';
import {
  ADULT_BELTS,
  KIDS_BELTS,
  competitorCards,
  confirmManualCompetitor,
  prefillFields,
  searchStudents,
  studentRosterCards,
  type RosterPrefill,
} from '../lib/rosterStore';
import { COMPETITOR_ROSTER_LABEL, STUDENT_ROSTER_LABEL } from '../lib/coachCopy';
import { STUDENT_ROSTER_PATH } from '../lib/productNames';
import { RankChip } from './RankChip';
import { Sheet } from './Sheet';
import { WhiteNamePicker } from './WhiteNamePicker';

type NameList = 'competitor' | 'white' | 'student';

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onPrefill: (prefill: RosterPrefill) => void;
  placeholder?: string;
  ariaLabel?: string;
  compact?: boolean;
  /**
   * `white` is the Advantage White match-name list on this phone.
   * Pro scoreboards and suite brackets leave this as `competitor`.
   * Basic Coach Mock Tournament uses `student` and the Coach Student Roster.
   */
  names?: NameList;
};

export function RosterNameField({
  id,
  value,
  onChange,
  onPrefill,
  placeholder,
  ariaLabel,
  compact = false,
  names = 'competitor',
}: Props) {
  const proUnlocked = useProUnlocked();
  const coachUnlocked = useCoachUnlocked();
  const whiteNames = names === 'white';
  const studentNames = names === 'student';
  const unlocked = whiteNames || proUnlocked || coachUnlocked;
  const [pickOpen, setPickOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [addToRoster, setAddToRoster] = useState(false);
  const [belt, setBelt] = useState('');
  const [onKidsBoard, setOnKidsBoard] = useState(false);
  const skipFocusRef = useRef(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const pickedRef = useRef(false);
  const pickingRef = useRef(false);

  const openPicker = () => {
    setOnKidsBoard(Boolean(fieldRef.current?.closest('.tournament--kids')));
    setQuery(value);
    setAddToRoster(false);
    setBelt('');
    pickedRef.current = false;
    pickingRef.current = false;
    setPickOpen(true);
  };

  const closePicker = () => {
    skipFocusRef.current = true;
    if (!whiteNames && !pickedRef.current) onChange(query);
    // The sheet blurs its field as it closes. Swallow that blur so a cleared
    // query cannot wipe the name this close just stored.
    pickedRef.current = true;
    pickingRef.current = false;
    setPickOpen(false);
    setQuery('');
    setAddToRoster(false);
    setBelt('');
  };

  const pick = (prefill: RosterPrefill) => {
    pickedRef.current = true;
    onPrefill(prefill);
    closePicker();
  };

  const commitTyped = (name: string) => {
    pickedRef.current = true;
    onChange(name);
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
    <div ref={fieldRef} className={`roster-field${compact ? ' roster-field--compact' : ''}`}>
      <div className="roster-field__row">{input}</div>
      <Sheet
        open={pickOpen}
        title={studentNames ? 'Pick a student' : 'Pick a competitor'}
        onClose={closePicker}
        stacked
        portal
        className={`sheet--roster${onKidsBoard ? ' sheet--on-kids' : ''}`}
      >
        {whiteNames ? (
          <WhiteNamePicker
            query={query}
            onQuery={setQuery}
            saveOnPhone={addToRoster}
            onSaveOnPhone={setAddToRoster}
            belt={belt}
            onBelt={setBelt}
            onPick={pick}
          />
        ) : (
          <RosterPicker
            studentList={studentNames}
            query={query}
            onQuery={setQuery}
            addToRoster={addToRoster}
            onAddToRoster={setAddToRoster}
            belt={belt}
            onBelt={setBelt}
            onPick={pick}
            onCommitTyped={commitTyped}
            onKeepTyped={(name) => {
              if (pickedRef.current || pickingRef.current) return;
              onChange(name);
            }}
            onPicking={(active) => {
              pickingRef.current = active;
            }}
            holdCommit={() => pickingRef.current || pickedRef.current}
          />
        )}
      </Sheet>
    </div>
  );
}

function RosterPicker({
  studentList,
  query,
  onQuery,
  addToRoster,
  onAddToRoster,
  belt,
  onBelt,
  onPick,
  onCommitTyped,
  onKeepTyped,
  onPicking,
  holdCommit,
}: {
  studentList: boolean;
  query: string;
  onQuery: (value: string) => void;
  addToRoster: boolean;
  onAddToRoster: (value: boolean) => void;
  belt: string;
  onBelt: (value: string) => void;
  onPick: (prefill: RosterPrefill) => void;
  onCommitTyped: (name: string) => void;
  onKeepTyped: (name: string) => void;
  onPicking: (active: boolean) => void;
  holdCommit: () => boolean;
}) {
  const roster = useRosterState();
  const listed = studentList ? studentRosterCards(roster.students) : competitorCards(roster.students);
  const matches = searchStudents(listed, query);
  const inputRef = useRef<HTMLInputElement>(null);
  const typedRef = useRef(query);
  typedRef.current = query;
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

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const restoreTyped = (event: Event) => {
      if (event.target !== input) return;
      if (input.value === typedRef.current) return;
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      proto?.set?.call(input, typedRef.current);
    };
    // Capture on the window so this runs before React reads a dismissal `change`.
    window.addEventListener('change', restoreTyped, true);
    return () => window.removeEventListener('change', restoreTyped, true);
  }, []);

  const useTypedName = () => {
    if (!canUseTyped) return;
    if (addToRoster) {
      const next = confirmManualCompetitor(query, {
        addToRoster,
        belt,
        rosterList: studentList ? 'student' : undefined,
      });
      if (!next) return;
      onPick(next);
      return;
    }
    onCommitTyped(typedRef.current);
  };

  return (
    <>
      <p className="roster-pick__copy">
        Type a name or pick one already on this device. Division, notes, and last promotion date and
        detail stay on the roster card.
      </p>
      <div className="roster-pick__manual">
        <label>
          {studentList ? 'Student name' : 'Competitor name'}
          <input
            ref={inputRef}
            className="roster-pick__name"
            value={query}
            onChange={(event) => {
              if (event.nativeEvent.type === 'change') {
                const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                proto?.set?.call(event.currentTarget, typedRef.current);
                return;
              }
              typedRef.current = event.target.value;
              onQuery(event.target.value);
            }}
            onBlur={() => {
              if (holdCommit()) return;
              onKeepTyped(typedRef.current);
            }}
            placeholder="Type a name not on the roster"
            aria-label={studentList ? 'Student name' : 'Competitor name'}
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
          {studentList ? 'Add student to roster' : 'Add Competitor to Roster?'}
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
          <p className="roster-edit__error">
            {studentList
              ? 'Pick a belt to add this student to the roster.'
              : 'Pick a belt to add this competitor to the roster.'}
          </p>
        ) : null}
      </div>
      {matches.length ? (
        <ul className="roster-pick__list">
          {matches.map((student) => {
            const prefill = prefillFields(student);
            if (!prefill) return null;
            return (
              <li key={student.id}>
                <button
                  type="button"
                  className="roster-pick__row"
                  onPointerDown={() => onPicking(true)}
                  onPointerUp={() => onPicking(false)}
                  onPointerCancel={() => onPicking(false)}
                  onClick={() => onPick(prefill)}
                >
                  <span>
                    <strong>{student.name}</strong>
                    <RankChip belt={student.belt} />
                    {student.division ? <em className="roster-pick__division">{student.division}</em> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="roster-pick__empty">
          {listed.length
            ? 'No match on this device. Use the name above, or add it to the roster.'
            : studentList
              ? `No students yet. Type a name above, or add them on ${STUDENT_ROSTER_LABEL}.`
              : `No competitors yet. Type a name above, or add them on ${COMPETITOR_ROSTER_LABEL}.`}
        </p>
      )}
      {studentList ? (
        <Link className="text-link" to={STUDENT_ROSTER_PATH}>
          Open student roster
        </Link>
      ) : (
        <Link className="text-link" to="/roster?from=competitors">
          Open {COMPETITOR_ROSTER_LABEL}
        </Link>
      )}
    </>
  );
}

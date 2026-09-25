import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyHint } from '../components/EmptyHint';
import { PlayExitMark } from '../components/PlayExitMark';
import { RankChip } from '../components/RankChip';
import { useRosterState } from '../hooks/useStores';
import {
  COMPETITION_READY_LABEL,
  COMPETITION_READY_LEAD,
  EMPTY_ROSTER_SEARCH,
  EMPTY_ROSTER_TITLE,
} from '../lib/coachCopy';
import { COMPETITOR_SYSTEM_NAME } from '../lib/productNames';
import {
  READY_EXTRA_LABEL_MAX,
  READY_EXTRA_MAX,
  READY_NOTE_MAX,
  addReadyExtra,
  competitorReady,
  readyStatusLabel,
  removeReadyExtra,
  removeReadyItem,
  removedReadyItems,
  restoreReadyItem,
  searchStudents,
  setReadyExtra,
  setReadyFlag,
  setReadyNote,
  visibleReadyItems,
  type CompetitorReady,
  type Student,
} from '../lib/rosterStore';

export function CompetitionReadyPage() {
  const roster = useRosterState();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const selectedId = searchParams.get('id') ?? '';
  const selected = roster.students.find((row) => row.id === selectedId) ?? null;
  const exitPath = selected ? '/competition-ready' : '/competitors';
  const competitors = useMemo(
    () => (query.trim() ? searchStudents(roster.students, query) : roster.students),
    [query, roster.students],
  );

  return (
    <main className="roster ready">
      <PlayExitMark
        to={exitPath}
        onExit={() => {
          navigate(exitPath);
        }}
      />
      <header className="roster__bar">
        <div className="roster__brand">
          <p className="roster__eyebrow">{COMPETITOR_SYSTEM_NAME}</p>
          <h1>{selected ? selected.name : COMPETITION_READY_LABEL}</h1>
        </div>
        {selected ? <RankChip belt={selected.belt} /> : null}
      </header>

      {selected ? (
        <Checklist key={selected.id} student={selected} />
      ) : (
        <>
          <p className="roster__lead">{COMPETITION_READY_LEAD}</p>
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
                <li key={competitor.id}>
                  <CompetitorPick competitor={competitor} ready={competitorReady(competitor.id, roster)} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint
              title={roster.students.length ? 'No match' : EMPTY_ROSTER_TITLE}
              body={
                roster.students.length
                  ? EMPTY_ROSTER_SEARCH
                  : 'Add a name and belt on Competitor Roster, then open their checklist here.'
              }
              action={
                roster.students.length ? undefined : (
                  <Link className="btn" to="/roster?from=competitors">
                    Competitor Roster
                  </Link>
                )
              }
            />
          )}
        </>
      )}
    </main>
  );
}

function CompetitorPick({ competitor, ready }: { competitor: Student; ready: CompetitorReady }) {
  const label = readyStatusLabel(ready);
  const complete = label === 'Ready';
  return (
    <Link
      className={`roster-card ready-pick${complete ? ' ready-pick--on' : ''}`}
      to={`/competition-ready?id=${encodeURIComponent(competitor.id)}`}
    >
      <header className="roster-card__head">
        <h2>{competitor.name}</h2>
        <RankChip belt={competitor.belt} />
      </header>
      {competitor.division ? <p className="roster-card__meta">{competitor.division}</p> : null}
      <p className={`ready-pick__status${complete ? ' ready-pick__status--on' : ''}`}>{label}</p>
    </Link>
  );
}

function Checklist({ student }: { student: Student }) {
  const roster = useRosterState();
  const ready = competitorReady(student.id, roster);
  const [note, setNote] = useState(ready.note);
  const [extraLabel, setExtraLabel] = useState('');
  const atExtraMax = ready.extras.length >= READY_EXTRA_MAX;
  const visible = visibleReadyItems(ready);
  const removed = removedReadyItems(ready);

  return (
    <>
      <p className="roster__lead">{COMPETITION_READY_LEAD}</p>
      <p
        className={`ready-division${readyStatusLabel(ready) === 'Ready' ? ' ready-division--on' : ''}`}
      >
        {readyStatusLabel(ready)}
        {student.division ? ` · Roster division: ${student.division}` : ' · No division on the roster card yet'}
      </p>
      {student.knownInjuries ? (
        <p className="ready-injuries">Known injuries: {student.knownInjuries}</p>
      ) : null}
      {visible.length || ready.extras.length ? (
        <ul className="ready-list">
          {visible.map((item) => (
            <ReadyRow
              key={item.id}
              label={item.label}
              on={ready.flags[item.id]}
              onToggle={() => setReadyFlag(student.id, item.id, !ready.flags[item.id])}
              onRemove={() => removeReadyItem(student.id, item.id)}
            />
          ))}
          {ready.extras.map((extra) => (
            <ReadyRow
              key={extra.id}
              label={extra.label}
              on={extra.on}
              onToggle={() => setReadyExtra(student.id, extra.id, !extra.on)}
              onRemove={() => removeReadyExtra(student.id, extra.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="ready-empty">Nothing left on this list.</p>
      )}
      {removed.length ? (
        <div className="ready-restore">
          <p>Removed from this list</p>
          {removed.map((item) => (
            <button
              key={item.id}
              type="button"
              className="btn btn--ghost"
              onClick={() => restoreReadyItem(student.id, item.id)}
            >
              Put back {item.label}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="ready-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (atExtraMax) return;
          const added = addReadyExtra(student.id, extraLabel);
          if (added) setExtraLabel('');
        }}
      >
        <label>
          Custom item
          <input
            value={extraLabel}
            maxLength={READY_EXTRA_LABEL_MAX}
            placeholder="Optional — one more thing"
            aria-label="Custom item"
            autoComplete="off"
            onChange={(event) => setExtraLabel(event.target.value)}
          />
        </label>
        <button type="submit" className="btn" disabled={atExtraMax || !extraLabel.trim()}>
          Add item
        </button>
        {atExtraMax ? <p className="ready-add__hint">Three custom items is the limit.</p> : null}
      </form>
      <label className="ready-note">
        Weekend note
        <textarea
          value={note}
          rows={3}
          maxLength={READY_NOTE_MAX}
          placeholder="Optional — stays with this checklist"
          aria-label="Weekend note"
          onChange={(event) => {
            const next = event.target.value.slice(0, READY_NOTE_MAX);
            setNote(next);
            setReadyNote(student.id, next);
          }}
        />
      </label>
      <div className="ready-back">
        <Link className="btn btn--ghost" to="/competition-ready">
          All competitors
        </Link>
      </div>
    </>
  );
}

function ReadyRow({
  label,
  on,
  onToggle,
  onRemove,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  return (
    <li className={`ready-row${on ? ' ready-row--on' : ''}`}>
      <span className="ready-row__label">{label}</span>
      <button
        type="button"
        className={`btn ready-row__toggle${on ? '' : ' btn--ghost'}`}
        aria-pressed={on}
        aria-label={`${label}, ${on ? 'On' : 'Off'}`}
        onClick={onToggle}
      >
        {on ? 'On' : 'Off'}
      </button>
      {onRemove ? (
        <button
          type="button"
          className="btn btn--ghost ready-row__remove"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          Remove
        </button>
      ) : null}
    </li>
  );
}

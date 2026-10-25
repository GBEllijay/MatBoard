import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FUNDAMENTAL_LEVELS,
  FUNDAMENTAL_RESISTANCE_FILTER,
  filterFundamentalRows,
  fundamentalResistanceCount,
  formatFundamentalUpdated,
  fundamentalLevelLabel,
  moveLinks,
  proficiencySummary,
  sortFundamentalRows,
  type FundamentalFilter,
  type FundamentalLevel,
  type FundamentalSort,
} from '../../lib/fundamentals';
import { loadFilms } from '../../lib/studentFilm';
import {
  addCustomFundamental,
  fundamentalsBoard,
  hideFundamental,
  loadStudentReport,
  renameFundamental,
  restoreStarterFundamentals,
  setFundamentalLevel,
  setFundamentalNote,
  type FundamentalRow,
} from '../../lib/studentEdition';
import { withStarterRubric } from '../../lib/studentTools';
import { StudentMarks, useStudentFile, useStudentPath } from './chrome';
import './fundamentals.css';

const SORTS: { id: FundamentalSort; label: string }[] = [
  { id: 'list', label: 'List order' },
  { id: 'weakest', label: 'Weakest first' },
  { id: 'recent', label: 'Recently updated' },
];

const FILTERS: { id: FundamentalFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'not-started', label: 'Not started' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'live', label: FUNDAMENTAL_RESISTANCE_FILTER },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function FundamentalsPage() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  const [sort, setSort] = useState<FundamentalSort>('list');
  const [filter, setFilter] = useState<FundamentalFilter>('all');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [films] = useState(() => loadFilms(localStorage));
  useEffect(() => {
    const current = loadStudentReport(localStorage);
    const next = withStarterRubric(current);
    if (next !== current) commit(next);
  }, [commit]);

  const board = fundamentalsBoard(report);
  const summary = proficiencySummary(board.flatMap((category) => category.items));
  const clips = report.clips ?? [];

  return (
    <main className="student student-frame student--arena student--fundamentals">
      <StudentMarks />
      <div className="arena-scroll">
        <header className="arena-hero fund-hero">
          <h1>Fundamentals</h1>
          <p className="fund-score" aria-label={`Overall proficiency ${summary.average.toFixed(1)} of 5`}>
            {summary.average.toFixed(1)}
          </p>
          <p className="fund-score__caption">
            Average level · {fundamentalResistanceCount(summary.live, summary.moves)}
          </p>
          <Meter
            value={summary.average}
            label={`Overall proficiency bar, ${summary.average.toFixed(1)} of 5`}
          />
        </header>
        <div className="fund-stack">
          <nav className="fund-jumps" aria-label="Related student tools">
            <Link to={to('/student/self-assessment?from=fundamentals')}>Self-assessment</Link>
            <Link to={to('/student/rubric')}>Belt checkpoints</Link>
            <Link to={to('/student/videos')}>Video Library</Link>
          </nav>

          <section className="ink fund-picks" aria-label="Sort and filter">
            <div>
              <p id="fund-sort-label">Sort</p>
              <div className="fund-picks__row fund-picks__row--sort" role="group" aria-labelledby="fund-sort-label">
                {SORTS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={sort === option.id ? 'fund-pick is-on' : 'fund-pick'}
                    aria-pressed={sort === option.id}
                    onClick={() => setSort(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p id="fund-filter-label">Filter</p>
              <div className="fund-picks__row fund-picks__row--filter" role="group" aria-labelledby="fund-filter-label">
                {FILTERS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={filter === option.id ? 'fund-pick is-on' : 'fund-pick'}
                    aria-pressed={filter === option.id}
                    onClick={() => setFilter(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {board.map((category) => {
            const shown = sortFundamentalRows(filterFundamentalRows(category.items, filter), sort);
            const progress = proficiencySummary(category.items);
            return (
              <section key={category.id} className="ink fund-cat" aria-label={category.name}>
                <h2>{category.name}</h2>
                <p className="fund-cat__meta">
                  {fundamentalResistanceCount(progress.live, progress.moves)}
                </p>
                <Meter
                  value={progress.average}
                  label={`${category.name} proficiency, ${progress.average.toFixed(1)} of 5`}
                />
                {shown.length === 0 ? <p className="fund-empty">No moves in this filter.</p> : null}
                {shown.map((item) => (
                  <FundamentalLine
                    key={`${item.categoryId}-${item.catalogItemId || item.entryId}`}
                    item={item}
                    links={moveLinks({
                      item,
                      levels: report.rubric.levels,
                      belt: report.profile.belt,
                      clips,
                      films,
                      to,
                    })}
                    onLevel={(level, note, learnedOn) =>
                      commit(setFundamentalLevel(report, item, level, Date.now(), { note, learnedOn }))
                    }
                    onFields={(note, learnedOn) => commit(setFundamentalNote(report, item, note, learnedOn))}
                    onRename={(label) => commit(renameFundamental(report, item, label))}
                    onRemove={() => commit(hideFundamental(report, item))}
                  />
                ))}
                <CustomFundamental
                  categoryName={category.name}
                  onAdd={(name) => commit(addCustomFundamental(report, category.id, name))}
                />
              </section>
            );
          })}

          <div className="fund-restore">
            {confirmRestore ? (
              <div className="student-confirm" role="group" aria-label="Restore starter list">
                <p>Bring starter names back and show hidden starter techniques?</p>
                <button
                  type="button"
                  className="ink-btn ink-btn--save"
                  onClick={() => {
                    commit(restoreStarterFundamentals(report));
                    setConfirmRestore(false);
                  }}
                >
                  Confirm restore starter list
                </button>
                <button type="button" className="ink-btn" onClick={() => setConfirmRestore(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="ink-btn" onClick={() => setConfirmRestore(true)}>
                Restore starter list
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Meter({ value, label }: { value: number; label: string }) {
  const width = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div className="fund-meter" role="img" aria-label={label} data-value={value}>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.5 19.5l4.1-1.05L18.8 8.2 15.7 5.1 5.5 15.3 4.5 19.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13.4 7.4l3.1 3.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function FundamentalLine({
  item,
  links,
  onLevel,
  onFields,
  onRename,
  onRemove,
}: {
  item: FundamentalRow;
  links: { href: string; label: string }[];
  onLevel: (level: FundamentalLevel, note: string, learnedOn: string) => void;
  onFields: (note: string, learnedOn: string) => void;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const [date, setDate] = useState(item.learnedOn);
  const [note, setNote] = useState(item.note);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.label);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    setDate(item.learnedOn);
    setNote(item.note);
    setDraft(item.label);
  }, [item.learnedOn, item.note, item.label, item.level]);
  const updated = formatFundamentalUpdated(item.updatedAt);
  const saveName = () => {
    const next = draft.trim();
    if (next && next !== item.label) onRename(next);
    setEditing(false);
  };
  const saveFields = (nextNote: string, nextDate: string) => {
    const noteSame = nextNote.trim() === item.note;
    const dateSame = nextDate === item.learnedOn;
    if (DATE_RE.test(nextDate) && item.level < 3) {
      if (noteSame && dateSame) return;
      onLevel(3, nextNote, nextDate);
      return;
    }
    if (noteSame && dateSame) return;
    onFields(nextNote, nextDate);
  };
  return (
    <article className="fund-move">
      <div className="fund-move__top">
        {editing ? (
          <form
            className="fund-rename"
            onSubmit={(event) => {
              event.preventDefault();
              saveName();
            }}
          >
            <input
              aria-label={`New name for ${item.label}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className="ink-btn ink-btn--save">
              Save name
            </button>
          </form>
        ) : (
          <h3>{item.label}</h3>
        )}
        <div className="fund-move__tools">
          <button
            type="button"
            className="fund-icon"
            aria-label={editing ? `Close rename for ${item.label}` : `Rename ${item.label}`}
            onClick={() => setEditing((open) => !open)}
          >
            <PencilIcon />
          </button>
          <button type="button" className="fund-icon" aria-label={`Remove ${item.label}`} onClick={() => setConfirming(true)}>
            <CrossIcon />
          </button>
        </div>
      </div>
      {confirming ? (
        <div className="student-confirm" role="group" aria-label={`Remove ${item.label}`}>
          <span>Hide {item.label}? The level, notes, and journal cards stay.</span>
          <button type="button" className="ink-btn ink-btn--save" aria-label={`Confirm remove ${item.label}`} onClick={onRemove}>
            Remove
          </button>
          <button type="button" className="ink-btn" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      ) : null}
      <p className="fund-move__level">
        <strong>{item.level}</strong> {fundamentalLevelLabel(item.level)}
      </p>
      <div className="fund-track" role="radiogroup" aria-label={`${item.label} proficiency`}>
        <button
          type="button"
          role="radio"
          className={item.level === 0 ? 'fund-seg is-selected' : 'fund-seg'}
          aria-checked={item.level === 0}
          aria-label={`${item.label} 0 ${fundamentalLevelLabel(0)}`}
          onClick={() => onLevel(0, note, date)}
        >
          0
        </button>
        <div className="fund-track__bar">
          {FUNDAMENTAL_LEVELS.filter((step) => step.level > 0).map((step) => (
            <button
              key={step.level}
              type="button"
              role="radio"
              className={item.level >= step.level ? 'fund-seg is-filled' : 'fund-seg'}
              aria-checked={item.level === step.level}
              aria-label={`${item.label} ${step.level} ${step.label}`}
              onClick={() => onLevel(step.level, note, date)}
            >
              {step.level}
            </button>
          ))}
        </div>
      </div>
      <p className="fund-move__updated">{updated ? `Updated ${updated}` : 'Not updated yet'}</p>
      {links.length ? (
        <div className="fund-move__links">
          {links.map((link) => (
            <Link key={link.href} to={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="fund-move__fields">
        <label>
          <span>Note</span>
          <input
            aria-label={`${item.label} note`}
            value={note}
            placeholder="Optional note"
            onChange={(event) => setNote(event.target.value)}
            onBlur={(event) => saveFields(event.target.value, date)}
          />
        </label>
        <label>
          <span>Date learned</span>
          <input
            type="date"
            aria-label={`${item.label} date learned`}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            onBlur={(event) => saveFields(note, event.target.value)}
          />
        </label>
      </div>
    </article>
  );
}

function CustomFundamental({ categoryName, onAdd }: { categoryName: string; onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <form
      className="student-add"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onAdd(name);
        setName('');
      }}
    >
      <input
        aria-label={`Add your own to ${categoryName}`}
        value={name}
        placeholder="Add your own"
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className="ink-btn ink-btn--save">
        Add
      </button>
    </form>
  );
}

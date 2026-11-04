import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { beltModeOf } from '../../lib/beltBook';
import {
  FUNDAMENTAL_LEVELS,
  FUNDAMENTAL_RESISTANCE_FILTER,
  KIDS_FUNDAMENTAL_LEVELS,
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
  type LevelAudience,
} from '../../lib/fundamentals';
import {
  ageIllegalTechniques,
  benchmarkView,
  catalogLevelMap,
  checkpointsForProgress,
} from '../../lib/studentBenchmarks';
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
import {
  beltLevel,
  checkpointState,
  checkpointTitle,
  showsAdultCheckpoints,
  withStarterRubric,
} from '../../lib/studentTools';
import { StudentMarks, useStudentFile, useStudentPath } from './chrome';
import './fundamentals.css';

const SORTS: { id: FundamentalSort; label: string }[] = [
  { id: 'list', label: 'List order' },
  { id: 'weakest', label: 'Weakest first' },
  { id: 'recent', label: 'Recently updated' },
];

function filterChoices(kids: boolean): { id: FundamentalFilter; label: string }[] {
  return [
    { id: 'all', label: 'All' },
    { id: 'not-started', label: kids ? 'Not yet' : 'Not started' },
    { id: 'in-progress', label: 'In progress' },
    { id: 'live', label: FUNDAMENTAL_RESISTANCE_FILTER },
  ];
}

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
  const kids = beltModeOf(report) === 'kids';
  const audience: LevelAudience = kids ? 'kids' : 'adult';
  const levels = kids ? KIDS_FUNDAMENTAL_LEVELS : FUNDAMENTAL_LEVELS;
  const illegal = ageIllegalTechniques(report);
  const summary = proficiencySummary(board.flatMap((category) => category.items));
  const clips = report.clips ?? [];
  const benchmarks = benchmarkRows(report);

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
            <Link
              className="fund-jump fund-jump--assess"
              data-testid="fund-jump-self-assessment"
              aria-label="Self-assessment"
              to={to('/student/self-assessment?from=fundamentals')}
            >
              <RadarIcon />
              <span className="fund-jump__text">
                <strong>Self-assessment</strong>
                <small>Rate your game on the radar</small>
              </span>
              <ChevronIcon />
            </Link>
            <BenchmarkChecklist rows={benchmarks} to={to} />
            <Link className="fund-jump" data-testid="fund-jump-videos" aria-label="Video Library" to={to('/student/videos')}>
              <PlayIcon />
              <span className="fund-jump__text">
                <strong>Video Library</strong>
                <small>Your clips and filmed moves</small>
              </span>
              <ChevronIcon />
            </Link>
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
                {filterChoices(kids).map((option) => (
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

          {illegal.length ? (
            <section className="ink" aria-label="Illegal for this age">
              <h2>Illegal for this age</h2>
              <ul>
                {illegal.map((row) => (
                  <li key={row.policy}>
                    {row.name}. {row.reason}
                  </li>
                ))}
              </ul>
              <p className="student-quiet">Hidden here until a coach or parent turns them on in Training.</p>
            </section>
          ) : null}

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
                    audience={audience}
                    levels={levels}
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

type BenchmarkRow = { id: string; name: string; done: boolean; partly: boolean };

/**
 * Read-only checklist view of this belt's practical benchmarks. Checking items
 * off still happens on the Belt progress page, with the same who-can-edit rules.
 */
function benchmarkRows(report: ReturnType<typeof useStudentFile>['report']): BenchmarkRow[] | null {
  if (!showsAdultCheckpoints(report)) return null;
  const level = beltLevel(report, report.profile.belt);
  const learned = catalogLevelMap(report);
  const rows = checkpointsForProgress(level?.checkpoints ?? [], benchmarkView(report));
  return rows.map((row) => {
    const state = checkpointState(row, learned);
    return { id: row.id, name: checkpointTitle(row), done: state === 'filled', partly: state === 'partly filled' };
  });
}

function BenchmarkChecklist({ rows, to }: { rows: BenchmarkRow[] | null; to: (path: string) => string }) {
  const done = rows ? rows.filter((row) => row.done).length : 0;
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 6;
  const visible = rows ? (showAll ? rows : rows.slice(0, LIMIT)) : [];
  return (
    <section className="fund-jump fund-jump--checklist" aria-label="Practical benchmarks checklist">
      <Link className="fund-jump__head" data-testid="fund-jump-benchmarks" aria-label="Practical benchmarks" to={to('/student/rubric')}>
        <ChecklistIcon />
        <span className="fund-jump__text">
          <strong>Practical benchmarks</strong>
          <small>{rows && rows.length ? `${done} of ${rows.length} done` : 'Open your belt checklist'}</small>
        </span>
        <ChevronIcon />
      </Link>
      {rows && rows.length ? (
        <>
          <div className="fund-meter fund-meter--check" role="img" aria-label={`${done} of ${rows.length} practical benchmarks done`}>
            <span style={{ width: `${(done / rows.length) * 100}%` }} />
          </div>
          <ul className="fund-checklist">
            {visible.map((row) => (
              <li key={row.id}>
                <Link
                  className={row.done ? 'fund-check is-done' : row.partly ? 'fund-check is-partly' : 'fund-check'}
                  to={to(`/student/rubric#${row.id}`)}
                  aria-label={`${row.name}, ${row.done ? 'done' : row.partly ? 'partly done' : 'not done'}`}
                >
                  <span className="fund-check__box" aria-hidden="true">
                    {row.done ? (
                      <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    ) : row.partly ? (
                      <svg viewBox="0 0 24 24"><path d="M7 12h10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                    ) : null}
                  </span>
                  <span className="fund-check__name">{row.name}</span>
                </Link>
              </li>
            ))}
          </ul>
          {rows.length > LIMIT ? (
            <button
              type="button"
              className="fund-chip-btn fund-check-more"
              aria-expanded={showAll}
              onClick={() => setShowAll((open) => !open)}
            >
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function RadarIcon() {
  const ring = (r: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return `${(24 + r * Math.cos(a)).toFixed(1)},${(24 + r * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
  return (
    <svg className="fund-jump__icon fund-radar" viewBox="0 0 48 48" aria-hidden="true" data-icon="radar">
      <polygon points={ring(20)} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" />
      <polygon points={ring(13)} fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      <polygon points={ring(6)} fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
      <polygon points="24,8 39,17 35,32 24,36 12,30 10,16" fill="#22d3ee" fillOpacity="0.35" stroke="#22d3ee" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg className="fund-jump__icon" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="8" y="9" width="9" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10 13.5l2.2 2.2L16 11" fill="none" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="8" y="27" width="9" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M22 13.5h18M22 31.5h18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="fund-jump__icon" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="11" width="36" height="26" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M21 18v12l10-6z" fill="#22d3ee" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="fund-chev" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Filled steps stay filled. Only the chosen level gets the selected ring. */
function segmentClass(level: FundamentalLevel, step: FundamentalLevel): string {
  const names = ['fund-seg'];
  if (step > 0 && level >= step) names.push('is-filled');
  if (level === step) names.push('is-selected');
  return names.join(' ');
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
  audience,
  levels,
  onLevel,
  onFields,
  onRename,
  onRemove,
}: {
  item: FundamentalRow;
  links: { href: string; label: string }[];
  audience: LevelAudience;
  levels: readonly { level: FundamentalLevel; label: string }[];
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
        <strong>{item.level}</strong> {fundamentalLevelLabel(item.level, audience)}
      </p>
      <div className="fund-track" role="radiogroup" aria-label={`${item.label} proficiency`}>
        <button
          type="button"
          role="radio"
          className={segmentClass(item.level, 0)}
          aria-checked={item.level === 0}
          data-selected={item.level === 0 ? 'yes' : 'no'}
          aria-label={`${item.label} 0 ${fundamentalLevelLabel(0, audience)}`}
          onClick={() => onLevel(0, note, date)}
        >
          0
        </button>
        <div className="fund-track__bar">
          {levels.filter((step) => step.level > 0).map((step) => {
            const selected = item.level === step.level;
            return (
              <button
                key={step.level}
                type="button"
                role="radio"
                className={segmentClass(item.level, step.level)}
                aria-checked={selected}
                data-selected={selected ? 'yes' : 'no'}
                aria-label={`${item.label} ${step.level} ${step.label}`}
                onClick={() => onLevel(step.level, note, date)}
              >
                {step.level}
              </button>
            );
          })}
        </div>
      </div>
      <p className="fund-move__updated">{updated ? `Updated ${updated}` : 'Not updated yet'}</p>
      {links.length ? (
        <div className="fund-move__links">
          {links.map((link) => (
            <Link key={link.href} className="fund-chip-btn" to={link.href}>
              <span>{link.label}</span>
              <ChevronIcon />
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

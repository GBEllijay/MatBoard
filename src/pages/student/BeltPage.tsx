import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  blackBeltClock,
  coralRanksUnlocked,
  cumulativeText,
  DEGREE_GUIDELINE,
  DEGREE_TILE_CAPTION,
  finalRankRules,
  instructorBarsLine,
  INSTRUCTOR_BARS_NOTE,
  nextDegreeRule,
  timeSoFarText,
  wornDegree,
  yearsAtName,
} from '../../lib/blackBeltDegrees';
import type { RubricCheckpoint, RubricCriterion, StudentGoal, StudentProgressReport } from '../../lib/progress/types';
import { loadStudentReport, todayIso } from '../../lib/studentEdition';
import { degreeFocusOf, instructorBarsOf, rankOf, setDegreeFocus } from '../../lib/studentRank';
import {
  addCheckpoint,
  addGoal,
  BELT_LABELS,
  beltLevel,
  beltProgressSummary,
  checkpointReadOnly,
  checkpointShare,
  checkpointState,
  checkpointTitle,
  copyFocusToGoal,
  copySuggestionToGoal,
  criterionFromFundamentals,
  degreeProgressIsTimeBased,
  goalCopied,
  goalsForBelt,
  INSTRUCTOR_FINAL_SAY,
  learnedCatalogIds,
  loadCoachShelf,
  moveCheckpoint,
  nextBelt,
  OPEN_GOAL_LINE,
  OPEN_GOAL_PROMPTS,
  openGoalBelt,
  removeCheckpoint,
  removeGoal,
  renameCheckpoint,
  setCheckpointMark,
  showsAdultCheckpoints,
  setCriterionMark,
  setGoalMet,
  splitMarkNote,
  TIME_BASED_PROGRESS,
  updateGoal,
  withStarterRubric,
} from '../../lib/studentTools';
import { COACH_FILE_LABEL } from '../../lib/studentHubMenu';
import { StudentMarks, useScrollToHash, useStudentFile, useStudentPath } from './chrome';

export function BeltPage() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  const [shelf] = useState(() => loadCoachShelf(localStorage));
  const [error, setError] = useState('');
  useEffect(() => {
    try {
      const current = loadStudentReport(localStorage);
      const next = withStarterRubric(current);
      if (next !== current) commit(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open belt progress.');
    }
  }, [commit]);

  const belt = report.profile.belt;
  const adultPath = showsAdultCheckpoints(report);
  const upcoming = nextBelt(belt);
  const rank = rankOf(report);
  const degree = wornDegree(belt, rank.tapeCount);
  const nextDegree = degree == null ? null : nextDegreeRule(degree);
  const endLabel = nextDegree ? nextDegree.label : degree != null ? 'Final rank' : upcoming ? BELT_LABELS[upcoming] : 'Last belt on this list';
  const level = beltLevel(report, belt);
  const learned = learnedCatalogIds(report);
  const checkpoints = level?.checkpoints ?? [];
  useScrollToHash(checkpoints.map((row) => row.id).join('|'));
  const summary = beltProgressSummary(level, learned);
  const timeBased = degreeProgressIsTimeBased(belt);
  const openGoals = openGoalBelt(belt);
  const share = to('/student/share?from=rubric');
  const stageGoals = goalsForBelt(report, belt);
  const usedPrompts = new Set(stageGoals.map((goal) => goal.name.trim().toLowerCase()));
  const prompts = OPEN_GOAL_PROMPTS.filter((prompt) => !usedPrompts.has(prompt.toLowerCase()));

  const run = (next: ReturnType<typeof commit>) => {
    try {
      commit(next);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    }
  };

  return (
    <main className="student student-frame student--arena student--belt">
      <StudentMarks />
      <div className="arena-scroll">
        <header className="arena-hero belt-hero">
          <h1>Belt progress</h1>
        </header>
        <div className="student-sheet belt-stack">
          <p className="student-quiet">
            {adultPath ? (
              <>
                Current belt is set on <Link to={to('/student/rank')}>My rank</Link>. This page is the path ahead.
              </>
            ) : (
              <>
                Kids belts are belts and stripes for now. Set them on <Link to={to('/student/rank')}>My rank</Link>.
              </>
            )}
          </p>
          {adultPath ? (
          <div className="belt-lane">
          <div className="belt-ends">
            <p>{BELT_LABELS[belt]}</p>
            <p>{endLabel}</p>
          </div>
          {timeBased ? (
            <p>{TIME_BASED_PROGRESS}</p>
          ) : (
            <ol className="checkpoint-row" aria-label={upcoming ? `Checkpoints between ${BELT_LABELS[belt]} and ${BELT_LABELS[upcoming]}` : `${BELT_LABELS[belt]} checkpoints`}>
              {checkpoints.map((row) => {
                const state = checkpointState(row, learned);
                const share = checkpointShare(row, learned);
                const title = checkpointTitle(row);
                return (
                  <li
                    key={row.id}
                    className={state === 'filled' ? 'is-filled' : state === 'partly filled' ? 'is-partial' : undefined}
                    style={{ '--fill': `${Math.round(share * 100)}%` } as CSSProperties}
                    aria-label={`${title}, ${state}`}
                  >
                    <span className="checkpoint-box" />
                    <span>{title}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {!timeBased && summary ? (
            <p className="belt-count" aria-label="Belt progress count">
              {summary} Checkpoints are the steps between belts.
            </p>
          ) : null}
          {timeBased ? <DegreeFocus report={report} onFocus={(degree, text) => run(setDegreeFocus(report, degree, text))} /> : null}
          {openGoals ? (
            <OpenGoals
              prompts={prompts}
              onPrompt={(name) => run(addGoal(report, name, '', Date.now(), belt))}
              onAdd={(name) => run(addGoal(report, name, '', Date.now(), belt))}
            />
          ) : null}
          <DegreePanel report={report} />
          </div>
          ) : (
          <section className="belt-lane" aria-label="Kids belts">
            <p>Checkpoints and fundamentals for kids are not on this page yet.</p>
          </section>
          )}
          <div className="student-actions">
            <Link className="ink-btn ink-btn--save" to={share}>
              {COACH_FILE_LABEL}
            </Link>
            <Link className="ink-btn" to={`${share}#import`}>
              Import from coach
            </Link>
          </div>
          {adultPath ? checkpoints.map((row, index) => (
            <CheckpointCard
              key={row.id}
              row={row}
              index={index}
              count={checkpoints.length}
              learned={learned}
              readOnly={checkpointReadOnly(report, row)}
              onMark={(met, note) => run(setCheckpointMark(report, row.id, met, note))}
              onRename={(name) => run(renameCheckpoint(report, row.id, name))}
              onRemove={() => run(removeCheckpoint(report, row.id))}
              onMove={(direction) => run(moveCheckpoint(report, row.id, direction))}
              onCriterion={(id, met, date, note) => run(setCriterionMark(report, id, met, date, note))}
            />
          )) : null}
          {adultPath ? (
            <section className="ink" aria-label="Add a checkpoint">
              <NameForm label="Checkpoint name" submit="Add a checkpoint" onAdd={(name) => run(addCheckpoint(report, belt, name))} />
              <p className="student-quiet">{INSTRUCTOR_FINAL_SAY}</p>
            </section>
          ) : null}
          <GoalsSection
            goals={adultPath ? stageGoals : report.goals.filter((goal) => !goal.belt)}
            showForm={!openGoals}
            onAdd={(name, note) => run(addGoal(report, name, note, Date.now(), adultPath ? belt : undefined))}
            onUpdate={(id, name, note) => run(updateGoal(report, id, name, note))}
            onMet={(id, met) => run(setGoalMet(report, id, met))}
            onRemove={adultPath ? (id) => run(removeGoal(report, id)) : undefined}
          />
          <section className="coach-panel" aria-label="From my coach" id="from-coach">
            <h2>From my coach</h2>
            <p className="student-quiet">Suggestions only. Copy a line into your goals if you want it. Your checkpoints stay as you marked them.</p>
            {!shelf.plan && !shelf.feedback ? <p>Nothing from your coach on this phone yet.</p> : null}
            {shelf.plan ? (
              <article className="ink">
                <h3>{shelf.plan.plan.title || 'Work on before next promotion'}</h3>
                {shelf.plan.plan.note ? <p>{shelf.plan.plan.note}</p> : null}
                {shelf.plan.plan.focus.map((line) => (
                  <div key={line.id} className="coach-line">
                    <p>{line.name || line.note}</p>
                    {line.name && line.note ? <p className="student-quiet">{line.note}</p> : null}
                    <button
                      type="button"
                      className="ink-btn"
                      aria-label={`Copy ${line.name || line.note} to my goals`}
                      disabled={goalCopied(report, line.id)}
                      onClick={() => run(copyFocusToGoal(report, line))}
                    >
                      {goalCopied(report, line.id) ? 'Copied' : 'Copy to my goals'}
                    </button>
                  </div>
                ))}
              </article>
            ) : null}
            {shelf.feedback ? (
              <article className="ink ink--wobble">
                <h3>Feedback</h3>
                <p>{shelf.feedback.feedback.synopsis}</p>
                {shelf.feedback.feedback.suggestions.map((line) => (
                  <div key={line.id} className="coach-line">
                    <p>{line.note}</p>
                    <button
                      type="button"
                      className="ink-btn"
                      aria-label={`Copy ${line.note} to my goals`}
                      disabled={goalCopied(report, line.id)}
                      onClick={() => run(copySuggestionToGoal(report, line))}
                    >
                      {goalCopied(report, line.id) ? 'Copied' : 'Copy to my goals'}
                    </button>
                  </div>
                ))}
              </article>
            ) : null}
          </section>
          {error ? <p role="alert">{error}</p> : null}
        </div>
      </div>
    </main>
  );
}

function DegreeFocus({
  report,
  onFocus,
}: {
  report: StudentProgressReport;
  onFocus: (degree: number, text: string) => void;
}) {
  const rank = rankOf(report);
  const degree = wornDegree(report.profile.belt, rank.tapeCount) ?? 0;
  const focus = degreeFocusOf(rank, degree);
  return (
    <label className="belt-focus">
      <span className="ink__label">Focus for this degree</span>
      <input
        aria-label="Focus for this degree"
        defaultValue={focus}
        key={`${degree}-${focus}`}
        onBlur={(event) => {
          if (event.target.value === focus) return;
          onFocus(degree, event.target.value);
        }}
      />
      <span className="student-quiet">A note for this degree. It does not change the degree.</span>
    </label>
  );
}

function OpenGoals({
  prompts,
  onPrompt,
  onAdd,
}: {
  prompts: readonly string[];
  onPrompt: (name: string) => void;
  onAdd: (name: string) => void;
}) {
  return (
    <section className="belt-open" aria-label="Goals for this stage">
      <p className="belt-open__line">{OPEN_GOAL_LINE}</p>
      <p className="student-quiet">{INSTRUCTOR_FINAL_SAY}</p>
      {prompts.length ? (
        <div className="belt-chips" role="group" aria-label="Tap to add">
          {prompts.map((prompt) => (
            <button key={prompt} type="button" className="belt-chip" onClick={() => onPrompt(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      ) : null}
      <NameForm label="Your own goal" submit="Add your own" onAdd={onAdd} />
    </section>
  );
}

function NameForm({ label, submit, onAdd }: { label: string; submit: string; onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <form
      className="belt-add"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onAdd(trimmed);
        setName('');
      }}
    >
      <label>
        <span className="ink__label">{label}</span>
        <input aria-label={label} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="submit" className="ink-btn">
        {submit}
      </button>
    </form>
  );
}

function CheckpointCard({
  row,
  index,
  count,
  learned,
  readOnly,
  onMark,
  onRename,
  onRemove,
  onMove,
  onCriterion,
}: {
  row: RubricCheckpoint;
  index: number;
  count: number;
  learned: ReadonlySet<string>;
  readOnly: boolean;
  onMark: (met: boolean, note: string) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onCriterion: (id: string, met: boolean, date: string, note: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(row.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const title = checkpointTitle(row);
  const done = checkpointState(row, learned) === 'filled';
  useEffect(() => {
    setDraft(row.name);
  }, [row.name]);
  return (
    <section id={row.id} className="ink belt-block" aria-label={`${title} checkpoint`}>
      <h2>{title}</h2>
      {readOnly ? <p className="student-quiet">From your coach. This checkpoint stays as they sent it.</p> : null}
      {row.source === 'coach' && row.edited ? <p className="student-quiet">Edited from the coach list.</p> : null}
      {readOnly ? null : (
        <div className="belt-edit">
          <button type="button" className="ink-btn" aria-label={`Move ${row.name} up`} disabled={index === 0} onClick={() => onMove(-1)}>
            Move up
          </button>
          <button type="button" className="ink-btn" aria-label={`Move ${row.name} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
            Move down
          </button>
          <button type="button" className="ink-btn" aria-label={`Rename ${row.name}`} onClick={() => setRenaming((open) => !open)}>
            Rename
          </button>
          <button type="button" className="ink-btn" aria-label={`Remove ${row.name}`} onClick={() => setConfirmRemove(true)}>
            Remove
          </button>
        </div>
      )}
      {renaming && !readOnly ? (
        <form
          className="belt-add"
          onSubmit={(event) => {
            event.preventDefault();
            onRename(draft);
            setRenaming(false);
          }}
        >
          <label>
            <span className="ink__label">Name</span>
            <input aria-label={`New name for ${row.name}`} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <button type="submit" className="ink-btn" aria-label={`Save ${row.name}`}>
            Save
          </button>
        </form>
      ) : null}
      {confirmRemove && !readOnly ? (
        <div className="student-actions" role="group" aria-label={`Remove ${row.name}`}>
          <button type="button" className="ink-btn" aria-label={`Confirm remove ${row.name}`} onClick={onRemove}>
            Confirm remove
          </button>
          <button type="button" className="ink-btn" aria-label={`Keep ${row.name}`} onClick={() => setConfirmRemove(false)}>
            Keep
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className={row.met === true ? 'student-choice is-on' : 'student-choice'}
        aria-pressed={row.met === true}
        aria-label={row.met === true ? `${row.name} checkpoint met` : `Mark ${row.name} checkpoint met`}
        onClick={() => onMark(row.met !== true, row.note)}
      >
        {row.met === true ? 'Checkpoint met' : 'Mark checkpoint met'}
      </button>
      <label>
        <span className="ink__label">Note</span>
        <input
          aria-label={`${row.name} note`}
          defaultValue={row.note}
          key={`${row.id}-${row.note}`}
          readOnly={readOnly}
          onBlur={(event) => {
            if (readOnly || event.target.value === row.note) return;
            onMark(row.met === true, event.target.value);
          }}
        />
      </label>
      {row.criteria.map((item) => (
        <CriterionEditor
          key={item.id}
          row={item}
          fromFundamentals={criterionFromFundamentals(item, learned)}
          onSave={(met, date, note) => onCriterion(item.id, met, date, note)}
        />
      ))}
      {done ? <p className="student-quiet">Filled.</p> : null}
    </section>
  );
}

function DegreePanel({ report }: { report: StudentProgressReport }) {
  if (!coralRanksUnlocked(report.profile.belt)) return null;
  const rank = rankOf(report);
  const degree = wornDegree(report.profile.belt, rank.tapeCount) ?? 0;
  const next = nextDegreeRule(degree);
  const clock = blackBeltClock(
    {
      belt: report.profile.belt,
      awardedOn: rank.awardedOn,
      tapeCount: rank.tapeCount,
      tapeDates: rank.tapeDates,
      highDegreeDates: rank.highDegreeDates,
      history: rank.history,
    },
    todayIso(),
  );
  const bars = instructorBarsOf(report);
  const timeLine = clock ? `${timeSoFarText(clock)}. Earliest date ${clock.earliest}.` : 'Add your promotion date in My rank.';
  return (
    <section className="ink" aria-label="Black belt degrees">
      {next ? (
        <>
          <h2>Next: {next.label}</h2>
          <p>
            {next.yearsAtPrevious} years at {yearsAtName(degree)}.
          </p>
          <p>{cumulativeText(next)}</p>
        </>
      ) : (
        <>
          <h2>9th degree · Red</h2>
          <p>Final rank.</p>
          <p>48+ years as a black belt</p>
        </>
      )}
      <p>{timeLine}</p>
      <p>{DEGREE_GUIDELINE}</p>
      <p>{INSTRUCTOR_BARS_NOTE}</p>
      <p>{instructorBarsLine(bars.on, bars.date)}</p>
      <p className="rank-unlocked__kicker">Unlocked after black belt</p>
      <ul>
        {finalRankRules().map((rule) => (
          <li key={rule.degree}>
            {rule.label} · {rule.beltLabel}. {cumulativeText(rule)}. {rule.yearsAtPrevious} years at {yearsAtName(rule.degree - 1)}.
          </li>
        ))}
      </ul>
      <p className="student-quiet">{DEGREE_TILE_CAPTION}</p>
    </section>
  );
}

function CriterionEditor({
  row,
  fromFundamentals,
  onSave,
}: {
  row: RubricCriterion;
  fromFundamentals: boolean;
  onSave: (met: boolean, date: string, note: string) => void;
}) {
  const parsed = splitMarkNote(row.note);
  const [date, setDate] = useState(parsed.date);
  const [note, setNote] = useState(parsed.text);
  useEffect(() => {
    const next = splitMarkNote(row.note);
    setDate(next.date);
    setNote(next.text);
  }, [row.note]);
  const met = row.met === true;
  return (
    <div className="criterion">
      <p>{row.requirement}</p>
      <p className="student-quiet">{row.techniqueRefs.map((item) => item.name).join(', ')}</p>
      {fromFundamentals ? <p>Counted from your fundamentals.</p> : null}
      <button
        type="button"
        className={met ? 'student-choice is-on' : 'student-choice'}
        aria-pressed={met}
        aria-label={met ? `${row.requirement} met` : `Mark ${row.requirement} met`}
        onClick={() => onSave(!met, date, note)}
      >
        {met ? 'Met' : 'Mark met'}
      </button>
      <label>
        <span className="ink__label">Date</span>
        <input
          type="date"
          aria-label={`${row.requirement} date`}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          onBlur={(event) => onSave(met, event.target.value, note)}
        />
      </label>
      <label>
        <span className="ink__label">Note</span>
        <input
          aria-label={`${row.requirement} note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={(event) => onSave(met, date, event.target.value)}
        />
      </label>
    </div>
  );
}

function GoalsSection({
  goals,
  showForm,
  onAdd,
  onUpdate,
  onMet,
  onRemove,
}: {
  goals: StudentGoal[];
  showForm: boolean;
  onAdd: (name: string, note: string) => void;
  onUpdate: (id: string, name: string, note: string) => void;
  onMet: (id: string, met: boolean) => void;
  onRemove?: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  return (
    <section className="goals-block" aria-label="Goals">
      <h2>Goals</h2>
      {onRemove ? <p className="student-quiet">Goals are yours. They do not change a belt or a degree.</p> : null}
      {showForm ? (
        <form
          className="ink"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd(name, note);
            setName('');
            setNote('');
          }}
        >
          <label>
            <span className="ink__label">Goal</span>
            <input aria-label="Goal name" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span className="ink__label">Note</span>
            <input aria-label="Goal note" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <button type="submit" className="ink-btn">
            Add goal
          </button>
        </form>
      ) : null}
      {goals.map((goal) => (
        <GoalRow key={goal.id} goal={goal} onUpdate={onUpdate} onMet={onMet} onRemove={onRemove} />
      ))}
    </section>
  );
}

function GoalRow({
  goal,
  onUpdate,
  onMet,
  onRemove,
}: {
  goal: StudentGoal;
  onUpdate: (id: string, name: string, note: string) => void;
  onMet: (id: string, met: boolean) => void;
  onRemove?: (id: string) => void;
}) {
  const [name, setName] = useState(goal.name);
  const [note, setNote] = useState(goal.note);
  useEffect(() => {
    setName(goal.name);
    setNote(goal.note);
  }, [goal.name, goal.note]);
  const met = goal.met === true;
  return (
    <form
      className="ink ink--wobble"
      onSubmit={(event) => {
        event.preventDefault();
        onUpdate(goal.id, name, note);
      }}
    >
      <label>
        <span className="ink__label">Goal</span>
        <input aria-label={`Edit ${goal.name}`} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        <span className="ink__label">Note</span>
        <input aria-label={`Note for ${goal.name}`} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <div className="student-actions">
        <button type="submit" className="ink-btn" aria-label={`Save ${goal.name}`}>
          Save
        </button>
        <button
          type="button"
          className={met ? 'student-choice is-on' : 'student-choice'}
          aria-pressed={met}
          aria-label={met ? `${goal.name} met` : `Mark ${goal.name} met`}
          onClick={() => onMet(goal.id, !met)}
        >
          {met ? 'Met' : 'Mark met'}
        </button>
        {onRemove ? (
          <button type="button" className="ink-btn" aria-label={`Remove ${goal.name}`} onClick={() => onRemove(goal.id)}>
            Remove
          </button>
        ) : null}
      </div>
    </form>
  );
}

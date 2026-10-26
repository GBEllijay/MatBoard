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
import type { RubricCheckpoint, RubricCriterion, StudentGoal, StudentProgressReport, TrainingStyle } from '../../lib/progress/types';
import {
  BENCHMARK_DISCLAIMER_MEDIUM,
  BENCHMARK_DISCLAIMER_SHORT,
  BLACK_BELT_AGE_NOTE,
  IBJJF_RULEBOOK_URL,
  STAGE_SHORT,
  benchmarkCountHint,
  benchmarkDisplayName,
  benchmarkGroups,
  benchmarkNoGiLine,
  benchmarkView,
  benchmarkVisible,
  catalogLevelMap,
  checkpointsForProgress,
} from '../../lib/studentBenchmarks';
import type { BenchmarkGroup, LearnedIndex } from '../../lib/studentBenchmarks';
import { loadStudentReport, setTechniquePolicy, todayIso } from '../../lib/studentEdition';
import { degreeFocusOf, instructorBarsOf, rankOf, setDegreeFocus } from '../../lib/studentRank';
import { addKidsBenchmark, currentKidsBelt, kidsBenchmarksOf, removeKidsBenchmark, setKidsBenchmark } from '../../lib/beltBook';
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
  goalsForKidsBelt,
  INSTRUCTOR_FINAL_SAY,
  loadCoachShelf,
  moveCheckpoint,
  nextBelt,
  NO_PERSONAL_GOALS,
  NO_PRACTICAL_BENCHMARKS,
  OPEN_GOAL_LINE,
  OPEN_GOAL_PROMPTS,
  openGoalBelt,
  PERSONAL_GOALS_HEADING,
  PERSONAL_GOALS_LINE,
  PRACTICAL_BENCHMARKS_HEADING,
  PRACTICAL_BENCHMARKS_LINE,
  removeCheckpoint,
  removeGoal,
  restoreStarterBenchmarks,
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
  const learned = catalogLevelMap(report);
  const view = benchmarkView(report);
  const checkpoints = level?.checkpoints ?? [];
  const visible = checkpoints.filter((row) => benchmarkVisible(row, view));
  const counted = checkpointsForProgress(checkpoints, view);
  const staged = checkpoints.some((row) => row.stage);
  const groups = benchmarkGroups(visible, belt);
  useScrollToHash(visible.map((row) => row.id).join('|'));
  const summary = beltProgressSummary(level ? { ...level, checkpoints: counted } : null, learned);
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
                Practical benchmarks and personal goals for the kids belt on <Link to={to('/student/rank')}>My rank</Link>. Add the ones you want. Suggested lists come later.
              </>
            )}
          </p>
          {adultPath ? (
          <div className="belt-lane">
          <div className="belt-ends">
            <p>{BELT_LABELS[belt]}</p>
            <p>{endLabel}</p>
          </div>
          <section className="belt-benchmarks" aria-label={PRACTICAL_BENCHMARKS_HEADING}>
            <h2>{PRACTICAL_BENCHMARKS_HEADING}</h2>
            <p className="student-quiet">{PRACTICAL_BENCHMARKS_LINE}</p>
            {timeBased ? <p>{TIME_BASED_PROGRESS}</p> : null}
            {!timeBased && visible.length ? (
            <ol className="checkpoint-row" aria-label={upcoming ? `Practical benchmarks between ${BELT_LABELS[belt]} and ${BELT_LABELS[upcoming]}` : `${BELT_LABELS[belt]} practical benchmarks`}>
              {(staged ? groups : [{ id: 'yours', title: '', rows: visible }]).map((group) => {
                if (!staged) {
                  return group.rows.map((row) => {
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
                  });
                }
                const rows = checkpointsForProgress(group.rows, view);
                const share = rows.length ? rows.reduce((sum, row) => sum + checkpointShare(row, learned), 0) / rows.length : 0;
                const state = share >= 1 ? 'filled' : share > 0 ? 'partly filled' : 'open';
                const title = STAGE_SHORT[group.id as keyof typeof STAGE_SHORT] ?? group.title;
                return (
                  <li
                    key={group.id}
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
            ) : null}
            {!timeBased && summary ? (
              <p className="belt-count" aria-label="Belt progress count">
                {summary}
              </p>
            ) : null}
            {visible.length === 0 ? <p>{NO_PRACTICAL_BENCHMARKS}</p> : null}
            {!timeBased && belt === 'brown' && !view.policy.competition ? (
              <button type="button" className="belt-chip" onClick={() => run(setTechniquePolicy(report, 'competition', true))}>
                Competition
              </button>
            ) : null}
          </section>
          {timeBased ? <DegreeFocus report={report} onFocus={(degree, text) => run(setDegreeFocus(report, degree, text))} /> : null}
          <DegreePanel report={report} />
          </div>
          ) : (
          <KidsBenchmarks report={report} run={run} />
          )}
          <div className="student-actions">
            <Link className="ink-btn ink-btn--save" to={share}>
              {COACH_FILE_LABEL}
            </Link>
            <Link className="ink-btn" to={`${share}#import`}>
              Import from coach
            </Link>
          </div>
          {adultPath && !staged
            ? visible.map((row) => (
                <CheckpointCard
                  key={row.id}
                  row={row}
                  index={checkpoints.findIndex((item) => item.id === row.id)}
                  count={checkpoints.length}
                  learned={learned}
                  training={view.trainingStyle}
                  readOnly={checkpointReadOnly(report, row)}
                  onMark={(met, note) => run(setCheckpointMark(report, row.id, met, note))}
                  onRename={(name) => run(renameCheckpoint(report, row.id, name))}
                  onRemove={() => run(removeCheckpoint(report, row.id))}
                  onMove={(direction) => run(moveCheckpoint(report, row.id, direction))}
                  onCriterion={(id, met, date, note) => run(setCriterionMark(report, id, met, date, note))}
                />
              ))
            : null}
          {adultPath && staged
            ? groups.map((group) => (
                <BenchmarkGroupSection
                  key={group.id}
                  group={group}
                  belt={belt}
                  checkpoints={checkpoints}
                  learned={learned}
                  training={view.trainingStyle}
                  report={report}
                  run={run}
                />
              ))
            : null}
          {adultPath && !staged && visible.length ? <BenchmarkDisclaimer /> : null}
          {adultPath && !timeBased ? (
            <RestoreBenchmarks onRestore={() => run(restoreStarterBenchmarks(report, belt))} />
          ) : null}
          {adultPath ? (
            <section className="ink" aria-label="Add a practical benchmark">
              <NameForm label="Practical benchmark name" submit="Add a practical benchmark" onAdd={(name) => run(addCheckpoint(report, belt, name))} />
              <p className="student-quiet">{INSTRUCTOR_FINAL_SAY}</p>
            </section>
          ) : null}
          <GoalsSection
            goals={adultPath ? stageGoals : goalsForKidsBelt(report, currentKidsBelt(report).beltId)}
            personal
            showForm={adultPath ? !openGoals : true}
            prompts={adultPath && openGoals ? prompts : []}
            onPrompt={(name) => run(addGoal(report, name, '', Date.now(), belt))}
            onAdd={(name, note) =>
              run(addGoal(report, name, note, Date.now(), adultPath ? belt : undefined, adultPath ? undefined : currentKidsBelt(report).beltId))
            }
            onUpdate={(id, name, note) => run(updateGoal(report, id, name, note))}
            onMet={(id, met) => run(setGoalMet(report, id, met))}
            onRemove={(id) => run(removeGoal(report, id))}
          />
          <section className="coach-panel" aria-label="From my coach" id="from-coach">
            <h2>From my coach</h2>
            <p className="student-quiet">
              Suggestions only. Copy a line into your personal goals if you want it. Your practical benchmarks stay as you marked them.
            </p>
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
                      aria-label={`Copy ${line.name || line.note} to my personal goals`}
                      disabled={goalCopied(report, line.id)}
                      onClick={() => run(copyFocusToGoal(report, line, Date.now(), adultPath ? undefined : currentKidsBelt(report).beltId))}
                    >
                      {goalCopied(report, line.id) ? 'Copied' : 'Copy to my personal goals'}
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
                      aria-label={`Copy ${line.note} to my personal goals`}
                      disabled={goalCopied(report, line.id)}
                      onClick={() => run(copySuggestionToGoal(report, line, Date.now(), adultPath ? undefined : currentKidsBelt(report).beltId))}
                    >
                      {goalCopied(report, line.id) ? 'Copied' : 'Copy to my personal goals'}
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

function KidsBenchmarks({
  report,
  run,
}: {
  report: StudentProgressReport;
  run: (next: StudentProgressReport) => void;
}) {
  const beltId = currentKidsBelt(report).beltId;
  const rows = kidsBenchmarksOf(report, beltId);
  const competition = benchmarkView(report).policy.competition;
  return (
    <section className="belt-lane" aria-label="Kids belts">
      <section className="belt-benchmarks" aria-label={PRACTICAL_BENCHMARKS_HEADING}>
        <h2>{PRACTICAL_BENCHMARKS_HEADING}</h2>
        <p className="student-quiet">{PRACTICAL_BENCHMARKS_LINE}</p>
        {rows.length === 0 ? <p>{NO_PRACTICAL_BENCHMARKS}</p> : null}
        {rows.map((row) => (
          <KidsBenchmarkRow key={row.id} row={row} report={report} run={run} />
        ))}
        <NameForm label="Practical benchmark name" submit="Add a practical benchmark" onAdd={(name) => run(addKidsBenchmark(report, beltId, name))} />
        {competition ? (
          <p className="student-quiet">Competition prompt is on. It does not count toward a stripe.</p>
        ) : (
          <button type="button" className="belt-chip" onClick={() => run(setTechniquePolicy(report, 'competition', true))}>
            Competition
          </button>
        )}
        <p className="student-quiet">{INSTRUCTOR_FINAL_SAY}</p>
        <BenchmarkDisclaimer />
      </section>
    </section>
  );
}

function KidsBenchmarkRow({
  row,
  report,
  run,
}: {
  row: { id: string; name: string; note: string; met: boolean | null };
  report: StudentProgressReport;
  run: (next: StudentProgressReport) => void;
}) {
  const [name, setName] = useState(row.name);
  const [note, setNote] = useState(row.note);
  useEffect(() => {
    setName(row.name);
    setNote(row.note);
  }, [row.name, row.note]);
  const met = row.met === true;
  return (
    <form
      className="ink"
      onSubmit={(event) => {
        event.preventDefault();
        run(setKidsBenchmark(report, row.id, name, note, row.met));
      }}
    >
      <label>
        <span className="ink__label">Practical benchmark</span>
        <input aria-label={`Edit ${row.name}`} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        <span className="ink__label">Note</span>
        <input aria-label={`Note for ${row.name}`} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <div className="student-actions">
        <button type="submit" className="ink-btn" aria-label={`Save ${row.name}`}>
          Save
        </button>
        <button
          type="button"
          className={met ? 'student-choice is-on' : 'student-choice'}
          aria-pressed={met}
          aria-label={met ? `${row.name} met` : `Mark ${row.name} met`}
          onClick={() => run(setKidsBenchmark(report, row.id, name, note, !met))}
        >
          {met ? 'Met' : 'Mark met'}
        </button>
        <button type="button" className="ink-btn" aria-label={`Remove ${row.name}`} onClick={() => run(removeKidsBenchmark(report, row.id))}>
          Remove
        </button>
      </div>
    </form>
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
    <div className="belt-open">
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
      <NameForm label="Personal goal name" submit="Add personal goal" onAdd={onAdd} />
    </div>
  );
}

function BenchmarkDisclaimer() {
  const [open, setOpen] = useState(false);
  return (
    <div className="belt-disclaimer">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {BENCHMARK_DISCLAIMER_SHORT}
      </button>
      {open ? <p>{BENCHMARK_DISCLAIMER_MEDIUM}</p> : null}
    </div>
  );
}

function RestoreBenchmarks({ onRestore }: { onRestore: () => void }) {
  const [ask, setAsk] = useState(false);
  if (!ask) {
    return (
      <button type="button" className="ink-btn" onClick={() => setAsk(true)}>
        Restore suggested list
      </button>
    );
  }
  return (
    <div className="student-actions" role="group" aria-label="Restore suggested list">
      <p>This puts the suggested list back. Marks on matching items stay. Items you added are removed.</p>
      <button type="button" className="ink-btn ink-btn--save" onClick={onRestore}>
        Confirm restore
      </button>
      <button type="button" className="ink-btn" onClick={() => setAsk(false)}>
        Cancel
      </button>
    </div>
  );
}

function BenchmarkGroupSection({
  group,
  belt,
  checkpoints,
  learned,
  training,
  report,
  run,
}: {
  group: BenchmarkGroup;
  belt: StudentProgressReport['profile']['belt'];
  checkpoints: RubricCheckpoint[];
  learned: LearnedIndex;
  training: TrainingStyle;
  report: StudentProgressReport;
  run: (next: StudentProgressReport) => void;
}) {
  return (
    <section className="belt-stripe" aria-label={group.title || 'Your benchmarks'}>
      {group.title ? <h2>{group.title}</h2> : null}
      {belt === 'brown' && group.id === 'promotion' ? <p className="belt-age">{BLACK_BELT_AGE_NOTE}</p> : null}
      {group.rows.map((row) => (
        <CheckpointCard
          key={row.id}
          row={row}
          index={checkpoints.findIndex((item) => item.id === row.id)}
          count={checkpoints.length}
          learned={learned}
          training={training}
          readOnly={checkpointReadOnly(report, row)}
          onMark={(met, note) => run(setCheckpointMark(report, row.id, met, note))}
          onRename={(name) => run(renameCheckpoint(report, row.id, name))}
          onRemove={() => run(removeCheckpoint(report, row.id))}
          onMove={(direction) => run(moveCheckpoint(report, row.id, direction))}
          onCriterion={(id, met, date, note) => run(setCriterionMark(report, id, met, date, note))}
        />
      ))}
      <BenchmarkDisclaimer />
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
  training,
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
  learned: LearnedIndex;
  training: TrainingStyle;
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
  const shown = benchmarkDisplayName(row, training);
  const title = row.source === 'coach' && row.edited === true ? `${shown}*` : shown;
  const done = checkpointState(row, learned) === 'filled';
  const written = row.criteria.filter((item) => item.requirement.trim());
  const linked = row.criteria.filter((item) => !item.requirement.trim());
  const names = visibleNames(row, training);
  const hint = benchmarkCountHint(row);
  const noGi = benchmarkNoGiLine(row, training);
  const fromFundamentals = linked.some((item) => criterionFromFundamentals(item, learned));
  useEffect(() => {
    setDraft(row.name);
  }, [row.name]);
  return (
    <section id={row.id} className="ink belt-block" aria-label={`${title} benchmark`}>
      <h2>{title}</h2>
      {readOnly ? <p className="student-quiet">From your coach. This practical benchmark stays as they sent it.</p> : null}
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
        aria-label={row.met === true ? `${row.name} benchmark met` : `Mark ${row.name} benchmark met`}
        onClick={() => onMark(row.met !== true, row.note)}
      >
        {row.met === true ? 'Benchmark met' : 'Mark benchmark met'}
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
      {names.length ? <p className="student-quiet">{names.join(', ')}</p> : null}
      {hint ? <p className="student-quiet">{hint}</p> : null}
      {noGi ? <p className="student-quiet">{noGi}</p> : null}
      {fromFundamentals ? <p>Counted from your fundamentals.</p> : null}
      {row.rulebook ? (
        <a href={IBJJF_RULEBOOK_URL} target="_blank" rel="noreferrer">
          IBJJF rule book
        </a>
      ) : null}
      {written.map((item) => (
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

function visibleNames(row: RubricCheckpoint, training: TrainingStyle): string[] {
  const names: string[] = [];
  for (const criterion of row.criteria) {
    if (criterion.requirement.trim()) continue;
    for (const ref of criterion.techniqueRefs) {
      const style = ref.style ?? 'both';
      if (training === 'gi' && style === 'nogi') continue;
      if (training === 'nogi' && style === 'gi') continue;
      if (ref.name) names.push(ref.name);
    }
  }
  return names;
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
  personal,
  showForm,
  prompts,
  onPrompt,
  onAdd,
  onUpdate,
  onMet,
  onRemove,
}: {
  goals: StudentGoal[];
  personal: boolean;
  showForm: boolean;
  prompts: readonly string[];
  onPrompt: (name: string) => void;
  onAdd: (name: string, note: string) => void;
  onUpdate: (id: string, name: string, note: string) => void;
  onMet: (id: string, met: boolean) => void;
  onRemove?: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const nameLabel = personal ? 'Personal goal' : 'Goal';
  const nameAria = personal ? 'Personal goal name' : 'Goal name';
  const noteAria = personal ? 'Personal goal note' : 'Goal note';
  return (
    <section className="goals-block" aria-label={personal ? PERSONAL_GOALS_HEADING : 'Goals'}>
      <h2>{personal ? PERSONAL_GOALS_HEADING : 'Goals'}</h2>
      {personal ? <p className="student-quiet">{PERSONAL_GOALS_LINE}</p> : null}
      {personal && !showForm ? (
        <OpenGoals prompts={prompts} onPrompt={onPrompt} onAdd={(value) => onAdd(value, '')} />
      ) : null}
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
            <span className="ink__label">{nameLabel}</span>
            <input aria-label={nameAria} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span className="ink__label">Note</span>
            <input aria-label={noteAria} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <button type="submit" className="ink-btn">
            {personal ? 'Add personal goal' : 'Add goal'}
          </button>
        </form>
      ) : null}
      {personal && goals.length === 0 ? <p>{NO_PERSONAL_GOALS}</p> : null}
      {goals.map((goal) => (
        <GoalRow key={goal.id} goal={goal} personal={personal} onUpdate={onUpdate} onMet={onMet} onRemove={onRemove} />
      ))}
    </section>
  );
}

function GoalRow({
  goal,
  personal,
  onUpdate,
  onMet,
  onRemove,
}: {
  goal: StudentGoal;
  personal: boolean;
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
        <span className="ink__label">{personal ? 'Personal goal' : 'Goal'}</span>
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

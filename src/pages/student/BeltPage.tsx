import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
import type { RubricCheckpoint, StudentGoal, StudentProgressReport, TrainingStyle } from '../../lib/progress/types';
import {
  BENCHMARK_DISCLAIMER_MEDIUM,
  BLACK_BELT_AGE_NOTE,
  benchmarkAnchorFromHash,
  benchmarkDisplayName,
  benchmarkView,
  benchmarkVisible,
  checkpointsForProgress,
} from '../../lib/studentBenchmarks';
import { loadStudentReport, setTechniquePolicy, todayIso } from '../../lib/studentEdition';
import { degreeFocusOf, instructorBarsOf, rankOf, setDegreeFocus } from '../../lib/studentRank';
import { addKidsBenchmark, currentKidsBelt, kidsBenchmarksOf, removeKidsBenchmark, setKidsBenchmark } from '../../lib/beltBook';
import {
  addCheckpoint,
  addedMetLine,
  addGoal,
  BELT_LABELS,
  beltLevel,
  checkpointReadOnly,
  copyFocusToGoal,
  copySuggestionToGoal,
  degreeProgressIsTimeBased,
  dismissGoalPrompt,
  goalCopied,
  goalPromptsForBelt,
  goalsForBelt,
  goalsForKidsBelt,
  INSTRUCTOR_FINAL_SAY,
  loadCoachShelf,
  moveCheckpoint,
  nextBelt,
  OPEN_GOAL_LINE,
  openGoalBelt,
  PERSONAL_GOALS_HEADING,
  BELT_PAGE_GOALS_LINE,
  PRACTICAL_BENCHMARKS_HEADING,
  BELT_PAGE_BENCHMARKS_LINE,
  removeCheckpoint,
  removeGoal,
  SEED_LINE,
  renameCheckpoint,
  setCheckpointMark,
  showsAdultCheckpoints,
  setGoalMet,
  TIME_BASED_PROGRESS,
  updateGoal,
  withGoalPromptLinks,
  withStarterRubric,
} from '../../lib/studentTools';
import { COACH_FILE_LABEL } from '../../lib/studentHubMenu';
import { readCoachOverlay } from '../../lib/coachSync';
import { StudentMarks, useScrollToHash, useStudentFile, useStudentPath } from './chrome';

export function BeltPage() {
  const to = useStudentPath();
  const { hash } = useLocation();
  const { report, commit } = useStudentFile();
  const [shelf] = useState(() => loadCoachShelf(localStorage));
  const [coachNotes] = useState(() => readCoachOverlay(localStorage).notes);
  const [error, setError] = useState('');
  useEffect(() => {
    try {
      const current = loadStudentReport(localStorage);
      const next = withGoalPromptLinks(withStarterRubric(current));
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
  const view = benchmarkView(report);
  const checkpoints = level?.checkpoints ?? [];
  const visible = checkpoints.filter((row) => benchmarkVisible(row, view));
  const counted = checkpointsForProgress(checkpoints, view);
  const anchor = benchmarkAnchorFromHash(hash);
  const openedBelt = adultPath && anchor && anchor.belt !== belt ? anchor.belt : null;
  const openedLevel = openedBelt ? beltLevel(report, openedBelt) : null;
  const openedIds = openedLevel?.checkpoints.map((row) => row.id).join('|') ?? '';
  useScrollToHash(`${visible.map((row) => row.id).join('|')}|${openedIds}|${anchor?.elementId ?? ''}`, anchor?.elementId ?? '');
  const benchmarkCount = addedMetLine('benchmark', counted.length, counted.filter((row) => row.met === true).length);
  const timeBased = degreeProgressIsTimeBased(belt);
  const openGoals = openGoalBelt(belt);
  const share = to('/student/share?from=rubric');
  const stageGoals = goalsForBelt(report, belt);
  const prompts = goalPromptsForBelt(report, belt);

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
          {openedBelt && anchor ? (
            <OpenedBeltBenchmarks
              worn={belt}
              belt={openedBelt}
              anchorId={anchor.elementId}
              report={report}
              view={view}
              to={to}
              run={run}
            />
          ) : null}
          <p className="student-quiet">
            {adultPath ? (
              <>
                Current belt is set on <Link to={to('/student/rank')}>My rank</Link>. This page is the path ahead.
              </>
            ) : (
              <>
                Practical benchmarks and personal goals for the kids belt on <Link to={to('/student/rank')}>My rank</Link>. Add the ones your instructor gives you.
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
            <BenchmarkDisclaimer />
            <p className="student-quiet belt-list-line">{BELT_PAGE_BENCHMARKS_LINE}</p>
            {timeBased ? <p>{TIME_BASED_PROGRESS}</p> : null}
            <p className="belt-count" aria-label="Practical benchmarks count">
              {benchmarkCount}
            </p>
            {belt === 'brown' ? <p className="belt-age">{BLACK_BELT_AGE_NOTE}</p> : null}
            {!timeBased && belt === 'brown' && !view.policy.competition && checkpoints.some((row) => row.policy === 'competition') ? (
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
          {adultPath
            ? visible.map((row) => (
                <CheckpointCard
                  key={row.id}
                  row={row}
                  anchored={row.id === anchor?.elementId}
                  index={checkpoints.findIndex((item) => item.id === row.id)}
                  count={checkpoints.length}
                  training={view.trainingStyle}
                  readOnly={checkpointReadOnly(report, row)}
                  onMark={(met, note) => run(setCheckpointMark(report, row.id, met, note))}
                  onRename={(name) => run(renameCheckpoint(report, row.id, name))}
                  onRemove={() => run(removeCheckpoint(report, row.id))}
                  onMove={(direction) => run(moveCheckpoint(report, row.id, direction))}
                />
              ))
            : null}
          {adultPath ? (
            <section className="ink belt-more" aria-label="Add a practical benchmark">
              <AddAnother label="Add another practical benchmark" onAdd={() => run(addCheckpoint(report, belt, NEW_BENCHMARK_NAME))} />
              {timeBased ? null : <p className="student-quiet">{SEED_LINE}</p>}
              <p className="student-quiet">{INSTRUCTOR_FINAL_SAY}</p>
            </section>
          ) : null}
          <GoalsSection
            goals={adultPath ? stageGoals : goalsForKidsBelt(report, currentKidsBelt(report).beltId)}
            personal
            prompts={adultPath && openGoals ? prompts : []}
            onPrompt={(name) => run(addGoal(report, name, '', Date.now(), belt, undefined, name))}
            onDismiss={(name) => run(dismissGoalPrompt(report, name))}
            onAddAnother={() =>
              run(addGoal(report, NEW_GOAL_NAME, '', Date.now(), adultPath ? belt : undefined, adultPath ? undefined : currentKidsBelt(report).beltId))
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
            {!shelf.plan && !shelf.feedback && !coachNotes.length ? <p>Nothing from your coach on this phone yet.</p> : null}
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
            {coachNotes.length ? (
              <article className="ink" aria-label="Suggestions from coach">
                <h3>Suggestions from coach</h3>
                {[...coachNotes].reverse().map((line) => {
                  const suggestion = { id: line.updateId, targetId: '', note: line.note };
                  return (
                    <div key={line.updateId} className="coach-line">
                      <p>{line.note}</p>
                      <p className="student-quiet">Journal {line.journalDate}</p>
                      <button
                        type="button"
                        className="ink-btn"
                        aria-label={`Copy ${line.note} to my personal goals`}
                        disabled={goalCopied(report, suggestion.id)}
                        onClick={() => run(copySuggestionToGoal(report, suggestion, Date.now(), adultPath ? undefined : currentKidsBelt(report).beltId))}
                      >
                        {goalCopied(report, suggestion.id) ? 'Copied' : 'Copy to my personal goals'}
                      </button>
                    </div>
                  );
                })}
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
        <BenchmarkDisclaimer />
        <p className="student-quiet belt-list-line">{BELT_PAGE_BENCHMARKS_LINE}</p>
        <p className="belt-count" aria-label="Practical benchmarks count">
          {addedMetLine('benchmark', rows.length, rows.filter((row) => row.met === true).length)}
        </p>
        {rows.map((row) => (
          <KidsBenchmarkRow key={row.id} row={row} report={report} run={run} />
        ))}
        <AddAnother label="Add another practical benchmark" onAdd={() => run(addKidsBenchmark(report, beltId, NEW_BENCHMARK_NAME))} />
        <p className="student-quiet">{SEED_LINE}</p>
        {competition ? (
          <p className="student-quiet">Competition prompt is on. It is not a requirement.</p>
        ) : (
          <button type="button" className="belt-chip" onClick={() => run(setTechniquePolicy(report, 'competition', true))}>
            Competition
          </button>
        )}
        <p className="student-quiet">{INSTRUCTOR_FINAL_SAY}</p>
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
        <NameField label={`Edit ${row.name}`} value={name} onChange={setName} />
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
  onDismiss,
}: {
  prompts: readonly string[];
  onPrompt: (name: string) => void;
  onDismiss: (name: string) => void;
}) {
  return (
    <div className="belt-open">
      <p className="belt-open__line">{OPEN_GOAL_LINE}</p>
      <p className="student-quiet">{INSTRUCTOR_FINAL_SAY}</p>
      {prompts.length ? (
        <div className="belt-chips" role="group" aria-label="Tap to add">
          {prompts.map((prompt) => (
            <div key={prompt} className="belt-chip-row">
              <button type="button" className="belt-chip" onClick={() => onPrompt(prompt)}>
                {prompt}
              </button>
              <button type="button" className="belt-chip-dismiss" aria-label={`Dismiss ${prompt}`} onClick={() => onDismiss(prompt)}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BenchmarkDisclaimer() {
  const to = useStudentPath();
  return (
    <aside className="belt-disclaimer" role="note" aria-label="Benchmark guidelines">
      <p>
        {BENCHMARK_DISCLAIMER_MEDIUM} <Link to={to('/terms#practical-benchmarks')}>Terms of Service</Link>
      </p>
    </aside>
  );
}

const NEW_BENCHMARK_NAME = 'New practical benchmark';
const NEW_GOAL_NAME = 'New personal goal';

function AddAnother({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <button type="button" className="ink-btn belt-add-another" aria-label={label} onClick={onAdd}>
      Add another
    </button>
  );
}

function OpenedBeltBenchmarks({
  worn,
  belt,
  anchorId,
  report,
  view,
  to,
  run,
}: {
  worn: StudentProgressReport['profile']['belt'];
  belt: StudentProgressReport['profile']['belt'];
  anchorId: string;
  report: StudentProgressReport;
  view: ReturnType<typeof benchmarkView>;
  to: (path: string) => string;
  run: (next: StudentProgressReport) => void;
}) {
  const level = beltLevel(report, belt);
  const checkpoints = level?.checkpoints ?? [];
  const openedView = { ...view, belt };
  const visible = checkpoints.filter((row) => benchmarkVisible(row, openedView));
  const label = BELT_LABELS[belt];
  const found = visible.some((row) => row.id === anchorId);
  return (
    <section className="belt-opened" aria-label={`${label} belt benchmarks`}>
      <h2>{label} belt</h2>
      <p className="student-quiet">Opened from a link. Your current belt stays {BELT_LABELS[worn]}.</p>
      <BenchmarkDisclaimer />
      <Link className="ink-btn" to={to('/student/rubric')}>
        Back to {BELT_LABELS[worn]} belt
      </Link>
      {found ? null : (
        <p id={anchorId} className="ink belt-block is-anchor" role="status">
          That benchmark is not on the {label} list on this phone.
        </p>
      )}
      {visible.map((row) => (
        <CheckpointCard
          key={row.id}
          row={row}
          anchored={row.id === anchorId}
          index={checkpoints.findIndex((item) => item.id === row.id)}
          count={checkpoints.length}
          training={openedView.trainingStyle}
          readOnly={checkpointReadOnly(report, row)}
          onMark={(met, note) => run(setCheckpointMark(report, row.id, met, note))}
          onRename={(name) => run(renameCheckpoint(report, row.id, name))}
          onRemove={() => run(removeCheckpoint(report, row.id))}
          onMove={(direction) => run(moveCheckpoint(report, row.id, direction))}
        />
      ))}
    </section>
  );
}

function CheckpointCard({
  row,
  anchored,
  index,
  count,
  training,
  readOnly,
  onMark,
  onRename,
  onRemove,
  onMove,
}: {
  row: RubricCheckpoint;
  anchored: boolean;
  index: number;
  count: number;
  training: TrainingStyle;
  readOnly: boolean;
  onMark: (met: boolean, note: string) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState(row.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // A blank card (black belt and up start with one) is named for screen readers but never counted.
  const label = row.name.trim() ? row.name : 'blank practical benchmark';
  const shown = row.name.trim() ? benchmarkDisplayName(row, training) : 'New practical benchmark';
  const title = row.source === 'coach' && row.edited === true ? `${shown}*` : shown;
  const met = row.met === true;
  useEffect(() => {
    setDraft(row.name);
  }, [row.name]);
  return (
    <section id={row.id} className={anchored ? 'ink belt-block is-anchor' : 'ink belt-block'} aria-label={`${title} benchmark`}>
      {readOnly ? (
        <>
          <h2>{title}</h2>
          <p className="student-quiet">From your coach. This practical benchmark stays as they sent it.</p>
        </>
      ) : (
        <label>
          <span className="ink__label">Practical benchmark</span>
          <NameField
            label={`Edit ${label}`}
            value={draft}
            placeholder="Name this practical benchmark"
            onChange={setDraft}
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (!next) {
                setDraft(row.name);
                return;
              }
              if (next !== row.name) onRename(next);
            }}
          />
        </label>
      )}
      {row.source === 'coach' && row.edited ? <p className="student-quiet">Edited from the coach list.</p> : null}
      <label>
        <span className="ink__label">Note</span>
        <input
          aria-label={`${label} note`}
          defaultValue={row.note}
          key={`${row.id}-${row.note}`}
          readOnly={readOnly}
          onBlur={(event) => {
            if (readOnly || event.target.value === row.note) return;
            onMark(met, event.target.value);
          }}
        />
      </label>
      <button
        type="button"
        className={met ? 'ink-btn ink-btn--save student-choice is-on' : 'ink-btn ink-btn--save student-choice'}
        aria-pressed={met}
        aria-label={met ? `${label} benchmark met` : `Mark ${label} benchmark met`}
        onClick={() => onMark(!met, row.note)}
      >
        {met ? 'Benchmark met' : 'Mark benchmark met'}
      </button>
      {readOnly ? null : (
        <div className="belt-edit">
          <button type="button" className="ink-btn" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(-1)}>
            Move up
          </button>
          <button type="button" className="ink-btn" aria-label={`Move ${label} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
            Move down
          </button>
          <button type="button" className="ink-btn" aria-label={`Remove ${label}`} onClick={() => setConfirmRemove(true)}>
            Remove
          </button>
        </div>
      )}
      {confirmRemove && !readOnly ? (
        <div className="student-actions" role="group" aria-label={`Remove ${label}`}>
          <button type="button" className="ink-btn" aria-label={`Confirm remove ${label}`} onClick={onRemove}>
            Confirm remove
          </button>
          <button type="button" className="ink-btn" aria-label={`Keep ${label}`} onClick={() => setConfirmRemove(false)}>
            Keep
          </button>
        </div>
      ) : null}
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

function GoalsSection({
  goals,
  personal,
  prompts,
  onPrompt,
  onDismiss,
  onAddAnother,
  onUpdate,
  onMet,
  onRemove,
}: {
  goals: StudentGoal[];
  personal: boolean;
  prompts: readonly string[];
  onPrompt: (name: string) => void;
  onDismiss: (name: string) => void;
  onAddAnother: () => void;
  onUpdate: (id: string, name: string, note: string) => void;
  onMet: (id: string, met: boolean) => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <section className="goals-block" aria-label={personal ? PERSONAL_GOALS_HEADING : 'Goals'}>
      <h2>{personal ? PERSONAL_GOALS_HEADING : 'Goals'}</h2>
      {personal ? <p className="student-quiet belt-list-line">{BELT_PAGE_GOALS_LINE}</p> : null}
      {personal && prompts.length ? <OpenGoals prompts={prompts} onPrompt={onPrompt} onDismiss={onDismiss} /> : null}
      <p className="belt-count" aria-label="Personal goals count">
        {addedMetLine('goal', goals.length, goals.filter((goal) => goal.met === true).length)}
      </p>
      {goals.map((goal) => (
        <GoalRow key={goal.id} goal={goal} personal={personal} onUpdate={onUpdate} onMet={onMet} onRemove={onRemove} />
      ))}
      <AddAnother label={personal ? 'Add another personal goal' : 'Add another goal'} onAdd={onAddAnother} />
      <p className="student-quiet">{SEED_LINE}</p>
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
        <NameField label={`Edit ${goal.name}`} value={name} onChange={setName} />
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

/**
 * A one-line name that wraps on a narrow phone instead of cutting off.
 * Enter saves (submits the card's form, or blurs to save on blur) and newlines are never stored.
 */
function NameField({
  label,
  value,
  placeholder,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    const fit = () => {
      field.style.height = 'auto';
      if (field.scrollHeight > 0) field.style.height = `${field.scrollHeight}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="name-field"
      rows={1}
      aria-label={label}
      value={value}
      placeholder={placeholder}
      enterKeyHint="done"
      onChange={(event) => onChange(event.target.value.replace(/[\r\n]+/g, ' '))}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const field = event.currentTarget;
        field.form?.requestSubmit();
        field.blur();
      }}
      onBlur={onBlur}
    />
  );
}

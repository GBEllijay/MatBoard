import { useEffect, useState } from 'react';
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
import type { RubricCriterion, StudentProgressReport } from '../../lib/progress/types';
import { loadStudentReport, todayIso } from '../../lib/studentEdition';
import { instructorBarsOf, rankOf } from '../../lib/studentRank';
import {
  addGoal,
  BELT_LABELS,
  beltLevel,
  checkpointFilled,
  copyFocusToGoal,
  copySuggestionToGoal,
  criterionFromFundamentals,
  goalCopied,
  learnedCatalogIds,
  loadCoachShelf,
  nextBelt,
  setCheckpointMark,
  showsAdultCheckpoints,
  setCriterionMark,
  setGoalMet,
  splitMarkNote,
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
  const filled = checkpoints.filter((row) => checkpointFilled(row, learned)).length;
  const share = to('/student/share?from=rubric');

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
          <ol className="checkpoint-row" aria-label={upcoming ? `Checkpoints between ${BELT_LABELS[belt]} and ${BELT_LABELS[upcoming]}` : `${BELT_LABELS[belt]} checkpoints`}>
            {checkpoints.map((row) => {
              const done = checkpointFilled(row, learned);
              return (
                <li key={row.id} className={done ? 'is-filled' : undefined} aria-label={`${row.name}, ${done ? 'filled' : 'open'}`}>
                  <span className="checkpoint-box" />
                  <span>{row.name}</span>
                </li>
              );
            })}
          </ol>
          {checkpoints.length ? (
            <p className="student-quiet">
              {filled} of {checkpoints.length} checkpoints filled. Checkpoints are the steps between belts.
            </p>
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
          {adultPath ? checkpoints.map((row) => {
            const done = checkpointFilled(row, learned);
            return (
              <section key={row.id} id={row.id} className="ink belt-block" aria-label={`${row.name} checkpoint`}>
                <h2>{row.name}</h2>
                <button
                  type="button"
                  className={row.met === true ? 'student-choice is-on' : 'student-choice'}
                  aria-pressed={row.met === true}
                  aria-label={row.met === true ? `${row.name} checkpoint met` : `Mark ${row.name} checkpoint met`}
                  onClick={() => run(setCheckpointMark(report, row.id, row.met !== true, row.note))}
                >
                  {row.met === true ? 'Checkpoint met' : 'Mark checkpoint met'}
                </button>
                <label>
                  <span className="ink__label">Note</span>
                  <input
                    aria-label={`${row.name} note`}
                    defaultValue={row.note}
                    key={`${row.id}-${row.note}`}
                    onBlur={(event) => {
                      if (event.target.value === row.note) return;
                      run(setCheckpointMark(report, row.id, row.met === true, event.target.value));
                    }}
                  />
                </label>
                {row.criteria.map((item) => (
                  <CriterionEditor
                    key={item.id}
                    row={item}
                    fromFundamentals={criterionFromFundamentals(item, learned)}
                    onSave={(met, date, note) => run(setCriterionMark(report, item.id, met, date, note))}
                  />
                ))}
                {done ? <p className="student-quiet">Filled.</p> : null}
              </section>
            );
          }) : null}
          <GoalsSection
            report={report}
            onAdd={(name, note) => run(addGoal(report, name, note))}
            onUpdate={(id, name, note) => run(updateGoal(report, id, name, note))}
            onMet={(id, met) => run(setGoalMet(report, id, met))}
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
  report,
  onAdd,
  onUpdate,
  onMet,
}: {
  report: ReturnType<typeof useStudentFile>['report'];
  onAdd: (name: string, note: string) => void;
  onUpdate: (id: string, name: string, note: string) => void;
  onMet: (id: string, met: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  return (
    <section className="goals-block" aria-label="Goals">
      <h2>Goals</h2>
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
      {report.goals.map((goal) => (
        <GoalRow key={goal.id} goal={goal} onUpdate={onUpdate} onMet={onMet} />
      ))}
    </section>
  );
}

function GoalRow({
  goal,
  onUpdate,
  onMet,
}: {
  goal: ReturnType<typeof useStudentFile>['report']['goals'][number];
  onUpdate: (id: string, name: string, note: string) => void;
  onMet: (id: string, met: boolean) => void;
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
      </div>
    </form>
  );
}

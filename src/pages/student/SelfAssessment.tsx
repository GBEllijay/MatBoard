import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RadarChart } from '../../components/RadarChart';
import { catalogLines, commitIndexCards, getIndexCardFile, useLiveCards } from '../../indexCards/store';
import { fundamentalAssessmentScores } from '../../lib/fundamentals';
import { withRating, type IndexFaceId, type LiveCard } from '../../lib/indexCards';
import type { StudentProgressReport } from '../../lib/progress/types';
import { subscribeStudentJournal } from '../../lib/studentDemo';
import { fundamentalsBoard, todayIso } from '../../lib/studentEdition';
import { useScrollToHash } from './chrome';
import {
  ASSESSMENT_AREAS,
  ASSESSMENT_FORM_AREAS,
  MINDSET_GOALS,
  assessmentAverage,
  assessmentChartScores,
  assessmentDraftScores,
  assessmentTrend,
  checkpointLinks,
  conditioningContextText,
  conditioningItemLines,
  conditioningScoreFromItems,
  displayedAssessmentScores,
  isAssessmentScore,
  loadAssessments,
  mindsetGoalLines,
  mindsetGoalsForDate,
  mindsetScoreFromGoals,
  removeAssessment,
  saveAssessment,
  writeAssessments,
  type AssessmentDraft,
  type AssessmentEntry,
  type AssessmentScore,
  type AssessmentScores,
  type DirectFaces,
  type MindsetGoalScores,
} from '../../lib/studentAssessment';

type PathFn = (path: string) => string;
type EvaluationMode = 'generic' | 'technique';
type FormAreaId = (typeof ASSESSMENT_FORM_AREAS)[number]['id'];

const INDEX_FACE: Record<FormAreaId, IndexFaceId> = {
  guard: 'guard-control',
  passing: 'passing',
  sweeps: 'sweeps',
  takedowns: 'takedowns',
  escapes: 'escapes-defense',
  submissions: 'submissions',
  conditioning: 'conditioning',
  mindset: 'mindset',
};

const GOAL_IDS = new Set<string>(MINDSET_GOALS.map((goal) => goal.id));

function trackerScores(report: StudentProgressReport): Partial<AssessmentScores> {
  return fundamentalAssessmentScores(fundamentalsBoard(report).flatMap((category) => category.items));
}

function openingScores(
  entries: readonly AssessmentEntry[],
  date: string,
  today: string,
  report: StudentProgressReport,
): Partial<AssessmentScores> {
  const saved = entries.find((entry) => entry.date === date);
  if (saved) return displayedAssessmentScores(saved);
  return assessmentDraftScores(entries, date, today, trackerScores(report));
}

function hasGoalScore(goals: MindsetGoalScores): boolean {
  return MINDSET_GOALS.some((goal) => isAssessmentScore(goals[goal.id]));
}

export function SelfAssessment({ report, to }: { report: StudentProgressReport; to: PathFn }) {
  useScrollToHash();
  const cards = useLiveCards();
  const initial = loadAssessments(localStorage);
  const today = todayIso();
  const todayEntry = initial.entries.find((entry) => entry.date === today);
  const [entries, setEntries] = useState(initial.entries);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState(todayEntry?.note ?? '');
  const [mode, setMode] = useState<EvaluationMode>('generic');
  const [scores, setScores] = useState<Partial<AssessmentScores>>(() => openingScores(initial.entries, today, today, report));
  const [goals, setGoals] = useState<MindsetGoalScores>(() => mindsetGoalsForDate(initial.entries, today));
  const [faceEdits, setFaceEdits] = useState<DirectFaces>({});
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const dateRef = useRef(date);
  dateRef.current = date;
  const reportRef = useRef(report);
  reportRef.current = report;
  useEffect(() => {
    return subscribeStudentJournal(() => {
      const next = loadAssessments(localStorage);
      if (entriesRef.current.length > 0 && next.entries.length === 0) {
        setNote('');
        setScores(assessmentDraftScores([], dateRef.current, todayIso(), trackerScores(reportRef.current)));
        setGoals({});
        setFaceEdits({});
        setError('');
      }
      setEntries((current) => (sameEntries(current, next.entries) ? current : next.entries));
    });
  }, []);
  const links = checkpointLinks(report);
  const savedOnDate = entries.find((entry) => entry.date === date);
  const shownScores: Partial<AssessmentScores> = scores;
  const radarScores = assessmentChartScores(shownScores, savedOnDate ? displayedAssessmentScores(savedOnDate) : undefined, entries[0] ? displayedAssessmentScores(entries[0]) : undefined);
  const trend = assessmentTrend(entries);
  const mindsetOpen =
    !savedOnDate &&
    !isAssessmentScore(shownScores.mindset) &&
    ASSESSMENT_AREAS.some((area) => area.id !== 'mindset' && isAssessmentScore(shownScores[area.id]));

  const applyDate = (value: string) => {
    const found = entries.find((entry) => entry.date === value);
    setDate(value);
    setNote(found?.note ?? '');
    setScores(openingScores(entries, value, today, report));
    setGoals(mindsetGoalsForDate(entries, value));
    setFaceEdits({});
    setError('');
  };

  const rateTechnique = (id: string, value: AssessmentScore) => {
    commitIndexCards(withRating(catalogLines(), getIndexCardFile(), id, value));
  };

  const save = () => {
    try {
      if (mode === 'technique') {
        const stored = entries.find((entry) => entry.date === date);
        if (!stored) {
          setError(
            note.trim() || hasGoalScore(goals)
              ? 'Save the daily check-in in Generic first. Technique ratings stay on their own cards.'
              : '',
          );
          return;
        }
        const next = writeAssessments(
          localStorage,
          saveAssessment({ entries }, { date, note, scores: stored.scores, mindsetGoals: goals }),
        );
        setEntries(next.entries);
        setError('');
        return;
      }
      const stored = entries.find((entry) => entry.date === date);
      const writtenScores: Partial<AssessmentScores> = { ...scores };
      if (stored && !faceEdits.conditioning) writtenScores.conditioning = stored.scores.conditioning;
      if (stored && !faceEdits.mindset) writtenScores.mindset = stored.scores.mindset;
      const directFaces: DirectFaces = { ...(stored?.directFaces ?? {}) };
      if (faceEdits.conditioning) directFaces.conditioning = true;
      if (faceEdits.mindset) directFaces.mindset = true;
      const draft: AssessmentDraft = { date, note, scores: writtenScores, mindsetGoals: goals };
      if (directFaces.conditioning || directFaces.mindset) draft.directFaces = directFaces;
      const next = writeAssessments(localStorage, saveAssessment({ entries }, draft));
      setEntries(next.entries);
      setFaceEdits({});
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that check-in.');
    }
  };

  return (
    <section className="assess" id="self-assessment" aria-label="Self-assessment">
      <div className="assess-lead">
        <h1>Self-assessment</h1>
        <p className="student-quiet">Rate the work in front of you. 1 is early. 5 is ready to rely on. Saved on this phone by date.</p>
        <p className="student-quiet">
          Today's ratings start from Fundamentals. Mindset is rated on this page. A day you already saved stays as you saved it.
        </p>
      </div>

      {entries.length ? (
        <p className="assess-stat">
          <strong>{assessmentAverage(displayedAssessmentScores(entries[0])).toFixed(1)}</strong>
          <span>Latest average · {entries[0].date}</span>
        </p>
      ) : null}

      <div className="assess-visuals">
        <RadarChart
          scores={radarScores}
          note={mindsetOpen ? 'Mindset is not on the Fundamentals list. Rate it here, then save this day.' : undefined}
        />
        <Trend points={trend} />
      </div>

      <form
        className="assess-form"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="student-games" role="group" aria-label="Evaluation mode">
          <button
            type="button"
            className={mode === 'generic' ? 'student-choice is-on' : 'student-choice'}
            aria-pressed={mode === 'generic'}
            onClick={() => setMode('generic')}
          >
            Generic
          </button>
          <button
            type="button"
            className={mode === 'technique' ? 'student-choice is-on' : 'student-choice'}
            aria-pressed={mode === 'technique'}
            onClick={() => setMode('technique')}
          >
            Technique-based
          </button>
        </div>
        <p className="student-quiet">
          {mode === 'generic'
            ? 'One overall rating for each area.'
            : 'Rate each technique. Personal goals stay on this view.'}
        </p>
        <label>
          <span className="ink__label">Date</span>
          <input type="date" aria-label="Self-assessment date" value={date} onChange={(event) => applyDate(event.target.value)} required />
        </label>
        {ASSESSMENT_FORM_AREAS.map((area) => {
          const link = area.id === 'sweeps' ? undefined : links.find((item) => item.areaId === area.id);
          const techniques = cards.filter((card) => card.faceId === INDEX_FACE[area.id] && !GOAL_IDS.has(card.id));
          return (
            <fieldset key={area.id} id={`assess-${area.id}`} className="assess-area">
              <legend>{area.label}</legend>
              {link ? (
                <Link className="assess-link" to={to(`/student/rubric#${link.checkpointId}`)}>
                  {`Open: ${link.checkpointName} benchmark`}
                </Link>
              ) : null}
              {mode === 'generic' ? (
                <>
                  <div className="assess-scale" role="group" aria-label={`${area.label} rating`}>
                    {([1, 2, 3, 4, 5] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={shownScores[area.id] === value ? 'assess-tap is-on' : 'assess-tap'}
                        aria-pressed={shownScores[area.id] === value}
                        aria-label={`${area.label} ${value}`}
                        onClick={() => {
                          setScores((current) => ({ ...current, [area.id]: value }));
                          if (area.id === 'conditioning' || area.id === 'mindset') {
                            setFaceEdits((current) => ({ ...current, [area.id]: true }));
                          }
                        }}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  {area.id === 'conditioning' ? <p className="student-quiet">{conditioningContextText()}</p> : null}
                  {legacyNote(area.id, savedOnDate)}
                </>
              ) : (
                <>
                  {techniques.length ? (
                    <TechniqueScales cards={techniques} onPick={rateTechnique} />
                  ) : null}
                  {area.id === 'mindset' ? (
                    <ItemScales
                      label="Mindset goals"
                      items={MINDSET_GOALS}
                      values={goals}
                      onPick={(id, value) => setGoals((current) => ({ ...current, [id]: value }))}
                    />
                  ) : null}
                </>
              )}
            </fieldset>
          );
        })}
        <label>
          <span className="ink__label">Note</span>
          <textarea aria-label="Self-assessment note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" className="ink-btn ink-btn--save">
          {savedOnDate ? 'Update self-assessment' : 'Save self-assessment'}
        </button>
      </form>

      <div className="assess-history">
        <h3 className="ink__label">History</h3>
        {entries.length === 0 ? <p className="student-quiet">No check-ins yet.</p> : null}
        <ul className="comp-list" aria-label="Self-assessment history">
          {entries.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              confirming={confirming === entry.id}
              onAsk={() => setConfirming(entry.id)}
              onKeep={() => setConfirming(null)}
              onRemove={() => {
                const next = writeAssessments(localStorage, removeAssessment({ entries }, entry.id));
                setEntries(next.entries);
                setConfirming(null);
                if (entry.date === date) {
                  setNote('');
                  setScores(openingScores(next.entries, date, today, report));
                  setGoals(mindsetGoalsForDate(next.entries, date));
                  setFaceEdits({});
                }
              }}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function legacyNote(areaId: FormAreaId, entry: AssessmentEntry | undefined) {
  if (!entry) return null;
  if (areaId === 'conditioning' && !entry.directFaces?.conditioning) {
    const average = conditioningScoreFromItems(entry.conditioningItems);
    if (average) return <p className="student-quiet">{`Earlier conditioning detail averages to ${average}.`}</p>;
  }
  if (areaId === 'mindset' && !entry.directFaces?.mindset) {
    const average = mindsetScoreFromGoals(entry.mindsetGoals);
    if (average) return <p className="student-quiet">{`Earlier mindset detail averages to ${average}.`}</p>;
  }
  return null;
}

function TechniqueScales({
  cards,
  onPick,
}: {
  cards: readonly LiveCard[];
  onPick: (id: string, value: AssessmentScore) => void;
}) {
  const values: Partial<Record<string, AssessmentScore>> = {};
  for (const card of cards) {
    if (card.touched) values[card.id] = card.rating;
  }
  return (
    <ItemScales
      label="Techniques"
      items={cards.map((card) => ({ id: card.id, label: card.name }))}
      values={values}
      onPick={onPick}
    />
  );
}

function ItemScales<Id extends string>({
  label,
  items,
  values,
  onPick,
}: {
  label: string;
  items: readonly { id: Id; label: string }[];
  values: Partial<Record<Id, AssessmentScore>>;
  onPick: (id: Id, value: AssessmentScore) => void;
}) {
  return (
    <div className="assess-goals" role="group" aria-label={label}>
      {items.map((item) => (
        <fieldset key={item.id} className="assess-goal">
          <legend>{item.label}</legend>
          <div className="assess-scale" role="group" aria-label={`${item.label} rating`}>
            {([1, 2, 3, 4, 5] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={values[item.id] === value ? 'assess-tap is-on' : 'assess-tap'}
                aria-pressed={values[item.id] === value}
                aria-label={`${item.label} ${value}`}
                onClick={() => onPick(item.id, value)}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function sameEntries(left: AssessmentEntry[], right: AssessmentEntry[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return other && entry.id === other.id && entry.date === other.date && entry.note === other.note;
  });
}

function HistoryRow({
  entry,
  confirming,
  onAsk,
  onKeep,
  onRemove,
}: {
  entry: AssessmentEntry;
  confirming: boolean;
  onAsk: () => void;
  onKeep: () => void;
  onRemove: () => void;
}) {
  const shown = displayedAssessmentScores(entry);
  const line = ASSESSMENT_FORM_AREAS.map((area) => {
    if (area.id === 'sweeps') {
      const value = shown.sweeps;
      return isAssessmentScore(value) ? `${area.label} ${value}` : `${area.label} not rated`;
    }
    return `${area.label} ${shown[area.id]}`;
  }).join(' · ');
  return (
    <li className="assess-row">
      <p className="assess-row__top">
        <strong>{entry.date}</strong>
        <span>{assessmentAverage(shown).toFixed(1)}</span>
      </p>
      <p className="assess-scoreline">{line}</p>
      {conditioningItemLines(entry.conditioningItems).length ? (
        <p className="assess-scoreline">{conditioningItemLines(entry.conditioningItems).join(' · ')}</p>
      ) : null}
      {mindsetGoalLines(entry.mindsetGoals).length ? <p className="assess-scoreline">{mindsetGoalLines(entry.mindsetGoals).join(' · ')}</p> : null}
      {entry.note ? <p>{entry.note}</p> : null}
      {confirming ? (
        <div className="student-actions" role="group" aria-label={`Remove check-in ${entry.date}`}>
          <button type="button" className="ink-btn" onClick={onRemove}>
            {`Confirm remove check-in ${entry.date}`}
          </button>
          <button type="button" className="ink-btn" onClick={onKeep}>
            Keep check-in
          </button>
        </div>
      ) : (
        <button type="button" className="ink-btn" onClick={onAsk}>
          {`Remove check-in ${entry.date}`}
        </button>
      )}
    </li>
  );
}

function Trend({ points }: { points: { date: string; average: number }[] }) {
  const label = points.length
    ? `Self-assessment trend, ${points.map((point) => `${point.date} ${point.average}`).join(', ')}`
    : 'Self-assessment trend. No saved ratings yet.';
  const width = 320;
  const height = 160;
  const pad = 18;
  const min = 1;
  const max = 5;
  const xAt = (index: number) => (points.length <= 1 ? width / 2 : pad + (index * (width - pad * 2)) / (points.length - 1));
  const yAt = (value: number) => pad + ((max - value) * (height - pad * 2)) / (max - min);
  const line = points.map((point, index) => `${xAt(index)},${yAt(point.average)}`).join(' ');
  return (
    <div className="assess-visual">
      <h3>Trend</h3>
      <svg className="assess-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <line className="assess-chart__grid" x1={pad} x2={width - pad} y1={yAt(3)} y2={yAt(3)} />
        {points.length > 1 ? <polyline className="assess-chart__line" points={line} /> : null}
        {points.map((point, index) => (
          <circle key={point.date} className="assess-chart__dot" cx={xAt(index)} cy={yAt(point.average)} r="4" />
        ))}
      </svg>
      {points.length === 0 ? <p className="student-quiet">Each saved day adds a point.</p> : null}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentProgressReport } from '../../lib/progress/types';
import { todayIso } from '../../lib/studentEdition';
import {
  ASSESSMENT_AREAS,
  assessmentAverage,
  assessmentTrend,
  checkpointLinks,
  loadAssessments,
  removeAssessment,
  saveAssessment,
  writeAssessments,
  type AssessmentEntry,
  type AssessmentScore,
  type AssessmentScores,
} from '../../lib/studentAssessment';

type PathFn = (path: string) => string;

export function SelfAssessment({ report, to }: { report: StudentProgressReport; to: PathFn }) {
  const initial = loadAssessments(localStorage);
  const today = todayIso();
  const todayEntry = initial.entries.find((entry) => entry.date === today);
  const [entries, setEntries] = useState(initial.entries);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState(todayEntry?.note ?? '');
  const [scores, setScores] = useState<Partial<AssessmentScores>>(todayEntry ? { ...todayEntry.scores } : {});
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const links = checkpointLinks(report);
  const savedOnDate = entries.find((entry) => entry.date === date);
  const draftReady = ASSESSMENT_AREAS.every((area) => isTap(scores[area.id]));
  const radarScores = draftReady ? (scores as AssessmentScores) : (savedOnDate?.scores ?? entries[0]?.scores ?? null);
  const trend = assessmentTrend(entries);

  const applyDate = (value: string) => {
    const found = entries.find((entry) => entry.date === value);
    setDate(value);
    setNote(found?.note ?? '');
    setScores(found ? { ...found.scores } : {});
    setError('');
  };

  const save = () => {
    try {
      const next = writeAssessments(localStorage, saveAssessment({ entries }, { date, note, scores }));
      setEntries(next.entries);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that check-in.');
    }
  };

  return (
    <section className="assess" id="self-assessment" aria-label="Self-assessment">
      <span className="arena-node" aria-hidden="true" />
      <div className="assess-lead">
        <h2>Self-assessment</h2>
        <p className="student-quiet">Rate the work in front of you. 1 is early. 5 is ready to rely on. Saved on this phone by date.</p>
      </div>

      {entries.length ? (
        <p className="assess-stat">
          <strong>{assessmentAverage(entries[0].scores).toFixed(1)}</strong>
          <span>Latest average · {entries[0].date}</span>
        </p>
      ) : null}

      <div className="assess-visuals">
        <Radar scores={radarScores} />
        <Trend points={trend} />
      </div>

      <form
        className="assess-form"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label>
          <span className="ink__label">Date</span>
          <input type="date" aria-label="Self-assessment date" value={date} onChange={(event) => applyDate(event.target.value)} required />
        </label>
        {ASSESSMENT_AREAS.map((area) => {
          const link = links.find((item) => item.areaId === area.id);
          return (
            <fieldset key={area.id} id={`assess-${area.id}`} className="assess-area">
              <legend>{area.label}</legend>
              {link ? (
                <Link className="assess-link" to={to(`/student/rubric#${link.checkpointId}`)}>
                  {`Open ${link.checkpointName} checkpoint`}
                </Link>
              ) : null}
              <div className="assess-scale" role="group" aria-label={`${area.label} rating`}>
                {([1, 2, 3, 4, 5] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={scores[area.id] === value ? 'assess-tap is-on' : 'assess-tap'}
                    aria-pressed={scores[area.id] === value}
                    aria-label={`${area.label} ${value}`}
                    onClick={() => setScores((current) => ({ ...current, [area.id]: value }))}
                  >
                    {value}
                  </button>
                ))}
              </div>
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
                  setScores({});
                }
              }}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function isTap(value: unknown): value is AssessmentScore {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
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
  const line = ASSESSMENT_AREAS.map((area) => `${area.label} ${entry.scores[area.id]}`).join(' · ');
  return (
    <li className="assess-row">
      <p className="assess-row__top">
        <strong>{entry.date}</strong>
        <span>{assessmentAverage(entry.scores).toFixed(1)}</span>
      </p>
      <p className="assess-scoreline">{line}</p>
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

function Radar({ scores }: { scores: AssessmentScores | null }) {
  const label = scores
    ? `Self-assessment shape, ${ASSESSMENT_AREAS.map((area) => `${area.label} ${scores[area.id]}`).join(', ')}`
    : 'Self-assessment shape. No saved ratings yet.';
  const shape = scores
    ? ASSESSMENT_AREAS.map((area, index) => {
        const spot = at(index, scores[area.id], 108);
        return `${spot.x},${spot.y}`;
      }).join(' ')
    : '';
  return (
    <div className="assess-visual">
      <h3>Shape</h3>
      <svg className="assess-chart" viewBox="0 0 320 320" role="img" aria-label={label}>
        {[5, 3].map((ring) => (
          <polygon key={ring} className="assess-chart__grid" points={ASSESSMENT_AREAS.map((_, index) => {
            const spot = at(index, ring, 108);
            return `${spot.x},${spot.y}`;
          }).join(' ')} />
        ))}
        {ASSESSMENT_AREAS.map((area, index) => {
          const end = at(index, 5, 108);
          return <line key={area.id} className="assess-chart__grid" x1="160" y1="160" x2={end.x} y2={end.y} />;
        })}
        {shape ? <polygon className="assess-chart__shape" points={shape} /> : null}
      </svg>
      <ul className="assess-legend">
        {ASSESSMENT_AREAS.map((area) => (
          <li key={area.id}>
            <span>{area.label}</span>
            <span>{scores ? scores[area.id] : '—'}</span>
          </li>
        ))}
      </ul>
      {scores ? null : <p className="student-quiet">Save a check-in to see your shape.</p>}
    </div>
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

function angle(index: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / ASSESSMENT_AREAS.length;
}

function at(index: number, value: number, radius: number): { x: number; y: number } {
  const theta = angle(index);
  const span = (value / 5) * radius;
  return { x: 160 + Math.cos(theta) * span, y: 160 + Math.sin(theta) * span };
}

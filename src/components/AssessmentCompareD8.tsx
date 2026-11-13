/**
 * Both-view D8 for screens that are not the roster clipboard: student send,
 * student accept, and the instructor inbox. Reuses CardDiamond (instructor
 * solid blue, student self dashed orange). Display only; nothing is written.
 */
import { useState, type ReactNode } from 'react';
import { assessmentSummary, cardDate, NO_DATE } from '../lib/rosterCard';
import {
  isAssessmentScore,
  type AssessmentEntry,
  type AssessmentScores,
} from '../lib/studentAssessment';
import { CardDiamond, type AssessmentView } from './rosterCard/CoachClipboardCard';
import '../preview/crystallineSweeps/crystallineSweeps.css';
import './assessmentCompareD8.css';

export const NO_INSTRUCTOR_ASSESSMENT_YET = 'No instructor assessment yet.';
export const COMPARE_LABEL = 'Compare';
export const EXPAND_LABEL = 'Expand';
export const COLLAPSE_LABEL = 'Shrink';

export function assessmentEntryFromScores(
  id: string,
  date: string,
  scores: Record<string, number> | null | undefined,
  note = '',
): AssessmentEntry | null {
  if (!scores) return null;
  const next: Partial<AssessmentScores> = {};
  let any = false;
  for (const [key, value] of Object.entries(scores)) {
    if (isAssessmentScore(value)) {
      next[key as keyof AssessmentScores] = value;
      any = true;
    }
  }
  if (!any) return null;
  return { id, date, note, scores: next as AssessmentScores };
}

export function entriesFromScoreRows(
  rows: readonly { id?: string; updateId?: string; date: string; note?: string; scores: Record<string, number> }[],
): AssessmentEntry[] {
  return rows
    .map((row, index) =>
      assessmentEntryFromScores(row.id ?? row.updateId ?? `row-${index}`, row.date, row.scores, row.note ?? ''),
    )
    .filter((row): row is AssessmentEntry => row !== null);
}

const VIEWS: { id: AssessmentView; label: string }[] = [
  { id: 'coach', label: 'Coach' },
  { id: 'self', label: 'Student self' },
  { id: 'both', label: 'Both' },
];


function CompactCompare({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`assess-compare assess-compare--compact${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="assess-compare__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open ? children : null}
    </div>
  );
}

export function AssessmentCompareD8({
  coachEntries,
  selfEntries,
  defaultView = 'both',
  mode = 'full',
  compactLabel = COMPARE_LABEL,
  noCoachMessage = NO_INSTRUCTOR_ASSESSMENT_YET,
}: {
  coachEntries: readonly AssessmentEntry[];
  selfEntries: readonly AssessmentEntry[];
  defaultView?: AssessmentView;
  mode?: 'full' | 'compact';
  compactLabel?: string;
  noCoachMessage?: string;
}) {
  const [view, setView] = useState<AssessmentView>(defaultView);
  const [expanded, setExpanded] = useState(false);
  const assessment = assessmentSummary(coachEntries, selfEntries, view);
  const showCoach = view !== 'self';
  const showSelf = view !== 'coach';
  const hasCoach = Boolean(assessment.coachLatest);
  const hasSelf = Boolean(assessment.selfLatest);
  if (!hasCoach && !hasSelf) return null;

  const coachScores = showCoach && hasCoach ? assessment.coachLatest?.scores ?? null : null;
  // When the instructor has not assessed yet, Both and Student self still show the student's D8.
  const selfScores = showSelf && hasSelf ? assessment.selfLatest?.scores ?? null : null;
  const showSelfLayer = Boolean(selfScores) && (hasCoach ? showSelf : true);
  const showDiamond = Boolean(coachScores) || showSelfLayer;
  const showNoCoach = !hasCoach && showSelfLayer;

  const body = (
    <div
      className={`assess-compare__body${expanded ? ' is-expanded' : ''}`}
      data-testid="assess-compare"
      data-compare-mode={mode}
      data-compare-view={view}
      data-compare-sources={[hasCoach ? 'coach' : null, hasSelf ? 'self' : null].filter(Boolean).join(' ')}
    >
      <div className="assess-compare__toolbar">
        <span className="assess-compare__seg" role="radiogroup" aria-label="Assessment view">
          {VIEWS.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={view === choice.id}
              className={view === choice.id ? 'on' : ''}
              onClick={() => setView(choice.id)}
            >
              {choice.label}
            </button>
          ))}
        </span>
        {mode === 'compact' ? (
          <button
            type="button"
            className="assess-compare__expand"
            aria-expanded={expanded}
            onClick={() => setExpanded((on) => !on)}
          >
            {expanded ? COLLAPSE_LABEL : EXPAND_LABEL}
          </button>
        ) : null}
      </div>
      {showDiamond ? (
        <CardDiamond
          coach={coachScores}
          self={showSelfLayer ? selfScores : null}
        />
      ) : (
        <p className="assess-compare__empty">
          {view === 'self' ? 'No self-assessment yet.' : noCoachMessage}
        </p>
      )}
      {showNoCoach ? <p className="assess-compare__note">{noCoachMessage}</p> : null}
      <div className="assess-compare__legend">
        {showCoach && hasCoach ? (
          <span>
            <i className="coach" />
            Coach · {cardDate(assessment.coachLatest!.date)}
          </span>
        ) : null}
        {showSelfLayer && hasSelf ? (
          <span>
            <i className="self" />
            Self · {cardDate(assessment.selfLatest!.date)}
          </span>
        ) : null}
      </div>
      {mode === 'full' || expanded ? (
        <table className="assess-compare__table">
          <thead>
            <tr>
              <th>Area</th>
              {showCoach ? <th>Coach</th> : null}
              {showSelf ? <th>Self</th> : null}
              {showCoach && showSelf ? <th>Gap</th> : null}
            </tr>
          </thead>
          <tbody>
            {assessment.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.label}</td>
                {showCoach ? <td>{row.coach ?? NO_DATE}</td> : null}
                {showSelf ? <td>{row.self ?? NO_DATE}</td> : null}
                {showCoach && showSelf ? (
                  <td>
                    {row.gap === null ? NO_DATE : row.gap === 0 ? '±0' : row.gap > 0 ? `+${row.gap}` : `−${Math.abs(row.gap)}`}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );

  if (mode === 'compact') {
    return (
      <CompactCompare label={compactLabel}>{body}</CompactCompare>
    );
  }

  return <div className="assess-compare assess-compare--full">{body}</div>;
}

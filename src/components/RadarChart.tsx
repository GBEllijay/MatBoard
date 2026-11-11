import type { ReactNode } from 'react';
import { ASSESSMENT_FORM_AREAS, isAssessmentScore, type AssessmentScore, type AssessmentScores } from '../lib/studentAssessment';
import { radarPoint, radarPoints, radarSeriesLabel, selfAssessmentShapeLabel } from '../lib/radarChart';

export type RadarSeries = {
  name: string;
  scores: AssessmentScores | null;
  tone: 'me' | 'opponent';
};

/** One series matches the original self-assessment chart. Pass series for an overlay. */
export function RadarChart({
  scores = null,
  series,
  title = 'Shape',
  empty = 'Save a check-in to see your shape.',
  note,
}: {
  scores?: Partial<AssessmentScores> | null;
  series?: RadarSeries[];
  title?: string;
  empty?: string;
  note?: string;
}) {
  if (!series) return <SingleRadar scores={scores} note={note} />;
  return <SeriesRadar series={series} title={title} empty={empty} />;
}

function rated(scores: Partial<AssessmentScores> | null, id: (typeof ASSESSMENT_FORM_AREAS)[number]['id']): AssessmentScore | null {
  const value = scores?.[id];
  return isAssessmentScore(value) ? value : null;
}

function SingleRadar({ scores, note }: { scores: Partial<AssessmentScores> | null; note?: string }) {
  const any = ASSESSMENT_FORM_AREAS.some((area) => rated(scores, area.id) !== null);
  const shape = any ? radarPoints(ASSESSMENT_FORM_AREAS.map((area) => rated(scores, area.id) ?? 0)) : '';
  return (
    <div className="assess-visual">
      <h3>Shape</h3>
      <RadarFrame label={selfAssessmentShapeLabel(scores)}>
        {shape ? <polygon className="assess-chart__shape" points={shape} /> : null}
      </RadarFrame>
      <ul className="assess-legend">
        {ASSESSMENT_FORM_AREAS.map((area) => (
          <li key={area.id}>
            <span>{area.label}</span>
            <span>{rated(scores, area.id) ?? '—'}</span>
          </li>
        ))}
      </ul>
      {note ? <p className="student-quiet">{note}</p> : null}
      {any ? null : <p className="student-quiet">Save a check-in to see your shape.</p>}
    </div>
  );
}

function SeriesRadar({ series, title, empty }: { series: RadarSeries[]; title: string; empty: string }) {
  const drawn = [...series].sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'opponent' ? -1 : 1));
  const anyScores = series.some((item) => item.scores);
  return (
    <div className="assess-visual">
      <h3>{title}</h3>
      <RadarFrame label={radarSeriesLabel(series)}>
        {drawn.map((item) =>
          item.scores ? (
            <polygon
              key={`${item.tone}-${item.name}`}
              className={item.tone === 'opponent' ? 'assess-chart__shape assess-chart__shape--opponent' : 'assess-chart__shape'}
              points={radarPoints(ASSESSMENT_FORM_AREAS.map((area) => item.scores?.[area.id] ?? 0))}
            />
          ) : null,
        )}
      </RadarFrame>
      <ul className="assess-key" aria-label="Radar legend">
        {series.map((item) => (
          <li key={`${item.tone}-${item.name}`}>
            <span className={item.tone === 'opponent' ? 'assess-swatch assess-swatch--opponent' : 'assess-swatch assess-swatch--me'} aria-hidden="true" />
            <span>{item.name}</span>
          </li>
        ))}
      </ul>
      {anyScores ? null : <p className="student-quiet">{empty}</p>}
    </div>
  );
}

function RadarFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg className="assess-chart" viewBox="0 0 320 320" role="img" aria-label={label}>
      {[5, 3].map((ring) => (
        <polygon key={ring} className="assess-chart__grid" points={radarPoints(ASSESSMENT_FORM_AREAS.map(() => ring))} />
      ))}
      {ASSESSMENT_FORM_AREAS.map((area, index) => {
        const end = radarPoint(index, 5);
        return <line key={area.id} className="assess-chart__grid" x1="160" y1="160" x2={end.x} y2={end.y} />;
      })}
      {children}
    </svg>
  );
}

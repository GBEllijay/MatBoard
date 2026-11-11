/**
 * Shared Direction A cage for the profile Shape radar and the opponent spider.
 * Labels stay outside the SVG at the live size. The badge uses the same
 * Advantage mask already on the profile radar.
 */
import { useId, type ReactNode } from 'react';
import { AXES, SHEET_AXIS_IDS } from '../preview/assessmentRadar/model.ts';
import { shapeAxisValues } from '../lib/shapeAxes.ts';
import type { AssessmentScores } from '../lib/studentAssessment.ts';
import {
  CAGE_CX,
  CAGE_CY,
  CAGE_DATA,
  CAGE_FENCE,
  CAGE_FRAME,
  CAGE_LOGO,
  CAGE_MAT,
  CAGE_ME,
  CAGE_ME_FILL,
  CAGE_ME_FILL_OVERLAY,
  CAGE_OPPONENT,
  CAGE_OPPONENT_FILL_OPACITY,
  CAGE_OUTER,
  CAGE_POST,
  CAGE_VB,
  CAGE_WIRE,
  CAGE_WIRE_OPACITY,
  CAGE_WIRE_WIDTH,
  cagePoint,
  cageRuns,
  cageSeriesPoints,
  eightValues,
  fencePaths,
  formatCagePoints,
  isCageScore,
  octagonAt,
  octagonPath,
  scoutCageLabel,
} from '../lib/cleanCage.ts';
import './cleanCage.css';

export type CageSeries = {
  id: string;
  tone: 'me' | 'opponent';
  values: readonly (number | null)[];
};

const GRID = { fill: 'none', stroke: '#eef2f8', strokeOpacity: 0.16, strokeWidth: 1 } as const;

function LabelName({ text }: { text: string }) {
  const slash = text.indexOf('/');
  if (slash < 0) return text;
  return (
    <>
      {text.slice(0, slash + 1)}
      <wbr />
      {text.slice(slash + 1)}
    </>
  );
}

export function CleanCageSvg({
  series,
  label,
  meFill,
}: {
  series: readonly CageSeries[];
  label: string;
  meFill: number;
}) {
  const uid = useId().replace(/:/g, '');
  const mat = `cage-mat-${uid}`;
  const frame = `cage-frame-${uid}`;
  const fence = `cage-fence-${uid}`;
  const shadow = `cage-shadow-${uid}`;
  const wires = fencePaths();
  const fenceOuter = CAGE_OUTER - CAGE_FRAME / 2;
  const band = `${octagonPath(fenceOuter)} ${octagonPath(CAGE_MAT)}`;
  const drawn = [...series].sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'opponent' ? -1 : 1));

  return (
    <svg className="oct-svg oct-svg--cage clean-cage-svg" viewBox={`0 0 ${CAGE_VB} ${CAGE_VB}`} role="img" aria-label={label} data-axes="8">
      <defs>
        <radialGradient id={mat} cx="50%" cy="42%" r="68%">
          <stop offset="0" stopColor="#3e4858" />
          <stop offset="1" stopColor="#384252" />
        </radialGradient>
        <linearGradient id={frame} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3e48" />
          <stop offset="1" stopColor="#12141a" />
        </linearGradient>
        <pattern id={fence} width={CAGE_FENCE} height={CAGE_FENCE} patternUnits="userSpaceOnUse">
          <path d={wires.a} stroke={CAGE_WIRE} strokeWidth={CAGE_WIRE_WIDTH} opacity={CAGE_WIRE_OPACITY} fill="none" />
          <path d={wires.b} stroke={CAGE_WIRE} strokeWidth={CAGE_WIRE_WIDTH} opacity={CAGE_WIRE_OPACITY} fill="none" />
        </pattern>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>
      <g filter={`url(#${shadow})`}>
        <polygon points={formatCagePoints(octagonAt(CAGE_MAT))} fill={`url(#${mat})`} />
        <path d={band} fill="#181b22" fillRule="evenodd" />
        <path className="fence-pattern" d={band} fill={`url(#${fence})`} fillRule="evenodd" />
        <polygon
          className="oct-cage"
          points={formatCagePoints(octagonAt(CAGE_OUTER))}
          style={{ fill: 'none', stroke: `url(#${frame})`, strokeWidth: CAGE_FRAME, strokeLinejoin: 'round' }}
        />
        <polygon
          points={formatCagePoints(octagonAt(fenceOuter - 0.6))}
          style={{ fill: 'none', stroke: '#3d434e', strokeWidth: 1 }}
        />
        <polygon
          points={formatCagePoints(octagonAt(CAGE_OUTER + CAGE_FRAME / 2 - 0.45))}
          style={{ fill: 'none', stroke: '#05060a', strokeWidth: 1 }}
        />
        <polygon
          points={formatCagePoints(octagonAt(CAGE_MAT - 1.1))}
          style={{ fill: 'none', stroke: '#6a7384', strokeOpacity: 0.55, strokeWidth: 1 }}
        />
        {octagonAt(CAGE_OUTER).map((post, index) => (
          <g key={index} className="cage-post">
            <circle cx={post.x} cy={post.y} r={CAGE_POST} fill="#12141a" />
            <circle cx={post.x} cy={post.y - 1.15} r="1.35" fill="#2a2e36" />
          </g>
        ))}
      </g>
      {[1, 2, 3, 4, 5].map((step) => (
        <polygon key={step} className="cage-ring" points={formatCagePoints(octagonAt((step / 5) * CAGE_DATA))} style={GRID} />
      ))}
      {Array.from({ length: 8 }, (_, index) => {
        const end = cagePoint(index, 5);
        return <line key={index} className="cage-spoke" x1={CAGE_CX} y1={CAGE_CY} x2={end.x} y2={end.y} style={GRID} />;
      })}
      {drawn.map((item) => (
        <CageSeriesShape key={`${item.tone}-${item.id}`} series={item} meFill={meFill} />
      ))}
      <circle cx={CAGE_CX} cy={CAGE_CY} r={CAGE_LOGO} fill="#0e1726" opacity="0.45" />
    </svg>
  );
}

function CageSeriesShape({ series, meFill }: { series: CageSeries; meFill: number }) {
  const values = eightValues(series.values);
  const tone = series.tone;
  const stroke = tone === 'me' ? CAGE_ME : CAGE_OPPONENT;
  const fill = tone === 'me' ? CAGE_ME_FILL : CAGE_OPPONENT;
  const fillOpacity = tone === 'me' ? meFill : CAGE_OPPONENT_FILL_OPACITY;
  const shapeClass = tone === 'opponent' ? 'assess-chart__shape assess-chart__shape--opponent' : 'assess-chart__shape';
  const lineStyle = {
    fill: 'none',
    stroke,
    strokeWidth: 2.15,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  const closed = cageSeriesPoints(values);
  const dots = values.flatMap((value, index) => (isCageScore(value) ? [{ index, ...cagePoint(index, value) }] : []));
  return (
    <g className={`cage-series cage-series--${tone}`}>
      {closed ? (
        <>
          <polygon
            className={`oct-shape--filled oct-shape--${tone} ${shapeClass}`}
            points={formatCagePoints(closed)}
            style={{ fill, fillOpacity, stroke: 'none' }}
          />
          <polyline className={`oct-shape-line oct-shape-line--${tone}`} points={formatCagePoints([...closed, closed[0]])} style={lineStyle} />
        </>
      ) : (
        cageRuns(values)
          .filter((run) => run.length >= 2)
          .map((run) => {
            const points = run.map((index) => cagePoint(index, values[index] ?? 0));
            return (
              <polyline
                key={run.join('-')}
                className={`oct-shape-line oct-shape-line--${tone} ${shapeClass}`}
                points={formatCagePoints(points)}
                style={lineStyle}
              />
            );
          })
      )}
      {dots.map((dot) => (
        <circle
          key={dot.index}
          className={`oct-dot oct-dot--${tone}`}
          cx={dot.x}
          cy={dot.y}
          r="3.15"
          style={{ fill: stroke, stroke: '#0e1726', strokeWidth: 0.9 }}
        />
      ))}
    </g>
  );
}

export function CageFigure({
  label,
  series,
  scores,
  meFill,
  testId = 'shape-octagon',
  footer,
}: {
  label: string;
  series: readonly CageSeries[];
  /** Omit to leave numbers off the axis labels. */
  scores?: readonly (number | null)[];
  meFill: number;
  testId?: string;
  footer?: ReactNode;
}) {
  const shown = scores ? eightValues(scores) : null;
  const figure = (
    <div className="clean-cage oct-figure oct-figure--placed oct-figure--cage shape-octagon" data-testid={testId}>
      {SHEET_AXIS_IDS.map((id, index) => {
        const axis = AXES.find((item) => item.id === id) ?? AXES[0];
        const value = shown ? shown[index] : null;
        return (
          <p key={id} className="oct-label" data-area={id} aria-hidden="true">
            <span className="oct-label__name">
              <LabelName text={axis.label} />
            </span>
            {shown ? (
              <span className={value == null ? 'oct-label__words' : 'oct-label__score'}>{value == null ? 'Not rated' : String(value)}</span>
            ) : null}
          </p>
        );
      })}
      <div className="oct-chart">
        <CleanCageSvg series={series} label={label} meFill={meFill} />
        <div className="oct-mark" aria-hidden="true" />
      </div>
    </div>
  );
  if (!footer) return figure;
  return (
    <>
      {figure}
      {footer}
    </>
  );
}

export function ScoutCage({
  title,
  empty,
  mine,
  theirs,
  opponentName,
}: {
  title: string;
  empty: string;
  mine: Partial<AssessmentScores> | null;
  theirs: Partial<AssessmentScores> | null;
  opponentName: string;
}) {
  const series: CageSeries[] = [];
  if (mine) series.push({ id: 'me', tone: 'me', values: shapeAxisValues(mine) });
  if (theirs) series.push({ id: 'opponent', tone: 'opponent', values: shapeAxisValues(theirs) });
  const legend = [
    mine ? { tone: 'me' as const, name: 'Me' } : null,
    theirs || !mine ? { tone: 'opponent' as const, name: 'Opponent' } : null,
  ].filter((item): item is { tone: 'me' | 'opponent'; name: string } => item != null);
  return (
    <div className="assess-visual clean-cage-panel scout-cage">
      <h3>{title}</h3>
      <CageFigure
        label={scoutCageLabel(opponentName, mine, theirs)}
        series={series}
        meFill={CAGE_ME_FILL_OVERLAY}
        testId="scout-cage"
        footer={
          <ul className="cage-key assess-key" aria-label="Radar legend">
            {legend.map((item) => (
              <li key={item.tone}>
                <span className={item.tone === 'opponent' ? 'assess-swatch assess-swatch--opponent' : 'assess-swatch assess-swatch--me'} aria-hidden="true" />
                <span>{item.name}</span>
              </li>
            ))}
          </ul>
        }
      />
      {mine || theirs ? null : <p className="student-quiet">{empty}</p>}
    </div>
  );
}

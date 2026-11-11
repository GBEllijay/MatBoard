/**
 * The approved eight-area octagon from the assessment-radar preview
 * (PR 445, 399fdf9). The profile Shape card reuses this drawing.
 * A missing score stays an open corner. It is not drawn as zero.
 */
import { CageFigure } from '../../components/CleanCage.tsx';
import {
  AXES,
  COACH_EXAMPLE_SCORES,
  OCTAGON_CENTER,
  OPPONENT_EXAMPLE_SCORES,
  SHEET_AXIS_IDS,
  SVG_SIZE,
  cageValueList,
  closedRatingPoints,
  formatPoint,
  isCageView,
  pointOnAxis,
  ratingDots,
  ratingSegments,
  ringPoints,
  type AxisId,
} from './model.ts';
import './assessmentRadar.css';

export type ChartVariant = 'current' | 'sheet' | 'center' | 'coach' | 'opponent' | 'comparison';

function displayIndex(variant: ChartVariant, selected: AxisId): number {
  const order = variant === 'current' ? AXES.map((axis) => axis.id) : [...SHEET_AXIS_IDS];
  return order.indexOf(selected);
}

function cageLayers(variant: ChartVariant, values: readonly (number | null)[]): { id: string; values: number[] }[] {
  if (variant === 'comparison') {
    return [
      { id: 'coach', values: cageValueList(COACH_EXAMPLE_SCORES) },
      { id: 'opponent', values: cageValueList(OPPONENT_EXAMPLE_SCORES) },
    ];
  }
  if (!isCageView(variant)) return [];
  return [{ id: variant === 'center' ? 'sheet' : variant, values: values.map((value) => value ?? 0) }];
}

export function Chart({
  values,
  selected,
  label,
  variant,
  openGaps = false,
  markSelected = true,
}: {
  values: (number | null)[];
  selected: AxisId;
  label: string;
  variant: ChartVariant;
  /** Leave a null corner open. The cage preview still closes fictional scores. */
  openGaps?: boolean;
  markSelected?: boolean;
}) {
  const closed = closedRatingPoints(values);
  const segments = ratingSegments(values);
  const dots = ratingDots(values);
  const selectedIndex = markSelected ? displayIndex(variant, selected) : -1;
  const cage = isCageView(variant);
  const complete = values.every((value) => value != null);
  const layers = cage && (!openGaps || complete) ? cageLayers(variant, values) : [];
  const gapCage = openGaps && cage && !complete;
  return (
    <svg
      className={variant === 'sheet' ? 'oct-svg oct-svg--sheet' : cage ? 'oct-svg oct-svg--cage' : 'oct-svg'}
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      role="img"
      aria-label={label}
    >
      {cage ? <polygon className="oct-cage" points={ringPoints(5)} /> : null}
      {cage
        ? null
        : (variant === 'sheet' ? [1, 2, 3, 4, 5] : [5]).map((ring) => (
            <polygon
              key={ring}
              className={ring === 5 ? 'oct-grid oct-grid--outer' : 'oct-grid'}
              points={ringPoints(ring)}
            />
          ))}
      {variant === 'current' ? <polygon className="oct-grid" points={ringPoints(3)} /> : null}
      {cage
        ? null
        : values.map((_, index) => {
            const end = pointOnAxis(index, 5);
            return <line key={index} className="oct-grid" x1={OCTAGON_CENTER} y1={OCTAGON_CENTER} x2={end.x} y2={end.y} />;
          })}
      {layers.map((layer) => {
        const pts = layer.values.map((value, index) => formatPoint(pointOnAxis(index, value)));
        const line = [...pts, pts[0]].join(' ');
        return (
          <g key={layer.id}>
            <polygon className={`oct-shape--filled oct-shape--${layer.id}`} points={pts.join(' ')} />
            <polyline className={`oct-shape-line oct-shape-line--${layer.id}`} points={line} />
            {layer.values.map((value, index) => {
              const point = pointOnAxis(index, value);
              return (
                <circle
                  key={index}
                  className={`oct-dot oct-dot--${layer.id}${index === selectedIndex ? ' oct-dot--on' : ''}`}
                  cx={point.x}
                  cy={point.y}
                  r="3.2"
                />
              );
            })}
          </g>
        );
      })}
      {variant === 'sheet'
        ? [1, 2, 3, 4, 5].map((step) => {
            const spot = pointOnAxis(0, step);
            return (
              <text key={step} className="oct-scale" x={spot.x + 5} y={spot.y + 3}>
                {step}
              </text>
            );
          })
        : null}
      {cage || !closed ? null : <polygon className="oct-shape--closed" points={closed.map((point) => formatPoint(point)).join(' ')} />}
      {cage && !gapCage
        ? null
        : segments.map((segment, index) => (
            <g key={index}>
              {gapCage ? null : <polyline className="oct-shape" points={segment.map((point) => formatPoint(point)).join(' ')} />}
              <polyline className="oct-shape-line" points={segment.map((point) => formatPoint(point)).join(' ')} />
            </g>
          ))}
      {cage && !gapCage
        ? null
        : dots.map((dot) => (
            <circle
              key={dot.index}
              className={dot.index === selectedIndex ? 'oct-dot oct-dot--on' : 'oct-dot'}
              cx={dot.x}
              cy={dot.y}
              r={dot.index === selectedIndex ? 5.5 : 4.2}
            />
          ))}
    </svg>
  );
}

/** Read-only Shape card. The clean cage is shared with the opponent spider. */
export function ApprovedOctagonRadar({
  values,
  label,
}: {
  values: readonly (number | null)[];
  label: string;
}) {
  return (
    <div className="clean-cage-panel">
      <CageFigure label={label} series={[{ id: 'me', tone: 'me', values }]} scores={values} meFill={0.36} />
    </div>
  );
}

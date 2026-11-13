/**
 * Printable instructor D10: front and back of a pentagonal trapezohedron,
 * five kites per pole, one teaching face each. Display only.
 * Fill and score typography match the student D8 diamond. D8 rendering is unchanged.
 */
import { diamondShade } from '../lib/staticDiamond';
import {
  d10Faces,
  d10Kite,
  d10KiteCentroid,
  d10Polar,
  d10Summary,
  type D10Side,
  type InstructorD10Scores,
} from '../lib/instructorD10';

const R = 64;
const OUTER = R / Math.cos(Math.PI / 5);
const LABEL = 58;
const WIDTH = (OUTER + LABEL) * 2;
const POLE = 22 + OUTER * 2 + 26;
const GAP = 18;
const HEIGHT = POLE * 2 + GAP;

function labelLines(label: string): string[] {
  if (label.length <= 11) return [label];
  const space = label.lastIndexOf(' ');
  if (space > 0) return [label.slice(0, space), label.slice(space + 1)];
  const dash = label.lastIndexOf('-');
  if (dash > 0) return [label.slice(0, dash), label.slice(dash + 1)];
  return [label];
}

export function StaticD10({ scores }: { scores: InstructorD10Scores | null }) {
  const faces = d10Faces(scores);
  const cx = WIDTH / 2;
  const poles: Record<D10Side, number> = { front: 22 + OUTER, back: 22 + OUTER + POLE + GAP };
  return (
    <div className="assess-visual report-diamond ip-d10-visual" data-testid="instructor-d10-visual">
      <h3>Shape</h3>
      <svg className="report-diamond__svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={d10Summary(scores)}>
        {(['front', 'back'] as const).map((side) => {
          const cy = poles[side];
          const center = { x: cx, y: cy };
          return (
            <g key={side} data-d10-side={side}>
              <text x={cx} y={11} textAnchor="middle" className="report-diamond__caption">
                {side === 'front' ? 'Front' : 'Back (turned over)'}
              </text>
              {faces
                .filter((face) => face.side === side)
                .map((face) => {
                  const kite = d10Kite(center, R, face.sector);
                  const shade = diamondShade(face.axis.value);
                  const mid = d10KiteCentroid(kite);
                  const tip = d10Polar(center, OUTER + 14, face.sector * 72);
                  const lines = labelLines(face.axis.label);
                  const anchor = tip.x > cx + 6 ? 'start' : tip.x < cx - 6 ? 'end' : 'middle';
                  return (
                    <g key={face.axis.id} data-area={face.axis.id}>
                      <polygon
                        points={kite.map((point) => `${point.x},${point.y}`).join(' ')}
                        fill={shade == null ? '#e8e8ed' : `rgba(12, 35, 68, ${shade.toFixed(2)})`}
                        stroke="#0c2344"
                        strokeWidth={1}
                        strokeLinejoin="round"
                      />
                      <text
                        x={mid.x}
                        y={mid.y + 4}
                        textAnchor="middle"
                        className="report-diamond__score"
                        fill={shade != null && shade > 0.5 ? '#fff' : '#0c2344'}
                      >
                        {face.axis.value ?? '–'}
                      </text>
                      <text
                        x={tip.x}
                        y={tip.y + (tip.y >= cy ? 8 : -2)}
                        textAnchor={anchor}
                        className="report-diamond__label"
                      >
                        {lines.map((line, index) => (
                          <tspan key={line} x={tip.x} dy={index === 0 ? 0 : 10}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                })}
            </g>
          );
        })}
      </svg>
      <p className="student-quiet">Darker face = higher score. – = not rated.</p>
    </div>
  );
}

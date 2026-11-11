import { diamondFaces, diamondShade, diamondSummary, quadrantTriangle, triangleCentroid, type DiamondSide } from '../lib/staticDiamond';
import type { AssessmentScores } from '../lib/studentAssessment';

const R = 62;
const HALF_W = R / 2 + 8 + 92;
const WIDTH = HALF_W * 4 + 24;
const HEIGHT = 18 + R * 2 + 12;

/** Printable D8: front and back of the diamond, one face per area. Display only. */
export function StaticDiamond({ scores }: { scores: Partial<AssessmentScores> | null }) {
  const faces = diamondFaces(scores);
  const cy = 18 + R;
  const centers: Record<DiamondSide, number> = { front: HALF_W, back: WIDTH - HALF_W };
  return (
    <div className="assess-visual report-diamond">
      <h3>Shape</h3>
      <svg className="report-diamond__svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={diamondSummary(scores)}>
        {(['front', 'back'] as const).map((side) => {
          const cx = centers[side];
          const center = { x: cx, y: cy };
          return (
            <g key={side} data-diamond-side={side}>
              <text x={cx} y={11} textAnchor="middle" className="report-diamond__caption">
                {side === 'front' ? 'Front' : 'Back (turned over)'}
              </text>
              {faces
                .filter((face) => face.side === side)
                .map((face) => {
                  const tri = quadrantTriangle(center, R, face.quadrant);
                  const shade = diamondShade(face.axis.value);
                  const mid = triangleCentroid(tri);
                  const right = face.quadrant.endsWith('right');
                  const upper = face.quadrant.startsWith('top');
                  return (
                    <g key={face.axis.id} data-area={face.axis.id}>
                      <polygon
                        points={tri.map((point) => `${point.x},${point.y}`).join(' ')}
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
                        x={right ? cx + R / 2 + 8 : cx - R / 2 - 8}
                        y={upper ? cy - R / 2 - 6 : cy + R / 2 + 14}
                        textAnchor={right ? 'start' : 'end'}
                        className="report-diamond__label"
                      >
                        {face.axis.label}
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

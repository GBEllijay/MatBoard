/**
 * Decorative stills on the Advantage Coach hub tiles.
 * Flat drawing, not a photo and not a cartoon. Aria-hidden by the parent.
 */

export function CoachingToolsScene() {
  return (
    <svg viewBox="0 0 188 108" aria-hidden="true">
      <Notepad />
      <Whiteboard />
      <Sticky x={78} y={58} rotate={-8} fill="#e6c65a" />
      <Sticky x={96} y={66} rotate={7} fill="#f0dc8c" />
      <Phone />
    </svg>
  );
}

/** Owner's flattened still life. Shown whole; the tile must not crop it. */
export function CompetitionScene() {
  return (
    <img
      className="ctm-still"
      src="/ctm-hub-still.png"
      alt=""
      width={845}
      height={495}
      draggable={false}
      aria-hidden="true"
    />
  );
}

function Whiteboard() {
  return (
    <g>
      <rect x="2" y="8" width="102" height="74" rx="2" fill="#d5d8de" />
      <rect x="6" y="12" width="94" height="66" fill="#f7f6f2" />
      {Array.from({ length: 6 }, (_, index) => (
        <line
          key={`v-${index}`}
          x1={18 + index * 14}
          y1="12"
          x2={18 + index * 14}
          y2="78"
          stroke="#e4e6ea"
          strokeWidth="0.6"
        />
      ))}
      {Array.from({ length: 4 }, (_, index) => (
        <line
          key={`h-${index}`}
          x1="6"
          y1={24 + index * 14}
          x2="100"
          y2={24 + index * 14}
          stroke="#e4e6ea"
          strokeWidth="0.6"
        />
      ))}
      <Tree cx={54} cy={46} reach={16} node={4.2} stroke="#2a62b2" nodeFill="#f7f6f2" />
    </g>
  );
}

function Tree({
  cx,
  cy,
  reach,
  node,
  stroke,
  nodeFill,
}: {
  cx: number;
  cy: number;
  reach: number;
  node: number;
  stroke: string;
  nodeFill: string;
}) {
  const spots = [
    [cx, cy - reach],
    [cx + reach, cy],
    [cx, cy + reach],
    [cx - reach, cy],
  ];
  return (
    <g fill="none" stroke={stroke} strokeWidth="1.4">
      {spots.map(([x, y]) => (
        <line key={`${x}-${y}`} x1={cx} y1={cy} x2={x} y2={y} />
      ))}
      <circle cx={cx} cy={cy} r={node + 1.2} fill={nodeFill} />
      {spots.map(([x, y]) => (
        <circle key={`n-${x}-${y}`} cx={x} cy={y} r={node} fill={nodeFill} />
      ))}
    </g>
  );
}

function Notepad() {
  return (
    <g>
      <rect x="108" y="4" width="46" height="62" rx="1.5" fill="#efe8d8" />
      <rect x="108" y="4" width="46" height="7" fill="#e4dcc8" />
      {[0, 1, 2, 3, 4].map((index) => (
        <circle key={index} cx={116 + index * 8} cy="7.5" r="1.5" fill="#f7f4ee" />
      ))}
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <line
          key={index}
          x1="112"
          y1={20 + index * 7}
          x2="150"
          y2={20 + index * 7}
          stroke="#d9d0bc"
          strokeWidth="0.7"
        />
      ))}
    </g>
  );
}

function Sticky({ x, y, rotate, fill }: { x: number; y: number; rotate: number; fill: string }) {
  return (
    <g transform={`rotate(${rotate} ${x + 16} ${y + 13})`}>
      <rect x={x} y={y} width="32" height="26" fill={fill} />
      <line x1={x + 4} y1={y + 8} x2={x + 22} y2={y + 8} stroke="#8d7340" strokeWidth="0.8" />
      <line x1={x + 4} y1={y + 13} x2={x + 26} y2={y + 13} stroke="#8d7340" strokeWidth="0.8" />
      <line x1={x + 4} y1={y + 18} x2={x + 16} y2={y + 18} stroke="#8d7340" strokeWidth="0.8" />
    </g>
  );
}

/** Phone camera app. A handset, not an action camera. */
function Phone() {
  return (
    <g>
      <rect x="132" y="16" width="40" height="78" rx="5" fill="#1a1c22" />
      <rect x="135" y="22" width="34" height="58" rx="1.5" fill="#0e1014" />
      <Tree cx={152} cy={48} reach={10} node={2.4} stroke="#d5dbe6" nodeFill="#0e1014" />
      <circle cx="152" cy="86" r="4.2" fill="none" stroke="#c8ccd4" strokeWidth="1.3" />
    </g>
  );
}

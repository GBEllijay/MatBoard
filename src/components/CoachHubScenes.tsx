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

export function CompetitionScene() {
  return (
    <svg viewBox="0 0 188 108" aria-hidden="true">
      <Mouthguard />
      <Timer />
      <GamePlan />
      <Pencil />
      <IndexBox />
      <Scale />
    </svg>
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

function Mouthguard() {
  return (
    <g transform="translate(128 2)" opacity="0.95">
      <path
        d="M8 18c0-10 10-16 26-16s26 6 26 16v10c0 8-6 14-14 16-4 1-8 6-12 6s-8-5-12-6C14 42 8 36 8 28z"
        fill="#c8102e"
      />
      <path
        d="M16 20c0-6 7-10 18-10s18 4 18 10v6c0 5-4 9-10 10-3 1-6 4-8 4s-5-3-8-4c-6-1-10-5-10-10z"
        fill="#f7f4ee"
      />
    </g>
  );
}

function Timer() {
  return (
    <g>
      <rect x="2" y="2" width="74" height="32" rx="3" fill="#14161c" />
      <text
        x="39"
        y="24"
        textAnchor="middle"
        fill="#f4f1ea"
        fontSize="15"
        fontFamily="ui-monospace, monospace"
        fontWeight="700"
      >
        03:00
      </text>
    </g>
  );
}

function GamePlan() {
  return (
    <g>
      <rect x="2" y="42" width="72" height="58" rx="1.5" fill="#f7f4ee" stroke="#ddd6c8" strokeWidth="0.6" />
      <text x="6" y="54" fill="#14161c" fontSize="7" fontWeight="800" letterSpacing="0.4">
        GAME PLAN
      </text>
      <PlanRow y={66} label="A" />
      <PlanRow y={78} label="B" />
      <PlanRow y={90} label="C" />
    </g>
  );
}

function PlanRow({ y, label }: { y: number; label: string }) {
  return (
    <g>
      <text x="6" y={y} fill="#14161c" fontSize="8" fontWeight="800">
        {label}
      </text>
      <line x1="16" y1={y - 1} x2="66" y2={y - 1} stroke="#cfc6b6" strokeWidth="0.8" />
    </g>
  );
}

function Pencil() {
  return (
    <g transform="rotate(38 86 70)">
      <rect x="70" y="66" width="36" height="5" rx="0.4" fill="#c4a06a" />
      <polygon points="106,66 112,68.5 106,71" fill="#2c2c2c" />
      <rect x="70" y="66" width="4" height="5" fill="#d98b8b" />
    </g>
  );
}

function IndexBox() {
  const names = ['David', 'Sarah', 'Mike'];
  return (
    <g>
      {names.map((name, index) => (
        <g key={name} transform={`translate(${86 + index * 16} ${28 - index * 2})`}>
          <rect width="28" height="40" rx="1" fill={index === 1 ? '#fff' : '#f4f1ea'} stroke="#e4ddd0" strokeWidth="0.5" />
          <text x="3" y="12" fill="#14161c" fontSize="6.5" fontWeight="700">
            {name}
          </text>
        </g>
      ))}
      <path d="M82 62h78l-6 16H88z" fill="#2c3038" />
      <path d="M88 62h66v4H88z" fill="#1a1c22" />
    </g>
  );
}

function Scale() {
  return (
    <g>
      <rect x="96" y="82" width="58" height="22" rx="3" fill="#2a2d33" />
      <rect x="100" y="86" width="36" height="14" rx="1" fill="#1a241c" />
      <text x="118" y="96" textAnchor="middle" fill="#cfe6cc" fontSize="8" fontFamily="ui-monospace, monospace" fontWeight="700">
        82.5
      </text>
      <text x="142" y="96" fill="#9aa3b5" fontSize="6" fontWeight="700">
        kg
      </text>
    </g>
  );
}

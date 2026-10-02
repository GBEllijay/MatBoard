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
      <Timer />
      <GamePlan />
      <Pencil />
      <IndexBox />
      <Scale />
      <Mouthguard />
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

/**
 * Horseshoe mouthguard, top view. Matte black shell, glossy red tooth channel.
 * No brand mark. Sits in the open corner above the index box.
 */
function Mouthguard() {
  return (
    <g transform="translate(140 1)">
      <path
        fill="#16181c"
        d="M1 12C1 6 5 2.5 10 3.2H12C13.6 3.2 14 6.2 14 8.6V15.5C14 21 17 24.5 21.5 24.5C26 24.5 29 21 29 15.5V8.6C29 6.2 29.4 3.2 31 3.2H33C38 2.5 42 6 42 12V19C42 28 34 32.5 21.5 32.5C9 32.5 1 28 1 19Z"
      />
      <path
        d="M7.2 9.2V16.2C7.2 23 12.6 27.2 21.5 27.2C30.4 27.2 35.8 23 35.8 16.2V9.2"
        fill="none"
        stroke="#d10e16"
        strokeWidth="5.2"
        strokeLinecap="round"
      />
      <path
        d="M7.2 10V16.2C7.2 21.6 12.6 25.2 21.5 25.2C30.4 25.2 35.8 21.6 35.8 16.2V10"
        fill="none"
        stroke="#ff6a48"
        strokeWidth="1.6"
        strokeLinecap="round"
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

/** Open matte index box. Ribbed lid, hinge, and A–E tabbed dividers. */
function IndexBox() {
  const tabs = [
    { letter: 'B', x: 22, fill: '#f5a000' },
    { letter: 'C', x: 34, fill: '#ef4b3a' },
    { letter: 'D', x: 46, fill: '#b6dc45' },
    { letter: 'E', x: 58, fill: '#3ec6e6' },
  ];
  return (
    <g transform="translate(102 36)">
      <path d="M8 11L14 0.6h52l6 10.4z" fill="#14161a" />
      {Array.from({ length: 9 }, (_, index) => {
        const t = (index + 1) / 10;
        return (
          <line
            key={index}
            x1={16 + t * 48}
            y1="1.6"
            x2={12 + t * 56}
            y2="10.4"
            stroke="#3a3f48"
            strokeWidth="0.75"
          />
        );
      })}
      <rect x="33" y="0" width="14" height="1.8" rx="0.5" fill="#2c3036" />
      <rect x="12" y="10.3" width="56" height="2" rx="0.6" fill="#4a4f58" />
      <rect width="80" height="26" x="0" y="13" rx="3" fill="#1a1c20" />
      <rect x="3" y="16" width="74" height="16" rx="1" fill="#0e1014" />
      <rect x="5" y="22.2" width="68" height="12.4" rx="1" fill="#f6d000" />
      <rect x="6" y="15.4" width="12" height="8" rx="1.4" fill="#f6d000" />
      <text
        x="12"
        y="21.2"
        textAnchor="middle"
        fill="#14161c"
        fontSize="5.4"
        fontWeight="800"
        fontFamily="sans-serif"
      >
        A
      </text>
      {tabs.map((tab) => (
        <g key={tab.letter}>
          <rect x={tab.x} y="15.6" width="11" height="7.4" rx="1.3" fill={tab.fill} />
          <text
            x={tab.x + 5.5}
            y="21"
            textAnchor="middle"
            fill="#14161c"
            fontSize="5.2"
            fontWeight="800"
            fontFamily="sans-serif"
          >
            {tab.letter}
          </text>
        </g>
      ))}
      <rect width="80" height="4.2" x="0" y="34.8" rx="1.4" fill="#121418" />
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

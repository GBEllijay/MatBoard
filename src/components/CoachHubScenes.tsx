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
 * Horseshoe mouthguard in a shallow 3/4 view. Matte black shell, glossy red
 * channel, no brand mark. Sits at the top right.
 */
function Mouthguard() {
  return (
    <g transform="translate(140 1) scale(0.88)">
      <defs>
        <linearGradient id="ctm-shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4e535c" />
          <stop offset="0.4" stopColor="#22262c" />
          <stop offset="1" stopColor="#0c0e12" />
        </linearGradient>
        <linearGradient id="ctm-channel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a0c14" />
          <stop offset="0.45" stopColor="#e10e18" />
          <stop offset="1" stopColor="#ff5a40" />
        </linearGradient>
      </defs>
      <ellipse cx="26" cy="37" rx="16" ry="2" fill="#000" opacity="0.16" />
      <path
        fill="url(#ctm-shell)"
        d="M3 13C2 20 7 29 16 34C22 37 32 37 38 34C47 29 51 20 49 13L40 14C38 22 33 27 26 28C19 29 13 24 11 17L8 13Z"
      />
      <path fill="#3c414a" d="M5 13C4 17 7 22 12 25C10 20 9 16 8 13C12 10 18 12 22 16C20 12 16 9 10 10C8 10 6 11 5 13Z" />
      <path fill="#3c414a" d="M47 13C48 17 45 22 40 25C42 20 43 16 44 13C40 10 34 12 30 16C32 12 36 9 42 10C44 10 46 11 47 13Z" />
      <path
        fill="url(#ctm-channel)"
        d="M11 14C10 19 13 25 19 28C23 30 30 30 34 28C40 25 43 19 42 14L36 15C35 20 31 23 26 24C21 25 17 22 16 17Z"
      />
      <path
        d="M17 18C21 22 30 23 36 19"
        fill="none"
        stroke="#ffe4dc"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path d="M16 32C21 35 32 35 38 32" fill="none" stroke="#050608" strokeWidth="1.6" strokeLinecap="round" />
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

/** Rests on the game-plan sheet, not across the index box. */
function Pencil() {
  return (
    <g transform="rotate(-34 58 86)">
      <rect x="34" y="84" width="40" height="4" rx="0.4" fill="#c4a06a" />
      <polygon points="74,84 80,86 74,88" fill="#2c2c2c" />
      <rect x="34" y="84" width="3.5" height="4" fill="#d98b8b" />
    </g>
  );
}

/** Open matte index box. Ribbed lid, thumb notch, plain ruled white cards. */
function IndexBox() {
  return (
    <g transform="translate(96 64)">
      <path d="M12 13L18 1h52l6 12z" fill="#12141a" />
      <line x1="20" y1="3.2" x2="70" y2="3.2" stroke="#3d424a" strokeWidth="0.65" />
      <line x1="18" y1="5.8" x2="72" y2="5.8" stroke="#3d424a" strokeWidth="0.65" />
      <line x1="17" y1="8.4" x2="73" y2="8.4" stroke="#3d424a" strokeWidth="0.65" />
      <line x1="16" y1="11" x2="74" y2="11" stroke="#3d424a" strokeWidth="0.65" />
      <rect x="20" y="12.2" width="48" height="2" rx="0.5" fill="#4a4f58" />
      <rect x="0" y="16" width="88" height="26" rx="3.5" fill="#1a1c20" />
      <path d="M0 20c6-6 10-4 12 2v16H0z" fill="#22262c" />
      <path d="M88 20c-6-6-10-4-12 2v16H88z" fill="#14161a" />
      <rect x="10" y="15.2" width="68" height="2" fill="#e7e2da" />
      <rect x="10" y="17" width="68" height="1.8" fill="#f3efe8" />
      <rect x="9" y="18.6" width="70" height="14" fill="#fbfaf7" />
      <line x1="13" y1="21.4" x2="75" y2="21.4" stroke="#e0d9ce" strokeWidth="0.4" />
      <line x1="13" y1="24.2" x2="75" y2="24.2" stroke="#e0d9ce" strokeWidth="0.4" />
      <line x1="13" y1="27" x2="75" y2="27" stroke="#e0d9ce" strokeWidth="0.4" />
      <line x1="13" y1="29.8" x2="75" y2="29.8" stroke="#e0d9ce" strokeWidth="0.4" />
      <path
        fill="#181a1e"
        d="M0 26h20c1.5 0 2.4 1 5.2 5.2 2.4 3.6 6.2 5.6 12.8 5.6s10.4-2 12.8-5.6C53.6 27 54.5 26 56 26H88V42H0z"
      />
    </g>
  );
}

function Scale() {
  return (
    <g>
      <rect x="80" y="6" width="58" height="22" rx="3" fill="#2a2d33" />
      <rect x="84" y="10" width="36" height="14" rx="1" fill="#1a241c" />
      <text x="102" y="20" textAnchor="middle" fill="#cfe6cc" fontSize="8" fontFamily="ui-monospace, monospace" fontWeight="700">
        82.5
      </text>
      <text x="126" y="20" fill="#9aa3b5" fontSize="6" fontWeight="700">
        kg
      </text>
    </g>
  );
}

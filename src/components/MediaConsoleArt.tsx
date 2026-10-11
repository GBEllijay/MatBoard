import { useEffect, useState } from 'react';
import {
  MEDIA_CONSOLE_ART_KEY,
  pickMediaConsoleArt,
  type MediaConsoleArt,
  isMediaConsoleArt,
} from '../lib/mediaConsoleArt';

function readLastArt(): MediaConsoleArt | null {
  try {
    const value = sessionStorage.getItem(MEDIA_CONSOLE_ART_KEY);
    return isMediaConsoleArt(value) ? value : null;
  } catch {
    return null;
  }
}

function rememberArt(art: MediaConsoleArt) {
  try {
    sessionStorage.setItem(MEDIA_CONSOLE_ART_KEY, art);
  } catch {
    /* private mode */
  }
}

/** Centered header picture. Changes on each visit. Not a link. */
export function MediaConsoleMark() {
  const [art] = useState(() => pickMediaConsoleArt(readLastArt()));

  useEffect(() => {
    rememberArt(art);
  }, [art]);

  return (
    <div className="media-art" data-media-art={art} aria-hidden="true">
      {art === 'tv' ? <ShopTv /> : art === 'monitor' ? <LessonMonitor /> : <RosterCard />}
    </div>
  );
}

function ShopTv() {
  return (
    <svg viewBox="0 0 320 210" role="presentation">
      <rect x="24" y="6" width="272" height="162" rx="12" fill="#1a2230" />
      <rect x="36" y="16" width="248" height="140" rx="6" fill="#0c1424" />
      <text x="48" y="38" fill="#e7edf6" fontFamily="Inter, system-ui, sans-serif" fontSize="16" fontWeight="700">
        Pro Shop
      </text>
      <ShopTile x={48} y={50} cloth="#f4f1ea" ink="#1c2430" />
      <ShopTile x={108} y={50} cloth="#2f6fd0" ink="#f4f7fb" />
      <ShopTile x={168} y={50} cloth="#f7f7f5" ink="#1c2430" />
      <ShopTile x={228} y={50} cloth="#1a1c22" ink="#f4f1ea" />
      <ShopTile x={48} y={100} cloth="#14161c" ink="#f4f1ea" accent="#6b2d91" />
      <ShopTile x={108} y={100} cloth="#243044" ink="#d5dbe6" />
      <ShopTile x={168} y={100} cloth="#6b2d91" ink="#f6eefe" />
      <ShopTile x={228} y={100} cloth="#0e1420" ink="#c5cedb" accent="#004eba" />
      <rect x="146" y="168" width="28" height="16" fill="#2a3344" />
      <rect x="112" y="182" width="96" height="10" rx="4" fill="#2a3344" />
    </svg>
  );
}

function ShopTile({ x, y, cloth, ink, accent }: { x: number; y: number; cloth: string; ink: string; accent?: string }) {
  return (
    <g>
      <rect x={x} y={y} width="52" height="42" rx="5" fill="#162033" />
      <path d={`M${x + 16} ${y + 10} h20 l4 8 h-6 l2 16 h-16 l2-16 h-6 z`} fill={cloth} />
      <path d={`M${x + 18} ${y + 18} h16`} stroke={accent ?? ink} strokeWidth="2" />
    </g>
  );
}

function LessonMonitor() {
  return (
    <svg viewBox="0 0 320 210" role="presentation">
      <rect x="46" y="8" width="228" height="150" rx="14" fill="#d5dbe3" />
      <rect x="56" y="16" width="208" height="122" rx="6" fill="#10192a" />
      <rect x="138" y="158" width="44" height="16" fill="#c5ccd6" />
      <rect x="112" y="172" width="96" height="12" rx="4" fill="#b7c0cc" />
      <text x="68" y="40" fill="#9eb0c8" fontFamily="Inter, system-ui, sans-serif" fontSize="11" fontWeight="700">
        Lesson Title:
      </text>
      <text x="68" y="58" fill="#f4f7fb" fontFamily="Inter, system-ui, sans-serif" fontSize="13" fontWeight="800">
        Daily Lesson Plan
      </text>
      <Check y={74} label="Warm-up Drills" />
      <Check y={92} label="Technique Review" />
      <Check y={110} label="Live Sparring" />
      <rect x="176" y="70" width="74" height="52" rx="4" fill="#1a2740" />
      <circle cx="198" cy="96" r="8" fill="#24344f" />
      <circle cx="226" cy="96" r="8" fill="#24344f" />
      <path d="M190 108 h16 l4 8 h-24 z" fill="#2c3d5c" />
      <path d="M214 108 h16 l4 8 h-24 z" fill="#6b2d91" />
      <circle cx="213" cy="96" r="10" fill="#f4f7fb" />
      <path d="M210 91 l8 5-8 5 z" fill="#10192a" />
    </svg>
  );
}

function Check({ y, label }: { y: number; label: string }) {
  return (
    <g>
      <text x="68" y={y} fill="#d5deea" fontFamily="Inter, system-ui, sans-serif" fontSize="11" fontWeight="600">
        {`- ${label}`}
      </text>
    </g>
  );
}

function RosterCard() {
  return (
    <svg viewBox="0 0 320 210" role="presentation">
      <rect x="78" y="18" width="164" height="176" rx="6" fill="#f3ecdf" />
      <rect x="78" y="18" width="164" height="28" rx="6" fill="#e7dfd0" />
      <rect x="78" y="38" width="164" height="8" fill="#e7dfd0" />
      <text x="92" y="38" fill="#1c2430" fontFamily="Inter, system-ui, sans-serif" fontSize="14" fontWeight="800">
        Roster
      </text>
      <RosterLine y={62} name="Ana" chip="#f7f4ee" />
      <RosterLine y={90} name="Luis" chip="#004eba" />
      <RosterLine y={118} name="Mia" chip="#6b2d91" />
      <RosterLine y={146} name="Theo" chip="#6b3a1f" />
    </svg>
  );
}

function RosterLine({ y, name, chip }: { y: number; name: string; chip: string }) {
  return (
    <g>
      <line x1="92" y1={y + 8} x2="226" y2={y + 8} stroke="#d9d0c0" strokeWidth="1" />
      <text x="92" y={y} fill="#1c2430" fontFamily="Inter, system-ui, sans-serif" fontSize="13" fontWeight="700">
        {name}
      </text>
      <rect x="206" y={y - 12} width="18" height="12" rx="2" fill={chip} stroke="#1c2430" strokeWidth="0.6" />
    </g>
  );
}

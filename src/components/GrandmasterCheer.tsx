import { useEffect, useState } from 'react';
import {
  grandmasterById,
  isGrandmasterId,
  pickGrandmaster,
  readLastGrandmasterId,
  writeLastGrandmasterId,
  type GrandmasterId,
} from '../lib/grandmasters';

const CONFETTI = [
  { left: '6%', delay: '0s', color: '#ff4d6d', duration: '3.4s', rotate: '-18deg' },
  { left: '14%', delay: '0.4s', color: '#ffd166', duration: '3.8s', rotate: '24deg' },
  { left: '22%', delay: '0.15s', color: '#4cc9f0', duration: '3.1s', rotate: '12deg' },
  { left: '31%', delay: '0.7s', color: '#80ed99', duration: '3.6s', rotate: '-30deg' },
  { left: '40%', delay: '0.2s', color: '#f72585', duration: '3.2s', rotate: '8deg' },
  { left: '48%', delay: '0.55s', color: '#ff9f1c', duration: '3.9s', rotate: '-12deg' },
  { left: '57%', delay: '0.1s', color: '#c77dff', duration: '3.3s', rotate: '20deg' },
  { left: '66%', delay: '0.85s', color: '#fee440', duration: '3.5s', rotate: '-8deg' },
  { left: '74%', delay: '0.3s', color: '#4ea8de', duration: '3.7s', rotate: '16deg' },
  { left: '83%', delay: '0.6s', color: '#ff6b6b', duration: '3.2s', rotate: '-22deg' },
  { left: '91%', delay: '0.25s', color: '#b8f2e6', duration: '3.8s', rotate: '10deg' },
  { left: '18%', delay: '1s', color: '#ffd6a5', duration: '3.4s', rotate: '28deg' },
  { left: '52%', delay: '1.1s', color: '#caffbf', duration: '3.6s', rotate: '-14deg' },
  { left: '78%', delay: '0.95s', color: '#bdb2ff', duration: '3.1s', rotate: '6deg' },
] as const;

function boxStyle(box: { left: number; top: number; width: number; height: number }) {
  return {
    left: `${box.left}%`,
    top: `${box.top}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
  };
}

/** Query hook so a test can show one master on the TV and the controller together. */
export function grandmasterIdFromLocation(): GrandmasterId | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = new URLSearchParams(window.location.search).get('grandmaster');
    return isGrandmasterId(value) ? value : null;
  } catch {
    return null;
  }
}

/** Grandmaster slide-in. Shared by the bracket champion, the match scoreboard, and the blue-belt graduation. */
export function GrandmasterCheer({
  lines,
  board = false,
  corner = false,
  onDismiss,
  masterId = null,
}: {
  lines: readonly string[];
  board?: boolean;
  /** Bracket dock: small, in the reserved corner, not over the tree. */
  corner?: boolean;
  /** Optional close control. The overlay itself does not take taps. */
  onDismiss?: () => void;
  /** Synced pick. When omitted, this cheer chooses once and skips the master shown last. */
  masterId?: GrandmasterId | null;
}) {
  const forced = grandmasterIdFromLocation();
  const [localPick] = useState<GrandmasterId>(() => forced ?? masterId ?? pickGrandmaster(readLastGrandmasterId()));
  const id = forced ?? masterId ?? localPick;
  const master = grandmasterById(id);
  const lastIsScore = lines.length > 2;

  useEffect(() => {
    if (forced) return;
    writeLastGrandmasterId(id);
  }, [forced, id]);

  return (
    <div
      className={`kids-grandmaster kids-grandmaster--${id}${board ? ' kids-grandmaster--board' : ''}${corner ? ' kids-grandmaster--corner' : ''}${onDismiss ? ' kids-grandmaster--dismiss' : ''}`}
      data-grandmaster={id}
      role="status"
    >
      <div className="kids-confetti" aria-hidden="true">
        {CONFETTI.map((piece) => (
          <span
            key={`${piece.left}-${piece.delay}`}
            style={{
              left: piece.left,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
              background: piece.color,
              ['--kids-spin' as string]: piece.rotate,
            }}
          />
        ))}
      </div>
      <figure className="kids-grandmaster__figure">
        <p className="kids-grandmaster__bubble">
          {lines.map((line, index) => (
            <span
              key={`${index}-${line}`}
              className={
                index === 0
                  ? 'kids-grandmaster__cheer'
                  : lastIsScore && index === lines.length - 1
                    ? 'kids-grandmaster__score'
                    : 'kids-grandmaster__name'
              }
            >
              {line}
            </span>
          ))}
        </p>
        <div className="kids-grandmaster__portrait">
          <img className="kids-grandmaster__frame" src={master.src} alt="" width={845} height={1200} />
          {master.nodSrc ? (
            <img
              className="kids-grandmaster__frame kids-grandmaster__frame--nod"
              src={master.nodSrc}
              alt=""
              width={845}
              height={1200}
            />
          ) : null}
          <span className="kids-grandmaster__face" style={boxStyle(master.face)} aria-hidden="true" />
          {master.avoid.map((box) => (
            <span
              key={`${box.left}-${box.top}-${box.width}`}
              className="kids-grandmaster__avoid"
              style={boxStyle(box)}
              aria-hidden="true"
            />
          ))}
        </div>
      </figure>
      {onDismiss ? (
        <button type="button" className="ink-btn ink-btn--save kids-grandmaster__dismiss" onClick={onDismiss}>
          Got it
        </button>
      ) : null}
    </div>
  );
}

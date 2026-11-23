import { useId } from 'react';
import { useHoldPress } from '../hooks/useHoldPress';
import { dispatchMatch, type ScoreKind, type Side } from '../lib/matchStore';
import { OLD_SCHOOL_FLAP_PLACES, flapDigits } from '../lib/scoreboardSkin';

const SHORT_LABELS: Record<ScoreKind, string> = {
  points: 'Points',
  advantages: 'Adv',
  disadvantages: 'Pen',
};

const WIDE_LABELS: Record<ScoreKind, string> = {
  points: 'Points',
  advantages: 'Advantages',
  disadvantages: 'Penalties',
};

const FLAP_PLACES: Record<ScoreKind, number> = OLD_SCHOOL_FLAP_PLACES;

/** Satin edge glint on forged dark gunmetal hinge rings. */
function wireGlint(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx - rx * 0.55} ${cy - ry * 0.78} A ${rx} ${ry} 0 0 0 ${cx - rx * 0.9} ${cy + ry * 0.22}`;
}

/**
 * Matte gunmetal scoreboard-flip hinge bar with forged dark-steel dual rings
 * and riveted grommets (Old School), or clean recessed split-flap cap (Split-Flap Pro).
 * viewBox y = 13.8 meets the card top.
 */
export function FlipRings({ variant = 'old-school' }: { variant?: 'old-school' | 'split-flap' }) {
  const uid = useId().replace(/:/g, '');
  if (variant === 'split-flap') {
    return (
      <svg className="flap__rings flap__rings--split-flap" viewBox="0 0 100 32" aria-hidden="true" shapeRendering="geometricPrecision">
        <rect x="2" y="10.2" width="96" height="3.6" rx="1.2" fill="#1e2530" />
        <rect x="2" y="10.2" width="96" height="0.8" fill="#3a4556" />
        <circle cx="10" cy="12" r="1.15" fill="#4b5769" />
        <circle cx="90" cy="12" r="1.15" fill="#4b5769" />
      </svg>
    );
  }

  const gunmetal = `${uid}-gunmetal`;
  const rail = `${uid}-rail`;
  const rim = `${uid}-rim`;
  const front = `${uid}-front`;
  const rings = [27, 73] as const;
  const rx = 8.4;
  const ry = 8.6;
  const cy = 11.4;
  const cardLine = 13.8;
  const railY = 5.4;
  const railH = 4.6;
  const holeY = 20.2;
  const holeR = 3.8;

  return (
    <svg className="flap__rings" viewBox="0 0 100 32" aria-hidden="true" shapeRendering="geometricPrecision">
      <defs>
        <linearGradient id={gunmetal} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#697381" />
          <stop offset="40%" stopColor="#3c434d" />
          <stop offset="78%" stopColor="#1b1f25" />
          <stop offset="100%" stopColor="#48505c" />
        </linearGradient>
        <linearGradient id={rail} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#464d58" />
          <stop offset="45%" stopColor="#262b32" />
          <stop offset="100%" stopColor="#121519" />
        </linearGradient>
        <linearGradient id={rim} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#5a6370" />
          <stop offset="50%" stopColor="#2c323b" />
          <stop offset="100%" stopColor="#121519" />
        </linearGradient>
        <clipPath id={front} clipPathUnits="userSpaceOnUse">
          <rect x="-8" y="0" width="116" height={cardLine + 0.15} />
          {rings.map((cx) => (
            <rect
              key={`near-${cx}`}
              x={cx - rx - 2.4}
              y={cardLine}
              width={rx + 2.8}
              height={holeY + holeR - cardLine}
            />
          ))}
          {rings.map((cx) => (
            <circle key={`eye-${cx}`} cx={cx} cy={holeY} r={holeR - 0.1} />
          ))}
        </clipPath>
      </defs>
      {/* Riveted gunmetal grommets punched into the top of the card */}
      {rings.map((cx) => (
        <g key={`grommet-${cx}`}>
          <circle cx={cx} cy={holeY} r={holeR + 1.5} fill={`url(#${rim})`} stroke="#0a0c0f" strokeWidth="0.45" />
          <circle cx={cx} cy={holeY} r={holeR} fill="#060709" />
        </g>
      ))}
      {/* Forged dark-gunmetal hinge loops */}
      <g fill="none" stroke={`url(#${gunmetal})`} strokeWidth="2.8" strokeLinecap="butt" clipPath={`url(#${front})`}>
        {rings.map((cx) => (
          <ellipse key={`wire-${cx}`} cx={cx} cy={cy} rx={rx} ry={ry} />
        ))}
      </g>
      <g fill="none" stroke="rgba(205, 218, 232, 0.34)" strokeWidth="0.55" strokeLinecap="butt" clipPath={`url(#${front})`}>
        {rings.map((cx) => (
          <path key={`glint-${cx}`} d={wireGlint(cx, cy, rx, ry)} />
        ))}
      </g>
      {/* Heavy matte gunmetal hinge bar with machined rivets */}
      <rect x="-6" y={railY} width="112" height={railH} rx="1.1" fill={`url(#${rail})`} />
      <rect x="-6" y={railY} width="112" height="0.8" fill="rgba(180, 194, 210, 0.25)" />
      <rect x="-6" y={railY + railH - 0.7} width="112" height="0.7" fill="#07090b" />
      <circle cx="8" cy={railY + railH / 2} r="1.2" fill="#4f5866" stroke="#0c0e12" strokeWidth="0.4" />
      <circle cx="92" cy={railY + railH / 2} r="1.2" fill="#4f5866" stroke="#0c0e12" strokeWidth="0.4" />
    </svg>
  );
}

type Props = {
  side: Side;
  kind: ScoreKind;
  value: number;
  compact?: boolean;
  /** Old School and Split-Flap Pro flip cards. The button name still includes the score. */
  flap?: boolean;
  flapVariant?: 'old-school' | 'split-flap';
};

export function ScoreBox({ side, kind, value, compact, flap = false, flapVariant = 'old-school' }: Props) {
  const handlers = useHoldPress(
    () => dispatchMatch({ type: 'bump', side, kind, delta: 1 }),
    () => dispatchMatch({ type: 'bump', side, kind, delta: -1 }),
  );
  const digits = flap ? flapDigits(value, FLAP_PLACES[kind]) : [];

  return (
    <button
      type="button"
      className={`score score--${kind}${compact ? ' score--compact' : ''}${flap ? ' score--flap' : ''}`}
      aria-label={`${SHORT_LABELS[kind]} ${value}. Tap to add, hold to subtract.`}
      {...handlers}
    >
      <span className="score__label score__label--short">{SHORT_LABELS[kind]}</span>
      <span className="score__label score__label--wide">{WIDE_LABELS[kind]}</span>
      {flap ? (
        <span className="flap" aria-hidden="true">
          {digits.map((digit, index) => (
            <span key={index} className="flap__slot">
              <FlipRings variant={flapVariant} />
              <span key={`${index}-${digit}`} className="flap__card">
                <span className="flap__face">{digit}</span>
                <span className="flap__seam" />
              </span>
            </span>
          ))}
        </span>
      ) : (
        <span className="score__value">{value}</span>
      )}
    </button>
  );
}

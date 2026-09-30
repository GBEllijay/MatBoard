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

/** Highlight on the near side of the wire, below where the rail covers the crown. */
function wireGlint(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx - rx * 0.92} ${cy + ry * 0.05} A ${rx} ${ry} 0 0 1 ${cx - rx * 0.35} ${cy - ry * 0.72}`;
}

/**
 * Two thin chrome rings. The crown sits above the rail, the wire passes
 * behind that bar, the sides come forward, and the bottom crosses a grommet.
 * viewBox y = 13.2 is the card's top edge (see .flap__rings).
 */
function FlipRings() {
  const uid = useId().replace(/:/g, '');
  const metal = `${uid}-metal`;
  const rim = `${uid}-rim`;
  const rings = [28, 72] as const;
  const rx = 10.2;
  const ry = 10;
  const cy = 14.2;
  const holeY = 24.2;
  const holeR = 6.2;

  return (
    <svg className="flap__rings" viewBox="0 0 100 34" aria-hidden="true" shapeRendering="geometricPrecision">
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#b7c4cd" />
          <stop offset="28%" stopColor="#ffffff" />
          <stop offset="52%" stopColor="#7f8c96" />
          <stop offset="74%" stopColor="#f4f8fb" />
          <stop offset="100%" stopColor="#dce4ea" />
        </linearGradient>
        <linearGradient id={rim} x1="0.2" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#c5d0d8" />
          <stop offset="100%" stopColor="#59636b" />
        </linearGradient>
      </defs>
      {rings.map((cx) => (
        <g key={`grommet-${cx}`}>
          <circle cx={cx} cy={holeY} r={holeR + 1.25} fill={`url(#${rim})`} />
          <circle cx={cx} cy={holeY} r={holeR - 0.15} fill="#050505" />
        </g>
      ))}
      <g fill="none" stroke={`url(#${metal})`} strokeWidth="1.85" strokeLinecap="butt">
        {rings.map((cx) => (
          <ellipse key={`wire-${cx}`} cx={cx} cy={cy} rx={rx} ry={ry} />
        ))}
      </g>
      <g fill="none" stroke="#ffffff" strokeWidth="0.42" strokeLinecap="butt">
        {rings.map((cx) => (
          <path key={`glint-${cx}`} d={wireGlint(cx, cy, rx, ry)} />
        ))}
      </g>
      {/* Rail crosses the upper loop. The crown stays visible above it; the wire
          passes behind the bar and comes forward underneath. */}
      <rect x="-8" y="7.05" width="116" height="3.35" rx="0.4" fill="#d8e1e8" />
      <rect x="-8" y="7.05" width="116" height="0.85" rx="0.3" fill="#f7fbfe" />
      <rect x="-8" y="9.7" width="116" height="0.55" fill="#66717a" />
    </svg>
  );
}

type Props = {
  side: Side;
  kind: ScoreKind;
  value: number;
  compact?: boolean;
  /** Old School flip cards. The button name still includes the score. */
  flap?: boolean;
};

export function ScoreBox({ side, kind, value, compact, flap = false }: Props) {
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
              <FlipRings />
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

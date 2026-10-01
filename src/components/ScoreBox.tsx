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

/** Highlight on the near wire, from the left shoulder down toward the hole. */
function wireGlint(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx - rx * 0.55} ${cy - ry * 0.78} A ${rx} ${ry} 0 0 0 ${cx - rx * 0.9} ${cy + ry * 0.22}`;
}

/**
 * Two binder rings. The back third is not drawn in front: the rod covers the
 * wire behind it, and the card hides the far side. The near loop stays in
 * front and crosses the grommet. viewBox y = 13.8 meets the card top.
 */
function FlipRings() {
  const uid = useId().replace(/:/g, '');
  const metal = `${uid}-metal`;
  const rim = `${uid}-rim`;
  const front = `${uid}-front`;
  const rings = [28, 72] as const;
  const rx = 9;
  const ry = 8.6;
  const cy = 11.6;
  const cardLine = 13.8;
  const railY = 6.9;
  const railH = 3.2;
  const holeY = 19.6;
  const holeR = 3.9;

  return (
    <svg className="flap__rings" viewBox="0 0 100 32" aria-hidden="true" shapeRendering="geometricPrecision">
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor="#eef3f7" />
          <stop offset="38%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#9aa6af" />
          <stop offset="100%" stopColor="#f4f7fa" />
        </linearGradient>
        <linearGradient id={rim} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#c5d0d8" />
          <stop offset="100%" stopColor="#5c666e" />
        </linearGradient>
        {/* Above the card the whole loop may show. On the card, only the near
            side and the opening of the hole — the far arc stays behind the card. */}
        <clipPath id={front} clipPathUnits="userSpaceOnUse">
          <rect x="-8" y="0" width="116" height={cardLine + 0.15} />
          {rings.map((cx) => (
            <rect
              key={`near-${cx}`}
              x={cx - rx - 2}
              y={cardLine}
              width={rx + 2.4}
              height={holeY + holeR - cardLine}
            />
          ))}
          {rings.map((cx) => (
            <circle key={`eye-${cx}`} cx={cx} cy={holeY} r={holeR - 0.2} />
          ))}
        </clipPath>
      </defs>
      {rings.map((cx) => (
        <g key={`grommet-${cx}`}>
          <circle cx={cx} cy={holeY} r={holeR + 1.15} fill={`url(#${rim})`} />
          <circle cx={cx} cy={holeY} r={holeR - 0.05} fill="#050505" />
        </g>
      ))}
      <g fill="none" stroke={`url(#${metal})`} strokeWidth="1.7" strokeLinecap="butt" clipPath={`url(#${front})`}>
        {rings.map((cx) => (
          <ellipse key={`wire-${cx}`} cx={cx} cy={cy} rx={rx} ry={ry} />
        ))}
      </g>
      <g fill="none" stroke="#ffffff" strokeWidth="0.4" strokeLinecap="butt" clipPath={`url(#${front})`}>
        {rings.map((cx) => (
          <path key={`glint-${cx}`} d={wireGlint(cx, cy, rx, ry)} />
        ))}
      </g>
      {/* Opaque rod. It hides the band of wire that runs behind the bar. */}
      <rect x="-8" y={railY} width="116" height={railH} fill="#d5dee6" />
      <rect x="-8" y={railY} width="116" height="0.85" fill="#f7fbfe" />
      <rect x="-8" y={railY + railH - 0.55} width="116" height="0.55" fill="#66717a" />
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

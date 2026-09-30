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

/**
 * Front half of one binder ring: a true semicircle whose ends disappear
 * into the top rail. The back of the ring is not drawn.
 */
function frontArc(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
}

/**
 * A short darker stub above the rail, offset back from the front arc.
 * It does not meet the front wire, so the ring does not close into an oval.
 */
function backStub(cx: number, railY: number): string {
  return `M ${cx - 2.1} ${railY} C ${cx - 1.2} ${railY - 2.4}, ${cx + 1.2} ${railY - 2.4}, ${cx + 2.1} ${railY}`;
}

/** Glint along the near side of the front arc. */
function arcGlint(cx: number, cy: number, r: number): string {
  return `M ${cx - r * 0.72} ${cy + r * 0.28} A ${r} ${r} 0 0 1 ${cx - r * 0.12} ${cy + r * 0.9}`;
}

/**
 * Two binder rings for one flip card.
 * From the front you see a half-ring: the near arc, through the card hole.
 * The rest of the wire goes over the rail and behind the stand, so it is not a closed oval.
 */
function FlipRings() {
  const uid = useId().replace(/:/g, '');
  const metal = `${uid}-metal`;
  const shade = `${uid}-shade`;
  const rings = [30, 70] as const;
  const r = 6.4;
  const cy = 9.2;

  return (
    <svg className="flap__rings" viewBox="0 0 100 22" aria-hidden="true">
      <defs>
        <linearGradient id={metal} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#2c333a" />
          <stop offset="28%" stopColor="#9aa6b0" />
          <stop offset="52%" stopColor="#ffffff" />
          <stop offset="74%" stopColor="#7d8790" />
          <stop offset="100%" stopColor="#d5dee6" />
        </linearGradient>
        <linearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#aeb8c0" />
          <stop offset="100%" stopColor="#4a545e" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${shade})`} strokeWidth="1.7" strokeLinecap="round">
        {rings.map((cx) => (
          <path key={`back-${cx}`} d={backStub(cx, 6.2)} />
        ))}
      </g>
      <rect x="-12" y="6.15" width="124" height="3.7" rx="0.7" fill="#1a1a1a" />
      <rect x="-12" y="6.15" width="124" height="0.85" fill="rgba(255,255,255,0.42)" />
      {rings.map((cx) => (
        <g key={`hole-${cx}`}>
          <circle cx={cx} cy="15.7" r="2.55" fill="#050505" />
          <circle cx={cx} cy="15.35" r="1.35" fill="#000" />
        </g>
      ))}
      <g fill="none" stroke={`url(#${metal})`} strokeWidth="2.7" strokeLinecap="round">
        {rings.map((cx) => (
          <path key={`front-${cx}`} d={frontArc(cx, cy, r)} />
        ))}
      </g>
      <g fill="none" stroke="#fff" strokeWidth="0.85" strokeLinecap="round" opacity="0.88">
        {rings.map((cx) => (
          <path key={`glint-${cx}`} d={arcGlint(cx, cy, r)} />
        ))}
      </g>
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

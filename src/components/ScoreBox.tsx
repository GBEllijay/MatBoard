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

/** Front semicircle. Ends sit under the rail; the bottom enters the card hole. */
function frontArc(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`;
}

/** Short crown behind the rail. It does not meet the front arc, so the ring stays open. */
function backStub(cx: number, railY: number): string {
  return `M ${cx - 3.4} ${railY} C ${cx - 1.6} ${railY - 3.6}, ${cx + 1.6} ${railY - 3.6}, ${cx + 3.4} ${railY}`;
}

/** Glint on the near wire, stopping before the hole so the punch stays dark. */
function arcGlint(cx: number, cy: number, r: number): string {
  return `M ${cx - r * 0.62} ${cy + r * 0.22} A ${r} ${r} 0 0 1 ${cx - r * 0.08} ${cy + r * 0.78}`;
}

/**
 * Two binder rings for one flip card.
 * Each visible wire is only the front half-arc: it leaves the rail, bows forward,
 * and sinks into the punched hole. The rest of the ring is behind the stand.
 */
function FlipRings() {
  const uid = useId().replace(/:/g, '');
  const metal = `${uid}-metal`;
  const rings = [34, 86] as const;
  const r = 13.5;
  const cy = 18;
  const holeY = cy + r + 0.4;

  return (
    <svg className="flap__rings" viewBox="0 6 120 40" aria-hidden="true" shapeRendering="geometricPrecision">
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8fbfe" />
          <stop offset="38%" stopColor="#c5d0d8" />
          <stop offset="62%" stopColor="#f4f7fa" />
          <stop offset="100%" stopColor="#6a747e" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="#8b969f" strokeWidth="2.4" strokeLinecap="round">
        {rings.map((cx) => (
          <path key={`back-${cx}`} d={backStub(cx, 14.2)} />
        ))}
      </g>
      {rings.map((cx) => (
        <circle key={`hole-${cx}`} cx={cx} cy={holeY} r="5.6" fill="#050505" />
      ))}
      <g fill="none" stroke={`url(#${metal})`} strokeWidth="4.2" strokeLinecap="round">
        {rings.map((cx) => (
          <path key={`front-${cx}`} d={frontArc(cx, cy, r)} />
        ))}
      </g>
      <g fill="none" stroke="#ffffff" strokeWidth="1.35" strokeLinecap="round">
        {rings.map((cx) => (
          <path key={`glint-${cx}`} d={arcGlint(cx, cy, r)} />
        ))}
      </g>
      {rings.map((cx) => (
        <circle key={`sink-${cx}`} cx={cx} cy={holeY + 0.6} r="2.7" fill="#000" />
      ))}
      <rect x="-8" y="13.4" width="136" height="6.4" rx="0.8" fill="#141414" />
      <rect x="-8" y="13.4" width="136" height="1.15" fill="rgba(255,255,255,0.5)" />
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

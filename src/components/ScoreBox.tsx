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

/** Short upper-left glint so the ring reads as round metal, not a flat washer. */
function ringGlint(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx - rx * 0.78} ${cy - ry * 0.22} A ${rx} ${ry} 0 0 1 ${cx - rx * 0.08} ${cy - ry * 0.98}`;
}

/**
 * Two binder rings for one flip card.
 * Each ring is a single metal loop standing in the flip direction: taller than it is
 * wide, so the opening runs from the front of the card to the back of the stand.
 * The top rail of the stand shows through the loop. The bottom of the wire passes
 * through a hole punched in the card.
 */
function FlipRings() {
  const uid = useId().replace(/:/g, '');
  const metal = `${uid}-metal`;
  const shade = `${uid}-shade`;
  const rings = [28, 72] as const;
  const rx = 9.4;
  const ry = 11.6;
  const cy = 32;

  return (
    <svg className="flap__rings" viewBox="0 16 100 34" aria-hidden="true">
      <defs>
        <linearGradient id={metal} x1="0.15" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="22%" stopColor="#d5dee6" />
          <stop offset="48%" stopColor="#6d7780" />
          <stop offset="63%" stopColor="#f4f8fb" />
          <stop offset="82%" stopColor="#8b969f" />
          <stop offset="100%" stopColor="#2a3138" />
        </linearGradient>
        <linearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9aa4ad" />
          <stop offset="100%" stopColor="#3e474f" />
        </linearGradient>
        <clipPath id={`${uid}-crown`}>
          <rect x="0" y="16" width="100" height="13" />
        </clipPath>
      </defs>
      {/* Far lip of the tube, only the crown, so it reads as thickness instead of a second ring. */}
      <g fill="none" stroke={`url(#${shade})`} strokeWidth="2.6" clipPath={`url(#${uid}-crown)`}>
        {rings.map((cx) => (
          <ellipse key={`far-${cx}`} cx={cx} cy={cy - 1.5} rx={rx - 0.15} ry={ry - 0.2} />
        ))}
      </g>
      {/* Top rail the rings loop over. Visible through the opening. */}
      <rect x="-14" y="29.2" width="128" height="4.6" rx="0.8" fill="#242424" />
      <rect x="-14" y="29.2" width="128" height="1.05" fill="rgba(255,255,255,0.5)" />
      <rect x="-14" y="32.8" width="128" height="0.9" fill="#050505" />
      {rings.map((cx) => (
        <g key={`hole-${cx}`}>
          <circle cx={cx} cy="42.6" r="4.15" fill="#050505" />
          <circle cx={cx} cy="42.2" r="2.3" fill="#000" />
        </g>
      ))}
      <g fill="none" stroke={`url(#${metal})`} strokeWidth="3.7">
        {rings.map((cx) => (
          <ellipse key={`near-${cx}`} cx={cx} cy={cy} rx={rx} ry={ry} />
        ))}
      </g>
      <g fill="none" stroke="#fff" strokeWidth="1.15" strokeLinecap="round" opacity="0.9">
        {rings.map((cx) => (
          <path key={`glint-${cx}`} d={ringGlint(cx, cy, rx, ry)} />
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

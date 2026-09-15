import { useHoldPress } from '../hooks/useHoldPress';
import { dispatchMatch, type ScoreKind, type Side } from '../lib/matchStore';

const LABELS: Record<ScoreKind, string> = {
  points: 'Points',
  advantages: 'Adv',
  disadvantages: 'Neg',
};

type Props = {
  side: Side;
  kind: ScoreKind;
  value: number;
  compact?: boolean;
};

export function ScoreBox({ side, kind, value, compact }: Props) {
  const handlers = useHoldPress(
    () => dispatchMatch({ type: 'bump', side, kind, delta: 1 }),
    () => dispatchMatch({ type: 'bump', side, kind, delta: -1 }),
  );

  return (
    <button
      type="button"
      className={`score score--${kind}${compact ? ' score--compact' : ''}`}
      aria-label={`${LABELS[kind]} ${value}. Tap to add, hold to subtract.`}
      {...handlers}
    >
      <span className="score__label">{LABELS[kind]}</span>
      <span className="score__value">{value}</span>
    </button>
  );
}

import { isKnownBelt } from '../lib/rosterStore';

type Props = {
  belt: string;
  compact?: boolean;
};

export function RankChip({ belt, compact = false }: Props) {
  const label = belt.trim();
  if (!label) return null;
  const key = isKnownBelt(label) ? label.toLowerCase() : 'custom';
  return (
    <span className={`rank-chip rank-chip--${key}${compact ? ' rank-chip--compact' : ''}`}>{label}</span>
  );
}

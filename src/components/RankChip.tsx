import { beltChipKey, canonicalBelt } from '../lib/rosterStore';

type Props = {
  belt: string;
  compact?: boolean;
};

export function RankChip({ belt, compact = false }: Props) {
  const label = belt.trim();
  if (!label) return null;
  const canonical = canonicalBelt(label) || label;
  const key = beltChipKey(canonical);
  return (
    <span className={`rank-chip rank-chip--${key}${compact ? ' rank-chip--compact' : ''}`}>
      <span className="rank-chip__bar" aria-hidden="true" />
      {canonical}
    </span>
  );
}

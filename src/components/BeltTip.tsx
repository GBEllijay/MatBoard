import { beltChipKey, beltTipRankBar, canonicalBelt } from '../lib/rosterStore';

/** Roster belt mark: a short rounded belt with the rank bar near the tip. */
export function BeltTip({ belt }: { belt: string }) {
  const label = belt.trim();
  if (!label) return null;
  const canonical = canonicalBelt(label) || label;
  const key = beltChipKey(canonical);
  const bar = beltTipRankBar(canonical);
  return (
    <span className="belt-mark">
      <span className={`belt-tip belt-tip--${key}`} aria-hidden="true">
        <span className={`belt-tip__bar belt-tip__bar--${bar}`} />
      </span>
      <span className="belt-mark__name">{canonical}</span>
    </span>
  );
}

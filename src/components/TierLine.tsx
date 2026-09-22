/** Tier word in bold, then a hyphen and regular-weight detail. */
export function TierLine({ tier, detail }: { tier: string; detail: string }) {
  return (
    <span className="tier-line">
      <strong>{tier}</strong>
      {' — '}
      {detail}
    </span>
  );
}

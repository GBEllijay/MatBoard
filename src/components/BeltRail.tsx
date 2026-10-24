type BeltRailKind = 'white' | 'blue' | 'coach' | 'purple' | 'brown' | 'black' | 'tournament';

type Props = {
  kind: BeltRailKind;
  /** Black tip sits on the bottom edge, with no light bar under it. */
  flush?: boolean;
  /**
   * White tape on the black rank bar, counted from the tip (the bottom).
   * 0 is a bare black bar. Omit it for the plain belt-color tip.
   * Coach Unlimited menus use 0–3. Student rank rows use 1–4.
   */
  stripes?: 0 | 1 | 2 | 3 | 4;
  /**
   * Four empty stripe rectangles on the black bar.
   * Earned stripes are not filled yet. Coach rails leave this off.
   */
  emptySlots?: boolean;
};

/** Thin left-edge belt ribbon. Rank belts use a tip stack; tournament is green/yellow blocks. */
export function BeltRail({ kind, flush = false, stripes, emptySlots = false }: Props) {
  const degrees = stripes !== undefined;
  return (
    <span
      className={[
        'belt-rail',
        `belt-rail--${kind}`,
        flush ? 'belt-rail--flush' : '',
        degrees ? `belt-rail--degrees belt-rail--stripes-${stripes}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      {emptySlots
        ? [1, 2, 3, 4].map((slot) => <i key={slot} className="belt-slot" data-slot={slot} />)
        : null}
    </span>
  );
}

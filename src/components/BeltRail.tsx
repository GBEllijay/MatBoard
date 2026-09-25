type BeltRailKind = 'white' | 'blue' | 'coach' | 'purple' | 'brown' | 'black' | 'tournament';

type Props = {
  kind: BeltRailKind;
  /** Black tip sits on the bottom edge, with no light bar under it. */
  flush?: boolean;
};

/** Thin left-edge belt ribbon. Rank belts use a tip stack; tournament is green/yellow blocks. */
export function BeltRail({ kind, flush = false }: Props) {
  return (
    <span
      className={`belt-rail belt-rail--${kind}${flush ? ' belt-rail--flush' : ''}`}
      aria-hidden="true"
    />
  );
}

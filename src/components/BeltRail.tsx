type BeltRailKind = 'white' | 'blue' | 'black' | 'tournament';

type Props = {
  kind: BeltRailKind;
};

/** Thin left-edge belt ribbon. Rank belts use a tip stack; tournament is green/yellow blocks. */
export function BeltRail({ kind }: Props) {
  return <span className={`belt-rail belt-rail--${kind}`} aria-hidden="true" />;
}

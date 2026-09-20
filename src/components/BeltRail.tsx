type BeltRailKind = 'white' | 'blue' | 'black' | 'tournament';

type Props = {
  kind: BeltRailKind;
};

/** Thin left-edge belt wink. Tournament uses green + yellow (same-gi corner belts). */
export function BeltRail({ kind }: Props) {
  return <span className={`belt-rail belt-rail--${kind}`} aria-hidden="true" />;
}

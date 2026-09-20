type BeltRailKind = 'white' | 'blue' | 'black';

type Props = {
  kind: BeltRailKind;
};

/** Thin left-edge belt wink on home product cards. Dual-tip kinds can be added later. */
export function BeltRail({ kind }: Props) {
  return <span className={`belt-rail belt-rail--${kind}`} aria-hidden="true" />;
}

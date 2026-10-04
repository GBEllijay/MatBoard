export type BeltHeaderKind = 'black' | 'white' | 'blue' | 'purple' | 'brown' | 'tournament';

type Props = {
  kind: BeltHeaderKind;
  title: string;
  blurb?: string;
};

/**
 * Full-width belt header. Titles share one Inter treatment.
 * Black belts use a white / red / white tip. Colored belts use a black rank
 * block and a short cloth tip. Tournament is the green and yellow competition belt.
 */
export function BeltHeader({ kind, title, blurb }: Props) {
  return (
    <header className={`belt-header belt-header--${kind}`}>
      <div className="belt-header__belt">
        <h2 className="belt-header__title">{title}</h2>
        {kind === 'tournament' ? null : (
          <span className="belt-header__tip" aria-hidden="true">
            {kind === 'black' ? (
              <>
                <span className="belt-header__stripe" />
                <span className="belt-header__rank belt-header__rank--red" />
                <span className="belt-header__stripe" />
              </>
            ) : (
              <>
                <span className="belt-header__rank belt-header__rank--black" />
                <span className="belt-header__cap" />
              </>
            )}
          </span>
        )}
      </div>
      {blurb ? <p className="belt-header__blurb">{blurb}</p> : null}
    </header>
  );
}

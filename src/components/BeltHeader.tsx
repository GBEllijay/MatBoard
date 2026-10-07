export type BeltHeaderKind = 'black' | 'white' | 'blue' | 'purple' | 'brown' | 'tournament';

type Props = {
  kind: BeltHeaderKind;
  title: string;
  blurb?: string;
  /**
   * Worn cotton webbing: visible weave, a stitched border around the whole
   * belt, and a soft worn fade only on the short ends. Long edges stay straight.
   * The rank bar is full height, with the stitch passing over it.
   * Brown wears four white stripes on a black bar, then a short cloth tail.
   * Black wears white | red | white, then a short black tip.
   */
  worn?: boolean;
};

/**
 * Full-width belt header. Titles share one Inter treatment.
 * Black belts use a white / red / white tip. Colored belts use a black rank
 * block and a short cloth tip. Tournament is the green and yellow competition belt.
 */
export function BeltHeader({ kind, title, blurb, worn = false }: Props) {
  const wornBlack = worn && kind === 'black';
  const wornBrown = worn && kind === 'brown';
  return (
    <header className={`belt-header belt-header--${kind}${worn ? ' belt-header--worn' : ''}`}>
      <div className="belt-header__belt">
        {worn ? <div className="belt-header__cloth" aria-hidden="true" /> : null}
        <h2 className="belt-header__title">{title}</h2>
        {kind === 'tournament' ? null : (
          <span className="belt-header__tip" aria-hidden="true">
            {wornBlack ? (
              <>
                <span className="belt-header__stripe" />
                <span className="belt-header__rank belt-header__rank--red" />
                <span className="belt-header__stripe belt-header__stripe--tail" />
                <span className="belt-header__end" />
              </>
            ) : wornBrown ? (
              <>
                <span className="belt-header__rank belt-header__rank--striped">
                  {Array.from({ length: 4 }, (_, index) => (
                    <span className="belt-header__degree" key={index} />
                  ))}
                </span>
                <span className="belt-header__end" />
              </>
            ) : kind === 'black' ? (
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
      {blurb
        ? blurb.split('\n').map((line, index) => (
            <p className="belt-header__blurb" key={`${index}-${line}`}>
              {line}
            </p>
          ))
        : null}
    </header>
  );
}

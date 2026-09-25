import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  /** Quiet line under Advantage. Omit when the page title below is enough. */
  tagline?: ReactNode;
  /** Quiet line under the title. Home only. */
  motto?: string;
  /** When set, the mark navigates back (White / Pro pages). */
  to?: string;
};

export function HomeMark({ tagline, motto, to }: Props) {
  const brand = (
    <>
      <img className="home__logo" src="/advantage-icon.png" alt="" width={713} height={713} />
      <h1>Advantage</h1>
      {motto ? <p className="home__motto">{motto}</p> : null}
    </>
  );

  return (
    <div className="home__mark">
      {to ? (
        <Link className="home__brand" to={to} aria-label="Home">
          {brand}
        </Link>
      ) : (
        brand
      )}
      {tagline ? <p>{tagline}</p> : null}
    </div>
  );
}

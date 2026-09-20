import { Link } from 'react-router-dom';

type Props = {
  tagline: string;
  /** When set, the mark navigates back (White / Pro pages). */
  to?: string;
};

export function HomeMark({ tagline, to }: Props) {
  const brand = (
    <>
      <img className="home__logo" src="/advantage-icon.png" alt="" width={713} height={713} />
      <h1>Advantage</h1>
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
      <p>{tagline}</p>
    </div>
  );
}

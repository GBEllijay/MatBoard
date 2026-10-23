import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { LeatherSpine } from '../components/LeatherSpine';
import { SiteFooter } from '../components/SiteFooter';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import { HOME_MOTTO } from '../lib/productNames';
import { alphaRequestMailto } from '../lib/siteFooter';
import { STOREFRONT_BUY_PATH, STOREFRONT_COMING_SOON, STOREFRONT_PRICE_LABEL } from '../lib/storefront';

const SOON_BELT = {
  student: null,
  coach: 'blue',
  pro: 'black',
} as const;

export function StorefrontPage() {
  const unlocked = useWhiteUnlocked();

  return (
    <main className="home home--store">
      <div className="home__inner">
        <HomeMark motto={HOME_MOTTO} tagline="Advantage White" />

        <header className="store-hero">
          <p className="buy__kicker">Available now</p>
          <h2>Advantage White</h2>
          <p className="store-hero__lead">
            The BJJ scoreboard and round timer for live matches and rounds. One purchase. Yours to keep.
          </p>
          <p className="buy__price">
            {STOREFRONT_PRICE_LABEL} <span>USD — one-time</span>
          </p>
          <div className="store-hero__actions">
            <Link className="btn store-hero__buy" to={STOREFRONT_BUY_PATH}>
              {`Buy Now — ${STOREFRONT_PRICE_LABEL}`}
            </Link>
            {unlocked ? (
              <Link className="btn btn--ghost" to="/white">
                Open White
              </Link>
            ) : null}
          </div>
        </header>

        <section className="store-feature" aria-labelledby="store-scoreboard">
          <div className="store-feature__copy">
            <p className="buy__kicker">On the mat</p>
            <h2 id="store-scoreboard">BJJ scoreboard</h2>
            <p>
              Run a live match from your phone. Points, advantages, and penalties stay big enough to read across the gym, on the TV or a second screen.
            </p>
          </div>
          <figure className="store-feature__shot">
            <img src="/storefront/scoreboard.png" alt="Advantage White scoreboard during a live BJJ match" width={1280} height={720} />
          </figure>
        </section>

        <section className="store-feature" aria-labelledby="store-timer">
          <div className="store-feature__copy">
            <p className="buy__kicker">Between rounds</p>
            <h2 id="store-timer">Round timer</h2>
            <p>
              Set the rounds, keep the clock on the display, and hold the controller. Music in another app can keep playing while you train.
            </p>
          </div>
          <figure className="store-feature__shot">
            <img src="/storefront/round-timer.png" alt="Advantage White round timer on the gym display" width={1280} height={720} />
          </figure>
        </section>

        <section className="store-soon" aria-labelledby="store-soon">
          <h2 id="store-soon">Coming soon</h2>
          <p>
            Advantage Student Edition, Advantage Coach, and Advantage Pro are in alpha testing.
          </p>
          <p>
            <a className="store-soon__mail" href={alphaRequestMailto()}>
              Request to join alpha
            </a>
          </p>
          <div className="store-soon__list">
            {STOREFRONT_COMING_SOON.map((item) => (
              <Link key={item.id} className={`store-soon__card store-soon__card--${item.id}`} to={item.to}>
                {item.id === 'student' ? <LeatherSpine /> : <BeltRail kind={SOON_BELT[item.id]} />}
                <span className="store-soon__status">{item.status}</span>
                <strong>{item.title}</strong>
                <span className="store-soon__price">{item.price}</span>
                <span className="store-soon__teaser">{item.teaser}</span>
              </Link>
            ))}
          </div>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}

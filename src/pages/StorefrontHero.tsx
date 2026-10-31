import { Link, useSearchParams } from 'react-router-dom';
import { STOREFRONT_BUY_LABEL, STOREFRONT_BUY_PATH, STOREFRONT_HERO } from '../lib/storefront';
import { heroVariantOf } from '../lib/storefrontHero';
import './storefrontHero.css';

const SCOREBOARD = { src: '/storefront/scoreboard.png', width: 1280, height: 720 };
const ROUND_TIMER = { src: '/storefront/round-timer.png', width: 1280, height: 720 };
/** Real Round Timer screen (Advantage mat skin, Work · Round 2 / 5, mid-round). Used by B v2. */
const ROUND_TIMER_LIVE = { src: '/storefront/round-timer-live.png', width: 1280, height: 720 };

function Brand() {
  return (
    <Link className="sfh-brand" to="/" aria-label="Advantage home">
      <img src="/advantage-icon.png" alt="" width={120} height={120} draggable={false} />
      <span>Advantage</span>
    </Link>
  );
}

/** B v2: headline in open space, the one-line lead, no duplicate paragraph. */
function RevealCopy() {
  return (
    <div className="sfh-reveal-copy">
      <h1 className="sfh-title">{STOREFRONT_HERO.title}</h1>
      <p className="sfh-lead">
        {STOREFRONT_HERO.leadBeforeBreak} {STOREFRONT_HERO.leadAfterBreak}
      </p>
    </div>
  );
}

function Copy() {
  return (
    <>
      <h1 className="sfh-title">{STOREFRONT_HERO.title}</h1>
      <p className="sfh-lead">
        {STOREFRONT_HERO.leadBeforeBreak} {STOREFRONT_HERO.leadAfterBreak}
      </p>
      <p className="sfh-sub">{STOREFRONT_HERO.sub}</p>
    </>
  );
}

function Cta({ unlocked }: { unlocked: boolean }) {
  return (
    <div className="sfh-cta">
      <Link className="sf-buy sfh-buy" to={STOREFRONT_BUY_PATH}>
        <span>{STOREFRONT_BUY_LABEL}</span>
        <svg className="sfh-chev" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      <p className="sfh-fine">{STOREFRONT_HERO.fine}</p>
      <div className="sfh-links">
        <a className="sfh-more" href="#scoreboard">
          See how it works ↓
        </a>
        {unlocked ? (
          <Link className="sf-open sfh-more" to="/white">
            Open White
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Shot({ shot, alt, className = '' }: { shot: typeof SCOREBOARD; alt: string; className?: string }) {
  return (
    <figure className={`sfh-frame ${className}`.trim()}>
      <img src={shot.src} alt={alt} width={shot.width} height={shot.height} draggable={false} />
    </figure>
  );
}

export function StorefrontHero({ unlocked }: { unlocked: boolean }) {
  const [params] = useSearchParams();
  const variant = heroVariantOf(params.get('hero'));

  return (
    <section className={`sf-hero sfh sfh--${variant}`} aria-label="Advantage scoreboard" data-hero={variant}>
      <div className="sfh-spot" aria-hidden="true" />
      {variant === 'a' ? (
        <div className="sfh-inner">
          <div className="sfh-text">
            <Brand />
            <Copy />
            <Cta unlocked={unlocked} />
          </div>
          <div className="sfh-stage">
            <Shot shot={SCOREBOARD} alt="Advantage scoreboard with two competitors and a 05:00 match clock" />
          </div>
        </div>
      ) : null}
      {variant === 'b' ? (
        <div className="sfh-inner">
          <Brand />
          <div className="sfh-stage">
            <figure className="sfh-frame sfh-frame--caption">
              <img
                src={SCOREBOARD.src}
                alt="Advantage scoreboard with two competitors and a 05:00 match clock"
                width={SCOREBOARD.width}
                height={SCOREBOARD.height}
                draggable={false}
              />
              <figcaption className="sfh-caption">
                <Copy />
              </figcaption>
            </figure>
            <div className="sfh-floor" aria-hidden="true" />
          </div>
          <Cta unlocked={unlocked} />
        </div>
      ) : null}
      {variant === 'c' ? (
        <div className="sfh-inner">
          <div className="sfh-text">
            <Brand />
            <Copy />
            <Cta unlocked={unlocked} />
          </div>
          <div className="sfh-stage">
            <div className="sfh-tv">
              <Shot shot={SCOREBOARD} alt="Advantage scoreboard on a gym TV" className="sfh-frame--tv" />
              <div className="sfh-tv-foot" aria-hidden="true" />
            </div>
            <Shot shot={ROUND_TIMER} alt="Advantage round timer showing round 1 of 5 at 05:00" className="sfh-frame--timer" />
            <div className="sfh-floor" aria-hidden="true" />
          </div>
        </div>
      ) : null}
      {variant === 'd' ? (
        <div className="sfh-inner">
          <Brand />
          <div className="sfh-stage">
            <div className="sfh-halo" aria-hidden="true" />
            <div className="sfh-board">
              <Shot shot={SCOREBOARD} alt="Advantage scoreboard with two competitors and a 05:00 match clock" className="sfh-frame--board" />
              <figure className="sfh-tablet" aria-hidden="true">
                <img
                  src={ROUND_TIMER_LIVE.src}
                  alt=""
                  width={ROUND_TIMER_LIVE.width}
                  height={ROUND_TIMER_LIVE.height}
                  draggable={false}
                />
              </figure>
            </div>
          </div>
          <div className="sfh-after">
            <RevealCopy />
            <Cta unlocked={unlocked} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

import { Link, useSearchParams } from 'react-router-dom';
import { UpdateToLatestButton } from '../components/UpdateToLatestButton';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import {
  SITE_ALPHA_LINE,
  SITE_FEEDBACK_EMAIL,
  SITE_FEEDBACK_LEAD,
  SITE_OWNER_LINE,
  alphaRequestMailto,
} from '../lib/siteFooter';
import {
  STOREFRONT_BUY_LABEL,
  STOREFRONT_BUY_PATH,
  STOREFRONT_HERO,
  STOREFRONT_NAV,
  STOREFRONT_POINTS,
  STOREFRONT_PROGRESS_EYEBROW,
  STOREFRONT_PROGRESS_HEADING,
  STOREFRONT_TIMER,
  STOREFRONT_WOODBLOCKS,
} from '../lib/storefront';
import {
  STOREFRONT_BELT_LADDER,
  STOREFRONT_LADDER_NOTE,
  beltsVariantOf,
  type BeltRung,
  type BeltsVariant,
} from '../lib/storefrontBelts';
import { PRODUCTS_PATH } from '../lib/productNames';
import './storefront.css';

export function StorefrontPage() {
  const unlocked = useWhiteUnlocked();
  const [params] = useSearchParams();
  const belts = beltsVariantOf(params.get('belts'));

  return (
    <main className="home home--store">
      <div className="sf-scroll">
      <header className="sf-pin">
        <Link className="sf-portrait-brand" to="/" aria-label="Home">
          <img src="/advantage-icon.png" alt="" width={112} height={112} draggable={false} />
          <span className="sf-portrait-word">Advantage</span>
        </Link>
        <div className="sf-topbar">
          <div className="sf-wrap">
            <nav className="sf-nav" aria-label="On this page">
              <div className="sf-nav-links">
                {STOREFRONT_NAV.map((item) => (
                  <a key={item.href} href={item.href}>
                    {item.label}
                  </a>
                ))}
              </div>
            </nav>
          </div>
        </div>
      </header>

      <section className="sf-hero" aria-label="Advantage scoreboard">
        <div className="sf-boardbox">
          <div className="sf-sbwrap">
            <div className="sf-sb">
              <div className="sf-sb-row sf-c1">
                <div className="sf-sb-name sf-hero-name">
                  <div className="sf-hero-brand">
                    <img src="/advantage-icon.png" alt="" width={44} height={44} draggable={false} />
                    <span>Advantage</span>
                  </div>
                  <span className="sf-nm1">Competitor 1</span>
                </div>
                <ScoreTile kind="pts" label="POINTS" />
                <ScoreTile kind="adv" label="ADVANTAGES" />
                <ScoreTile kind="pen" label="PENALTIES" />
              </div>
              <div className="sf-sb-clock">
                <span>STOP</span>
                <b>{STOREFRONT_HERO.clock}</b>
                <span>PAUSED</span>
              </div>
              <div className="sf-sb-row sf-c2">
                <div className="sf-sb-name">Competitor 2</div>
                <ScoreTile kind="pts" label="POINTS" />
                <ScoreTile kind="adv" label="ADVANTAGES" />
                <ScoreTile kind="pen" label="PENALTIES" />
              </div>
            </div>
          </div>
          <div className="sf-fade" />
          <div className="sf-copy">
            <div className="sf-wrap sf-copy-row">
              <div>
                <h1>{STOREFRONT_HERO.title}</h1>
                <h2 className="sf-lead">
                  {STOREFRONT_HERO.leadBeforeBreak}
                  <br />
                  {STOREFRONT_HERO.leadAfterBreak}
                </h2>
                <p className="sf-sub">{STOREFRONT_HERO.sub}</p>
              </div>
              <div className="sf-cta">
                <Link className="sf-buy" to={STOREFRONT_BUY_PATH}>
                  {STOREFRONT_BUY_LABEL}
                </Link>
                <div className="sf-fine">{STOREFRONT_HERO.fine}</div>
                {unlocked ? (
                  <Link className="sf-open" to="/white">
                    Open White
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sf-band" id="scoreboard" aria-label="Scoreboard">
        <div className="sf-tex" aria-hidden="true" />
        <div className="sf-wrap">
          <div className="sf-pair">
            <div className="sf-points">
              {STOREFRONT_POINTS.map((point) => (
                <div key={point.id} className={`sf-point sf-point--${point.id}`}>
                  <h3>{point.title}</h3>
                  <p>{point.body}</p>
                </div>
              ))}
            </div>
            <Woodblock shot={STOREFRONT_WOODBLOCKS.scoreboard} />
          </div>
        </div>
      </section>

      <div className="sf-wrap">
        <section className="sf-between" id="round-timer" aria-labelledby="store-timer">
          <Woodblock shot={STOREFRONT_WOODBLOCKS.timer} />
          <div className="sf-between-copy">
            <div className="sf-eyebrow">{STOREFRONT_TIMER.eyebrow}</div>
            <h2 id="store-timer">{STOREFRONT_TIMER.title}</h2>
            <p>{STOREFRONT_TIMER.body}</p>
          </div>
        </section>

        <section className="sf-prog" id="progression" aria-labelledby="store-progress" data-belts={belts}>
          <div className="sf-prog-head">
            <div>
              <div className="sf-eyebrow">{STOREFRONT_PROGRESS_EYEBROW}</div>
              <h2 id="store-progress">
                <Link className="sf-progress-link" to={PRODUCTS_PATH}>
                  {STOREFRONT_PROGRESS_HEADING}
                </Link>
              </h2>
            </div>
            <a className="sf-alpha" href={alphaRequestMailto()}>
              Request to join alpha
            </a>
          </div>
          <div className="sf-steps">
            {STOREFRONT_BELT_LADDER.map((rung) => (
              <ProgressStep key={rung.id} step={rung} belts={belts} />
            ))}
          </div>
          <p className="sf-note">{STOREFRONT_LADDER_NOTE}</p>
        </section>
      </div>

      <footer className="sf-footer">
        <div className="sf-wrap sf-footer-row">
          <div>
            <div className="sf-footer-brand">
              <img src="/advantage-icon.png" alt="" width={26} height={26} />
              <span>Advantage</span>
            </div>
            <p>
              {SITE_OWNER_LINE}
              <br />
              {SITE_ALPHA_LINE}
            </p>
          </div>
          <div className="sf-footer-side">
            <p className="sf-footer-feedback">
              <FooterFeedback />
            </p>
            <nav className="sf-footer-links" aria-label="Legal">
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
            </nav>
          </div>
        </div>
        {/* TEMPORARY UPDATE BUTTON — delete this line with src/components/UpdateToLatestButton.tsx */}
        <UpdateToLatestButton />
      </footer>
      </div>
    </main>
  );
}

function ScoreTile({ kind, label }: { kind: 'pts' | 'adv' | 'pen'; label: string }) {
  return (
    <div className={`sf-sb-tile sf-t-${kind}`}>
      <small>{label}</small>
      <b>0</b>
    </div>
  );
}

function Woodblock({
  shot,
}: {
  shot: (typeof STOREFRONT_WOODBLOCKS)[keyof typeof STOREFRONT_WOODBLOCKS];
}) {
  return (
    <figure className="sf-figure">
      <div className="sf-print">
        <picture>
          <source srcSet={shot.webp} type="image/webp" />
          <img src={shot.jpg} alt={shot.alt} width={shot.width} height={shot.height} loading="eager" />
        </picture>
      </div>
      <figcaption className="sf-caption">
        <b>{shot.caption}</b>
        <span>{shot.detail}</span>
      </figcaption>
    </figure>
  );
}

function ProgressStep({ step, belts }: { step: BeltRung; belts: BeltsVariant }) {
  const body = (
    <>
      <div className="sf-rank">
        <b>{step.rank}</b>
        {step.rankLabel}
      </div>
      <div className="sf-beltcol">
        <div className="sf-belt-box">
          <Belt color={step.belt} journal={step.id === 'student' && belts === 'a'} />
        </div>
      </div>
      <div className="sf-info">
        <div>
          <h3>{step.title}</h3>
          <p>{step.blurb}</p>
        </div>
        <div className="sf-meta">
          {step.cardPrice ? (
            <div className={step.status === 'Available now' ? 'sf-price-now' : 'sf-price-soon'}>{step.cardPrice}</div>
          ) : null}
          <span className={step.status === 'Available now' ? 'sf-status sf-status--now' : 'sf-status sf-status--soon'}>
            {step.status}
          </span>
        </div>
      </div>
    </>
  );

  const className = `sf-step${step.id === 'white' ? ' sf-step--live' : ''} sf-step--${step.id}`;
  if (step.to === null) {
    // No product yet: the tile is the alpha request, same as the section button.
    return (
      <a className={className} href={alphaRequestMailto()}>
        {body}
      </a>
    );
  }
  return (
    <Link className={className} to={step.to}>
      {body}
    </Link>
  );
}

/** Keeps the address with the last word so it does not sit on a line by itself. */
function FooterFeedback() {
  const lead = SITE_FEEDBACK_LEAD;
  const split = lead.lastIndexOf(' ');
  const head = split === -1 ? lead : lead.slice(0, split);
  const tail = split === -1 ? '' : lead.slice(split + 1);
  return (
    <>
      {head}{' '}
      <span className="sf-footer-tail">
        {tail}{' '}
        <a className="sf-footer-mail" href={`mailto:${SITE_FEEDBACK_EMAIL}`}>
          {SITE_FEEDBACK_EMAIL}
        </a>
      </span>
    </>
  );
}

/** One belt set: same box, weave, stitch line and black rank bar. Black keeps its white / red / white bar. */
function Belt({ color, journal = false }: { color: BeltRung['belt']; journal?: boolean }) {
  const kind = color === 'black' ? 'pro' : color;
  return (
    <div className={`sf-belt sf-belt--${kind}${journal ? ' sf-belt--journal' : ''}`} data-belt={color}>
      {journal ? (
        <span className="sf-embroidery" aria-hidden="true">
          <svg className="sf-embroidery-mark" viewBox="0 0 24 24" width="20" height="20">
            <path d="M4 5.5C6.6 4.4 9.4 4.4 12 6c2.6-1.6 5.4-1.6 8-.5v13c-2.6-1.1-5.4-1.1-8 .5-2.6-1.6-5.4-1.6-8-.5z" />
            <path d="M12 6v13" />
          </svg>
          JOURNAL
        </span>
      ) : null}
    </div>
  );
}

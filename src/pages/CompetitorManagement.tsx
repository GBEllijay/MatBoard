import { Link, useSearchParams } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import {
  COMPETITION_READY_CARD,
  COMPETITION_READY_LABEL,
  COMPETITOR_HUB_TITLE,
  COMPETITOR_ROSTER_CARD,
  COMPETITOR_ROSTER_LABEL,
  GAME_PLAN_CARD,
  GAME_PLAN_LABEL,
  RANKINGS_RESULTS_CARD,
} from '../lib/coachCopy';
import { COMPETITOR_ROSTER_PATH } from '../lib/productNames';

/**
 * Light paint options for this header, so the preview can be compared.
 * Default (no query) is the belt card. `?look=seal` and `?look=edge` are the others.
 */
const HEADER_LOOKS = ['belt', 'seal', 'edge'] as const;
type HeaderLook = (typeof HEADER_LOOKS)[number];

function headerLook(value: string | null): HeaderLook {
  if (value === 'seal' || value === 'edge') return value;
  return 'belt';
}

const LINKS = [
  {
    to: COMPETITOR_ROSTER_PATH,
    title: COMPETITOR_ROSTER_LABEL,
    body: COMPETITOR_ROSTER_CARD,
    belt: 'blue',
  },
  {
    to: '/competition-ready',
    title: COMPETITION_READY_LABEL,
    body: COMPETITION_READY_CARD,
    belt: 'purple',
  },
  {
    to: '/game-plan',
    title: GAME_PLAN_LABEL,
    body: GAME_PLAN_CARD,
    belt: 'brown',
  },
  {
    to: '/rankings',
    title: 'Rankings / Results',
    body: RANKINGS_RESULTS_CARD,
    belt: 'black',
  },
] as const;

export function CompetitorManagementPage() {
  const [searchParams] = useSearchParams();
  const look = headerLook(searchParams.get('look'));

  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <HomeMark to="/competition" />
        <section className="suite competitor-hub">
          <header className={`competitor-hub__header competitor-hub__header--${look}`} data-header-look={look}>
            {look === 'belt' ? <BeltRail kind="tournament" /> : null}
            {look === 'seal' ? <GoldMedal /> : null}
            <h2>{COMPETITOR_HUB_TITLE}</h2>
            {look === 'seal' ? null : <GoldMedal />}
          </header>
          <nav className="competitor-hub__nav" aria-label={COMPETITOR_HUB_TITLE}>
            {LINKS.map((link) => (
              <Link key={link.title} className="competitor-hub__link" to={link.to}>
                <BeltRail kind={link.belt} />
                <strong>{link.title}</strong>
                <span>{link.body}</span>
              </Link>
            ))}
          </nav>
          <p className="competitor-hub__note">Seeding and auto-fill from rankings are coming later.</p>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

/** Small gold medal. Olive and yellow ribbon, a thin laurel, one star. */
function GoldMedal() {
  return (
    <svg className="competitor-hub__medal" viewBox="0 0 96 124" aria-hidden="true">
      <defs>
        <linearGradient id="cms-ribbon-olive" x1="0" x2="1">
          <stop offset="0" stopColor="#3e4c16" />
          <stop offset="0.42" stopColor="#7c8b36" />
          <stop offset="1" stopColor="#2c3810" />
        </linearGradient>
        <linearGradient id="cms-ribbon-gold" x1="0" x2="1">
          <stop offset="0" stopColor="#8a6412" />
          <stop offset="0.45" stopColor="#f0d56a" />
          <stop offset="1" stopColor="#a67c14" />
        </linearGradient>
        <linearGradient id="cms-rim" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#f6e6b4" />
          <stop offset="0.42" stopColor="#e0b44a" />
          <stop offset="1" stopColor="#7a5410" />
        </linearGradient>
        <radialGradient id="cms-face" cx="36%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#fbf0c6" />
          <stop offset="52%" stopColor="#e2be58" />
          <stop offset="100%" stopColor="#b18218" />
        </radialGradient>
      </defs>
      <path d="M32 0h14L44 41H30.5Z" fill="url(#cms-ribbon-olive)" />
      <path d="M50 0h14l2.5 41H48Z" fill="url(#cms-ribbon-gold)" />
      <path d="M47.4 0.5 48.6 40" stroke="#6a5420" strokeWidth="0.7" opacity="0.4" />
      <rect x="35.5" y="37" width="25" height="6" rx="1.1" fill="#c9a24a" stroke="#7a5410" strokeWidth="0.55" />
      <circle cx="48" cy="80" r="37.5" fill="url(#cms-rim)" />
      <circle cx="48" cy="80" r="33.4" fill="none" stroke="#5e420c" strokeWidth="1.35" />
      <circle cx="48" cy="80" r="31.6" fill="url(#cms-face)" />
      <circle cx="48" cy="80" r="31.6" fill="none" stroke="#f6e6b4" strokeWidth="0.65" />
      <path
        d="M29 64c5-9 16-14 27-8"
        fill="none"
        stroke="rgba(255,248,220,0.45)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <MedalWreath />
      <circle cx="48" cy="80" r="11.5" fill="#f3d78a" stroke="#7a5410" strokeWidth="0.55" />
      <polygon
        points={starPoints(48, 80, 5.1, 2.15)}
        fill="#fff4cc"
        stroke="#7a5410"
        strokeWidth="0.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MedalWreath() {
  const degrees = [118, 146, 174, 202, 230];
  return (
    <g fill="#f8e7b4" stroke="#6a4a0e" strokeWidth="0.45">
      {degrees.map((deg) => (
        <MedalLeaf key={`L${deg}`} deg={deg} />
      ))}
      {degrees.map((deg) => (
        <MedalLeaf key={`R${deg}`} deg={180 - deg} />
      ))}
    </g>
  );
}

function MedalLeaf({ deg }: { deg: number }) {
  const rad = (deg * Math.PI) / 180;
  const cx = (48 + Math.cos(rad) * 22).toFixed(2);
  const cy = (80 + Math.sin(rad) * 22).toFixed(2);
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx="6.2"
      ry="1.85"
      transform={`rotate(${(deg + 90).toFixed(1)} ${cx} ${cy})`}
    />
  );
}

function starPoints(cx: number, cy: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`);
  }
  return pts.join(' ');
}

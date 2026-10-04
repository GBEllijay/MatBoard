import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import {
  COMPETITION_READY_CARD,
  COMPETITION_READY_LABEL,
  COMPETITOR_HUB_LEAD,
  COMPETITOR_HUB_TITLE,
  COMPETITOR_ROSTER_CARD,
  COMPETITOR_ROSTER_LABEL,
  GAME_PLAN_CARD,
  GAME_PLAN_LABEL,
  RANKINGS_RESULTS_CARD,
} from '../lib/coachCopy';

const LINKS = [
  {
    to: '/roster?from=competitors',
    title: COMPETITOR_ROSTER_LABEL,
    body: COMPETITOR_ROSTER_CARD,
    belt: 'brown',
  },
  {
    to: '/competition-ready',
    title: COMPETITION_READY_LABEL,
    body: COMPETITION_READY_CARD,
    belt: 'blue',
  },
  {
    to: '/game-plan',
    title: GAME_PLAN_LABEL,
    body: GAME_PLAN_CARD,
    belt: 'purple',
  },
  {
    to: '/rankings',
    title: 'Rankings / Results',
    body: RANKINGS_RESULTS_CARD,
    belt: 'black',
  },
] as const;

export function CompetitorManagementPage() {
  return (
    <main className="home home--pro home--suite">
      <div className="home__inner">
        <HomeMark to="/competition" />
        <section className="suite competitor-hub">
          <header className="competitor-hub__header">
            <div className="competitor-hub__band" aria-hidden="true" />
            <div className="competitor-hub__heading">
              <GoldMedal />
              <div className="competitor-hub__copy">
                <h2>{COMPETITOR_HUB_TITLE}</h2>
                <p>{COMPETITOR_HUB_LEAD}</p>
              </div>
            </div>
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

/** Decorative medal. Yellow and olive-green ribbon, one star, laurel on the rim. */
function GoldMedal() {
  return (
    <svg className="competitor-hub__medal" viewBox="0 0 220 292" aria-hidden="true">
      <defs>
        <radialGradient id="competitor-medal-face" cx="36%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#fff6c8" />
          <stop offset="46%" stopColor="#f6d56a" />
          <stop offset="100%" stopColor="#d7a428" />
        </radialGradient>
      </defs>
      <path d="M86 0h28v104H86z" fill="#a3b02e" />
      <path d="M114 0h28v104H114z" fill="#f6cc2c" />
      <rect x="96" y="90" width="32" height="16" rx="3" fill="#e2b44a" stroke="#a87412" strokeWidth="1.5" />
      <g transform="translate(110 186)">
        <circle r="86" fill="#c99216" />
        <circle r="80" fill="url(#competitor-medal-face)" />
        <circle r="72" fill="none" stroke="#f4e2a0" strokeWidth="4" />
        <circle r="63" fill="none" stroke="#a87412" strokeWidth="2.5" />
        <g fill="#f3d98a" stroke="#a87412" strokeWidth="1.15">
          <ellipse cx="-46" cy="20" rx="15" ry="6" transform="rotate(52 -46 20)" />
          <ellipse cx="-54" cy="4" rx="15" ry="6" transform="rotate(32 -54 4)" />
          <ellipse cx="-52" cy="-14" rx="14" ry="5.5" transform="rotate(12 -52 -14)" />
          <ellipse cx="-42" cy="-30" rx="13" ry="5.5" transform="rotate(-12 -42 -30)" />
          <ellipse cx="-26" cy="-42" rx="12" ry="5" transform="rotate(-38 -26 -42)" />
          <ellipse cx="46" cy="20" rx="15" ry="6" transform="rotate(-52 46 20)" />
          <ellipse cx="54" cy="4" rx="15" ry="6" transform="rotate(-32 54 4)" />
          <ellipse cx="52" cy="-14" rx="14" ry="5.5" transform="rotate(-12 52 -14)" />
          <ellipse cx="42" cy="-30" rx="13" ry="5.5" transform="rotate(12 42 -30)" />
          <ellipse cx="26" cy="-42" rx="12" ry="5" transform="rotate(38 26 -42)" />
        </g>
        <polygon
          points="0,-28 7.1,-9.7 26.6,-8.7 11.4,3.7 16.5,22.7 0,12 -16.5,22.7 -11.4,3.7 -26.6,-8.7 -7.1,-9.7"
          fill="#fff6d2"
          stroke="#b8860b"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

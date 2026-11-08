import { Link } from 'react-router-dom';
import { BeltHeader } from '../../components/BeltHeader';
import { BeltRail } from '../../components/BeltRail';
import { PREVIEW_BANNER, PRO_PREVIEW_PATH, WHITE_HUB_PREVIEW_PATH, whiteHubTools } from './model';
import './proHome.css';

/**
 * Preview White hub. The suite scoreboard does not link to the round timer.
 * Both tiles are the existing suite URLs. Live /white and /match are not this page.
 */
export function WhiteHubPreviewPage() {
  return (
    <main className="php">
      <div className="php-shell">
        <p className="php-banner" role="note">
          {PREVIEW_BANNER} The three White controls on the Pro preview open this hub. It does not replace /white.
        </p>
        <p className="php-kicker">White preview</p>
        <h1>White</h1>
        <p className="php-note" data-testid="preview-path">
          {WHITE_HUB_PREVIEW_PATH}
        </p>
        <BeltHeader kind="white" title="White" blurb="Scoreboard and round timer. Example only." />
        <nav className="php-hubs" aria-label="Skins-enabled scoreboard and round timer">
          {whiteHubTools().map((tool) => (
            <Link key={tool.title} className="php-tile" to={tool.to} data-suite-tool={tool.title}>
              <BeltRail kind="white" />
              <span className="php-tile__copy">
                <strong>{tool.title}</strong>
                <small>{tool.note}</small>
              </span>
            </Link>
          ))}
        </nav>
        <Link className="php-jump" to={PRO_PREVIEW_PATH}>
          Back to the Pro preview
        </Link>
      </div>
    </main>
  );
}

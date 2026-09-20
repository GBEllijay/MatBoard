import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';

export function CoachToolsCard() {
  return (
    <article className="mode-card mode-card--coach">
      <Link
        className="mode-card__hit"
        to="/tournament"
        tabIndex={-1}
        aria-label="Open Mock Tournament"
      />
      <strong>Advantage Coach</strong>
      <span className="mode-card__sub">Coach</span>
      <span>
        Run a Mock Tournament, Record Daily Techniques for Screencasting with Competitor Management
        System.
      </span>
      <div className="mode-card__actions mode-card__actions--tools" aria-label="Coach tools">
        <Link className="btn btn--white" to="/tournament">
          <BeltRail kind="tournament" />
          Mock Tournament
        </Link>
        <Link className="btn" to="/techniques">
          Daily Techniques
        </Link>
        <Link className="btn" to="/roster">
          Competitor Management System
        </Link>
      </div>
    </article>
  );
}

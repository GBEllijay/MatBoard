import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';

export function CoachToolsCard() {
  return (
    <article className="mode-card mode-card--coach">
      <BeltRail kind="blue" />
      <strong>Advantage Coach</strong>
      <span className="mode-card__sub">Coach</span>
      <span>
        Run a Mock Tournament, loop Daily Training Videos, keep Competitor Management, and jot
        Training notes.
      </span>
      <div className="mode-card__actions mode-card__actions--tools" aria-label="Coach tools">
        <Link className="btn btn--white" to="/tournament">
          <BeltRail kind="tournament" />
          Mock Tournament
        </Link>
        <Link className="btn btn--white" to="/roster">
          Competitor roster
        </Link>
        <Link className="btn btn--white" to="/notes">
          Training notes
        </Link>
        <Link className="btn btn--white" to="/techniques">
          Daily Training Videos
        </Link>
      </div>
    </article>
  );
}

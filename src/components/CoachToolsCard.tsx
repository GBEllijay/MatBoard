import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';
import { COMPETITOR_ROSTER_LABEL, TRAINING_NOTES_LABEL } from '../lib/coachCopy';

export function CoachToolsCard() {
  return (
    <article className="mode-card mode-card--coach">
      <BeltRail kind="blue" />
      <strong>Advantage Coach</strong>
      <span className="mode-card__sub">Coach</span>
      <span>
        Run a Mock Tournament, loop Daily Training Videos, keep Competitor Management, and jot{' '}
        {TRAINING_NOTES_LABEL}.
      </span>
      <div className="mode-card__actions mode-card__actions--tools" aria-label="Coach tools">
        <Link className="btn btn--white" to="/tournament">
          <BeltRail kind="tournament" />
          Mock Tournament
        </Link>
        <Link className="btn btn--white" to="/roster">
          {COMPETITOR_ROSTER_LABEL}
        </Link>
        <Link className="btn btn--white" to="/notes">
          {TRAINING_NOTES_LABEL}
        </Link>
        <Link className="btn btn--white" to="/techniques">
          Daily Training Videos
        </Link>
      </div>
    </article>
  );
}

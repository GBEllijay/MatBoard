import { Link } from 'react-router-dom';
import { unlinkBracketBout } from '../lib/bracketBout';
import {
  COMPETITOR_ROSTER_LABEL,
  TECHNIQUE_TREE_LABEL,
  TRAINING_NOTES_LABEL,
} from '../lib/coachCopy';
import { FOLDERS } from '../lib/photoStore';
import { GYM_CONSOLE_NAME, TOURNAMENT_SUITE_NAME } from '../lib/productNames';
import { BeltRail } from './BeltRail';

export function ProToolboxCard() {
  return (
    <article className="mode-card mode-card--saver">
      <Link
        className="mode-card__hit"
        to="/slideshow?folder=gallery"
        tabIndex={-1}
        aria-label="Open Gallery"
      />
      <strong>{GYM_CONSOLE_NAME}</strong>
      <span className="mode-card__sub">Pro</span>
      <span>
        Easily cast to your gym TV and display: Pro-Shop, Class Schedules, Recent Promotions,
        Upcoming Events and Competitions. Full In-House Tournament Management Suite with Auto-Fill
        Bracketing and Result Tracking. Assignable Instructor Licenses with Cross Platform Access to
        Updates and more.
      </span>
      <div className="mode-card__actions mode-card__actions--folders" aria-label="Owner folders">
        {FOLDERS.map((folder) => (
          <Link
            key={folder.id}
            className={`btn${folder.ready ? '' : ' btn--ghost'}`}
            to={`/slideshow?folder=${folder.id}`}
          >
            {folder.label}
          </Link>
        ))}
      </div>
      <div className="mode-card__actions mode-card__actions--tools" aria-label="Owner tools">
        <Link className="btn btn--white btn--suite" to="/suite">
          <BeltRail kind="tournament" />
          {TOURNAMENT_SUITE_NAME}
        </Link>
        <Link className="btn" to="/schedule">
          Class Schedule
        </Link>
        <Link className="btn" to="/roster">
          Competitor Management System
        </Link>
      </div>
      <div className="mode-card__actions mode-card__actions--tools" aria-label="White tools">
        <Link className="btn btn--white" to="/match" onClick={() => unlinkBracketBout()}>
          Scoreboard
        </Link>
        <Link className="btn btn--white" to="/match/control" onClick={() => unlinkBracketBout()}>
          Match Controller
        </Link>
        <Link className="btn btn--white" to="/training">
          Rounds
        </Link>
        <Link className="btn btn--white" to="/training/control">
          Rounds Controller
        </Link>
      </div>
      <div className="mode-card__actions mode-card__actions--tools" aria-label="Coach tools">
        <Link className="btn btn--white" to="/notes">
          {TRAINING_NOTES_LABEL}
        </Link>
        <Link className="btn btn--white" to="/techniques">
          Daily Training Videos
        </Link>
        <Link className="btn btn--white" to="/technique-tree">
          {TECHNIQUE_TREE_LABEL}
        </Link>
        <Link className="btn btn--white" to="/roster?from=coach">
          {COMPETITOR_ROSTER_LABEL}
        </Link>
      </div>
    </article>
  );
}

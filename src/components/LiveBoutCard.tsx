import { Link } from 'react-router-dom';
import { unlinkBracketBout } from '../lib/bracketBout';
import { BeltRail } from './BeltRail';

export function LiveBoutCard() {
  return (
    <article className="mode-card mode-card--match">
      <BeltRail kind="white" flush />
      <Link
        className="mode-card__hit"
        to="/match"
        tabIndex={-1}
        aria-label="Open Scoreboard"
        onClick={() => unlinkBracketBout()}
      />
      <strong>Live Bout</strong>
      <span className="mode-card__sub">Match Timer &amp; Scoreboard</span>
      <span>
        Run a tournament-style match. Open Scoreboard on a computer plugged into the TV, or control
        from your phone and cast.
      </span>
      <div className="mode-card__actions">
        <Link className="btn" to="/match" onClick={() => unlinkBracketBout()}>
          Scoreboard
        </Link>
        <Link className="btn btn--ghost" to="/match/control" onClick={() => unlinkBracketBout()}>
          Controller
        </Link>
      </div>
    </article>
  );
}

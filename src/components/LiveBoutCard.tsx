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
      <MiniScoreboard />
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

/** Decorative match board on the White home card. Not a live score. */
function MiniScoreboard() {
  return (
    <div className="white-board" aria-hidden="true">
      <BoardLane side="blue" />
      <div className="white-board__clock">5:00</div>
      <BoardLane side="white" />
    </div>
  );
}

function BoardLane({ side }: { side: 'blue' | 'white' }) {
  const label = side === 'blue' ? 'Blue' : 'White';
  return (
    <div className={`white-board__lane white-board__lane--${side}`}>
      <div className="white-board__side">{label}</div>
      <div className="white-board__pads">
        <div className="white-board__pad white-board__pad--points">
          <b>0</b>
          <small>Pts</small>
        </div>
        <div className="white-board__pad white-board__pad--adv">
          <b>0</b>
          <small>Adv</small>
        </div>
        <div className="white-board__pad white-board__pad--pen">
          <b>0</b>
          <small>Pen</small>
        </div>
      </div>
    </div>
  );
}

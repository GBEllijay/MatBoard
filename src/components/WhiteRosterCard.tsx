import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';

/** Advantage White match names. Not the Coach or Pro Competitor Roster. */
export function WhiteRosterCard() {
  return (
    <article className="mode-card mode-card--names">
      <BeltRail kind="white" />
      <Link
        className="mode-card__hit"
        to="/white/roster"
        tabIndex={-1}
        aria-label="Open Match names"
      />
      <strong>Match names</strong>
      <span className="mode-card__sub">Names and belts</span>
      <span>Save competitor names and belt ranks on this phone, then pick them on the scoreboard.</span>
      <div className="mode-card__actions">
        <Link className="btn" to="/white/roster">
          Match names
        </Link>
      </div>
    </article>
  );
}

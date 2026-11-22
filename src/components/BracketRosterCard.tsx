import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';

/**
 * Placeholder Bracket Roster card for the White hub.
 * Named "Bracket Roster" on purpose — never "student roster".
 * Gym name sits under the competitor name, matching the scoreboard CompetitorPad
 * (Name, then Gym underneath) on the match controller.
 * Fields and the card link to /white until the roster tool is wired.
 */
export function BracketRosterCard() {
  return (
    <article className="mode-card mode-card--bracket-roster" id="bracket-roster">
      <BeltRail kind="white" />
      <Link className="mode-card__hit" to="/white" tabIndex={-1} aria-label="Open Bracket Roster" />
      <strong>Bracket Roster</strong>
      <span className="mode-card__sub">Mock tournament list</span>
      <span>
        Build the list you seed into a bracket. Add a name, then the gym under it, the same way
        Competitor 1 is entered on the scoreboard. Weight, division, age, and rank sit with each
        person.
      </span>
      <div className="bracket-roster-preview" aria-hidden="true">
        <div className="bracket-roster-preview__who">
          <div className="bracket-roster-preview__field">
            <span>Name</span>
            <b>Atlas</b>
          </div>
          <div className="bracket-roster-preview__field">
            <span>Gym</span>
            <b>Northside Academy</b>
          </div>
        </div>
        <div className="bracket-roster-preview__meta">
          <div className="bracket-roster-preview__field">
            <span>Weight</span>
            <b>155</b>
          </div>
          <div className="bracket-roster-preview__field">
            <span>Division</span>
            <b>Adult</b>
          </div>
          <div className="bracket-roster-preview__field">
            <span>Age</span>
            <b>28</b>
          </div>
          <div className="bracket-roster-preview__field">
            <span>Rank</span>
            <b>Purple</b>
          </div>
        </div>
      </div>
      <div className="mode-card__actions">
        <Link className="btn" to="/white">
          Bracket Roster
        </Link>
      </div>
    </article>
  );
}

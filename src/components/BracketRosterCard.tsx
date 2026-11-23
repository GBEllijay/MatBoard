import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';
import { WHITE_BRACKET_ROSTER_PATH } from '../lib/bracketRosterStore';

const SAMPLE_ATHLETES = [
  { name: 'Atlas', gym: 'Northside Academy', weight: '155', division: 'Adult', belt: 'Purple', tone: 'purple' },
  { name: 'Nori', gym: 'Harbor Gym', weight: '145', division: 'Adult', belt: 'Blue', tone: 'blue' },
  { name: 'Mina', gym: 'Riverside', weight: '125', division: 'Adult', belt: 'Black', tone: 'black' },
  { name: 'Kai', gym: 'Eastside Club', weight: '170', division: 'Master', belt: 'Brown', tone: 'brown' },
] as const;

/**
 * Placeholder Bracket Roster card for the White hub.
 * Named "Bracket Roster" on purpose — never "student roster".
 * Gym name sits under the competitor name, matching the scoreboard CompetitorPad
 * (Name, then Gym underneath) on the match controller.
 * Opens the on-device Bracket Roster tool. The form itself stays on that page.
 */
export function BracketRosterCard() {
  return (
    <article className="mode-card mode-card--bracket-roster" id="bracket-roster">
      <BeltRail kind="white" />
      <Link className="mode-card__hit" to={WHITE_BRACKET_ROSTER_PATH} tabIndex={-1} aria-label="Open Bracket Roster" />
      <strong>Bracket Roster</strong>
      <span className="mode-card__sub">Mock tournament list</span>
      <span>
        Build the list you seed into a bracket. Add a name, then the gym under it, the same way
        Competitor 1 is entered on the scoreboard.
      </span>
      <div className="mode-card__actions">
        <Link className="btn" to={WHITE_BRACKET_ROSTER_PATH}>
          Roster
        </Link>
      </div>
      <RosterPreview />
    </article>
  );
}

/** Decorative athlete list. Fictional names only. Not live roster data. */
function RosterPreview() {
  return (
    <div className="bracket-roster-preview" aria-hidden="true">
      <div className="bracket-roster-preview__belts">
        <span className="bracket-roster-preview__stripe bracket-roster-preview__stripe--white" />
        <span className="bracket-roster-preview__stripe bracket-roster-preview__stripe--blue" />
        <span className="bracket-roster-preview__stripe bracket-roster-preview__stripe--purple" />
        <span className="bracket-roster-preview__stripe bracket-roster-preview__stripe--brown" />
        <span className="bracket-roster-preview__stripe bracket-roster-preview__stripe--black" />
      </div>
      <ul className="bracket-roster-preview__list">
        {SAMPLE_ATHLETES.map((athlete) => (
          <li
            key={athlete.name}
            className={`bracket-roster-preview__row bracket-roster-preview__row--${athlete.tone}`}
          >
            <span className="bracket-roster-preview__tab" />
            <div className="bracket-roster-preview__who">
              <b className="bracket-roster-preview__name">{athlete.name}</b>
              <span className="bracket-roster-preview__gym">{athlete.gym}</span>
            </div>
            <div className="bracket-roster-preview__meta">
              {athlete.weight} · {athlete.division}
              <br />
              {athlete.belt}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

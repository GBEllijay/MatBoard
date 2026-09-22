import { Link } from 'react-router-dom';

export function RoundsCard() {
  return (
    <article className="mode-card mode-card--training">
      <Link className="mode-card__hit" to="/training" tabIndex={-1} aria-label="Open Rounds" />
      <strong>Rounds</strong>
      <span className="mode-card__sub">Training Timer</span>
      <span>
        Round timer for the gym TV. Open it on a computer plugged into the TV, or cast from your
        phone. Set round length, rest time, and how many rounds.
      </span>
      <div className="mode-card__actions">
        <Link className="btn" to="/training">
          Rounds
        </Link>
        <Link className="btn btn--ghost" to="/training/control">
          Controller
        </Link>
      </div>
    </article>
  );
}

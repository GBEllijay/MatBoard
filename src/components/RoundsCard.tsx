import { Link } from 'react-router-dom';

export function RoundsCard() {
  return (
    <Link className="mode-card mode-card--training" to="/training">
      <strong>Rounds</strong>
      <span className="mode-card__sub">Training Timer</span>
      <span>
        Round timer for the gym TV. Open it on a computer plugged into the TV, or cast from your
        phone. Set round length, rest time, and how many rounds.
      </span>
    </Link>
  );
}

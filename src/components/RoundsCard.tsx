import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';

export function RoundsCard() {
  return (
    <article className="mode-card mode-card--training" id="round-timer">
      <BeltRail kind="white" />
      <Link className="mode-card__hit" to="/training?from=white" tabIndex={-1} aria-label="Open Rounds" />
      <div className="white-timer" aria-hidden="true">
        <div className="white-timer__time">5:00</div>
      </div>
      <strong>Rounds</strong>
      <span className="mode-card__sub">Training Timer</span>
      <span>
        Round timer for the gym TV. Open it on a computer plugged into the TV, or cast from your
        phone. Set round length, rest time, and how many rounds.
      </span>
      <div className="mode-card__actions">
        <Link className="btn" to="/training?from=white">
          Rounds
        </Link>
        <Link className="btn btn--ghost" to="/training/control?from=white">
          Controller
        </Link>
      </div>
    </article>
  );
}

import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';
import { FOLDERS } from '../lib/photoStore';
import { GYM_CONSOLE_NAME } from '../lib/productNames';

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
        <Link className="btn btn--white" to="/tournament">
          <BeltRail kind="tournament" />
          Mock Tournament
        </Link>
        <Link className="btn" to="/schedule">
          Class Schedule
        </Link>
        <Link className="btn" to="/roster">
          Competitor Management System
        </Link>
      </div>
    </article>
  );
}

import { Link } from 'react-router-dom';
import { FOLDERS } from '../lib/photoStore';

export function ProToolboxCard() {
  return (
    <article className="mode-card mode-card--saver">
      <Link
        className="mode-card__hit"
        to="/slideshow?folder=gallery"
        tabIndex={-1}
        aria-label="Open Gallery"
      />
      <strong>Owner’s Toolbox</strong>
      <span className="mode-card__sub">Pro</span>
      <span>
        Gallery, videos, Pro Shop, event flyers, a mock tournament, a class schedule, and a
        competitor roster.
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
        <Link className="btn" to="/tournament">
          Mock Tournament
        </Link>
        <Link className="btn" to="/schedule">
          Class Schedule
        </Link>
        <Link className="btn" to="/roster">
          Competitor roster
        </Link>
      </div>
    </article>
  );
}

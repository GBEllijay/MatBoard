import { Link } from 'react-router-dom';
import { BeltHeader } from '../../components/BeltHeader';
import { CardMark } from './marks';
import { INSTRUCTOR_CARDS_PREVIEW_PATH, PREVIEW_BANNER, PRO_PREVIEW_PATH, instructorConceptCards } from './model';
import './proHome.css';

/** Concept only. The live Instructor page and the cream Pro tiles are not this view. */
export function InstructorCardsPreviewPage() {
  const cards = instructorConceptCards();
  return (
    <main className="php">
      <div className="php-shell">
        <p className="php-banner" role="note">
          {PREVIEW_BANNER} This view does not replace the Instructor page or the cream Pro tiles.
        </p>
        <p className="php-kicker">Instructor concept</p>
        <h1>Instructor tools</h1>
        <p className="php-note" data-testid="preview-path">
          {INSTRUCTOR_CARDS_PREVIEW_PATH}
        </p>
        <BeltHeader kind="brown" title="Advantage Instructor Edition" blurb="Example only. Not a saved roster." />
        <nav className="php-cards" aria-label="Instructor tool concept">
          {cards.map((card) => (
            <Link key={card.title} className="php-card" to={card.to} data-mark={card.mark}>
              <span>
                <strong>{card.title}</strong>
                <small>{card.note}</small>
              </span>
              <CardMark mark={card.mark} />
            </Link>
          ))}
        </nav>
        <p className="php-note">No belt rail on these cards. The brown belt stays on the header.</p>
        <Link className="php-jump" to={PRO_PREVIEW_PATH}>
          Back to the Pro preview
        </Link>
      </div>
    </main>
  );
}

/**
 * Opponent cards a coach already approved for this student.
 * They sit in Competition card section 05, beside opponents faced.
 */
import { ScoutCage } from '../CleanCage';
import { approvedStudentScouting, type UpdateScoutCard } from '../../lib/coachProgressFile';

function classLine(card: UpdateScoutCard): string {
  return [card.belt, card.group === 'open' ? 'Open class' : 'Weight class', card.weightClass, card.gym].filter(Boolean).join(' · ');
}

export function ScoutedByStudent({ studentId, studentName }: { studentId?: string; studentName: string }) {
  if (!studentId || typeof localStorage === 'undefined') return null;
  let scouting: ReturnType<typeof approvedStudentScouting>;
  try {
    scouting = approvedStudentScouting(localStorage, studentId);
  } catch {
    return null;
  }
  if (!scouting.cards.length) return null;
  const name = scouting.studentName || studentName || 'this student';
  const mine = scouting.self && Object.keys(scouting.self.scores).length ? scouting.self.scores : null;
  return (
    <div className="comp-card__scouted" data-testid="comp-scouted">
      <p className="comp-card__scouted-title">Scouted by {name}</p>
      <ul className="comp-card__list" aria-label={`Scouted by ${name}`}>
        {scouting.cards.map((card) => {
          const theirs = Object.keys(card.ratings).length ? card.ratings : null;
          return (
            <li key={card.id} className="comp-card__scout-item">
              <details data-testid="comp-scout-card">
                <summary className="comp-card__summary">
                  <span className="comp-card__event">
                    <b>{card.name}</b>
                    {classLine(card)}
                  </span>
                  <span className="comp-card__tag">{card.record.line}</span>
                </summary>
                <ScoutCage
                  mine={mine}
                  theirs={theirs}
                  opponentName={card.name}
                  title="Me vs them"
                  empty="No ratings on this card yet."
                />
                {card.style ? <p className="comp-card__quiet">{card.style}</p> : null}
                {card.strengths ? <p className="comp-card__quiet">Strengths: {card.strengths}</p> : null}
                {card.weaknesses ? <p className="comp-card__quiet">Weaknesses: {card.weaknesses}</p> : null}
                {card.notes ? <p className="comp-card__quiet">{card.notes}</p> : null}
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

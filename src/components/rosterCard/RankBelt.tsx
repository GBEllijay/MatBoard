import { cardBelt, coachRankSource, rosterStripeCount } from '../../lib/rosterCard';
import { readRosterCard } from '../../lib/rosterCardStore';
import { canonicalBelt, type Student } from '../../lib/rosterStore';
import { WornBeltMark } from '../../pages/student/wornBelt';
import '../../pages/student/beltWeave.css';
import './rankBelt.css';

/**
 * Read-only full belt with its stripes, the same cloth and rank bar the coach
 * card uses. Rolodex mini cards, the edit view, and the Competition card show it.
 * The coach card keeps its own tappable belt (the promotion control).
 * Stripe count is `student.stripes` from the Promotion section. A saved card
 * with no stripe field yet can still read the coach rank log.
 */
export function RankBelt({ student }: { student: Pick<Student, 'belt' | 'stripes' | 'lastPromotion'> & { id?: string } }) {
  const label = student.belt.trim();
  if (!label) return null;
  const log = student.id ? readRosterCard(student.id).coachRank : undefined;
  const stripes = rosterStripeCount(student, log);
  const preview = cardBelt(coachRankSource({ ...student, stripes }, log));
  const name = canonicalBelt(label) || label;
  return (
    <span
      className="rank-belt"
      data-testid="rank-belt"
      data-stripes={String(stripes)}
      role="img"
      aria-label={`${name} belt${stripes ? `, ${stripes} stripe${stripes === 1 ? '' : 's'}` : ''}`}
    >
      <WornBeltMark preview={preview} />
    </span>
  );
}

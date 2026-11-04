import { cardBelt, coachRankSource } from '../../lib/rosterCard';
import { canonicalBelt, type Student } from '../../lib/rosterStore';
import { WornBeltMark } from '../../pages/student/wornBelt';
import '../../pages/student/beltWeave.css';
import './rankBelt.css';

/**
 * Read-only full belt with its stripes, the same cloth and rank bar the coach
 * card uses. Rolodex mini cards and the Competition card show it under the name.
 * The coach card keeps its own tappable belt (the promotion control).
 */
export function RankBelt({ student }: { student: Pick<Student, 'belt' | 'stripes' | 'lastPromotion'> }) {
  const label = student.belt.trim();
  if (!label) return null;
  const preview = cardBelt(coachRankSource(student));
  const stripes = Math.max(0, student.stripes ?? 0);
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

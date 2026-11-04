import { Link } from 'react-router-dom';
import { LEARN_MORE, type LearnTier } from '../lib/learnMore';

/** Learn more button on locked product cards. Unlocked cards show only their Open button. */
export function LearnMoreLink({ tier, className = 'btn btn--white mode-card__learn' }: { tier: LearnTier; className?: string }) {
  const item = LEARN_MORE[tier];
  return (
    <Link className={className} to={item.to}>
      {item.label}
    </Link>
  );
}

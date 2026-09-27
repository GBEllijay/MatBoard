import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';
import { COACH_HUBS } from '../lib/productNames';

/**
 * Same buttons, same order, as the Advantage Coach card.
 * Daily tools use the flat blue coach belt. Competition Management keeps the
 * yellow/green tournament belt on the fourth slot.
 */
export const COACH_TOOL_LINKS = COACH_HUBS;

export function CoachToolsCard() {
  return (
    <article className="mode-card mode-card--coach">
      <BeltRail kind="coach" />
      <strong>Advantage Coach</strong>
      <span className="mode-card__sub">Coach</span>
      <div className="pro-hubs">
        {COACH_TOOL_LINKS.map((tool) => (
          <Link key={tool.to} className="pro-hub" to={tool.to}>
            <BeltRail kind={'belt' in tool ? tool.belt : 'coach'} />
            <span>{tool.title}</span>
          </Link>
        ))}
      </div>
    </article>
  );
}

import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';
import { useCurrentSeat } from './SeatSessionBar';
import { coachToolVisible } from '../lib/instructorSeats';
import { COACH_HUBS } from '../lib/productNames';

/**
 * Same buttons, same order, as the Advantage Coach card.
 * Coaching Tools uses the flat blue coach belt. Competition Team Management keeps
 * the yellow/green tournament belt.
 */
export const COACH_TOOL_LINKS = COACH_HUBS;

export function CoachToolsCard() {
  const seat = useCurrentSeat();
  const tools = COACH_TOOL_LINKS.filter((tool) => coachToolVisible(tool.to, seat));
  return (
    <article className="mode-card mode-card--coach">
      <BeltRail kind="coach" />
      <strong>Advantage Coach</strong>
      <span className="mode-card__sub">Coach</span>
      <div className="pro-hubs">
        {tools.map((tool) => (
          <Link key={tool.to} className="pro-hub" to={tool.to}>
            <BeltRail kind={'belt' in tool ? tool.belt : 'coach'} />
            <span>{tool.title}</span>
          </Link>
        ))}
      </div>
    </article>
  );
}

import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';
import { CoachingToolsScene, CompetitionScene } from './CoachHubScenes';
import { useCurrentSeat } from './SeatSessionBar';
import { coachToolVisible } from '../lib/instructorSeats';
import { COACH_HUBS } from '../lib/productNames';

/**
 * Same buttons, same order, as the Advantage Coach card.
 * Each hub is a wide tile: title on the left, a still of what is inside on the right.
 * Coaching Tools uses the flat blue coach belt with the black tip at the bottom.
 * Competition Team Management keeps the yellow/green tournament belt.
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
        {tools.map((tool) => {
          const coaching = tool.belt === 'coach' || tool.belt === 'blue';
          return (
            <Link key={tool.to} className="pro-hub pro-hub--tile" to={tool.to}>
              <BeltRail kind={tool.belt} flush={coaching} />
              <span className="pro-hub__title">{tool.title}</span>
              <span className="pro-hub__scene">
                {coaching ? <CoachingToolsScene /> : <CompetitionScene />}
                <span className="pro-hub__open">
                  Open
                  <svg viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </article>
  );
}

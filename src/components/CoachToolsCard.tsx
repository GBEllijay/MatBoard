import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';
import {
  COACH_HUB_BLURB,
  COMPETITOR_ROSTER_LABEL,
  TECHNIQUE_TREE_LABEL,
  TRAINING_NOTES_LABEL,
} from '../lib/coachCopy';

/** Same buttons, same order, as the Advantage Coach card. */
export const COACH_TOOL_LINKS = [
  { title: TRAINING_NOTES_LABEL, to: '/notes' },
  { title: 'Daily Training Videos', to: '/techniques' },
  { title: TECHNIQUE_TREE_LABEL, to: '/technique-tree' },
  { title: 'Mock Tournament', to: '/tournament', belt: 'tournament' },
  { title: COMPETITOR_ROSTER_LABEL, to: '/roster?from=coach' },
] as const;

export function CoachToolsCard() {
  return (
    <article className="mode-card mode-card--coach">
      <BeltRail kind="coach" />
      <strong>Advantage Coach</strong>
      <span className="mode-card__sub">Coach</span>
      <span>{COACH_HUB_BLURB}</span>
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

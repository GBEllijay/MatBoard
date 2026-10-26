import { Link } from 'react-router-dom';
import { PRO_HUBS, type ConsoleHub } from '../lib/productNames';
import { BeltRail } from './BeltRail';

/** Pro hubs this browser may open, top to bottom, each with its belt rail. */
export function ProToolboxCard({
  hubs = PRO_HUBS,
  label = 'Advantage Pro hubs',
}: {
  hubs?: readonly ConsoleHub[];
  label?: string;
}) {
  return (
    <nav className="pro-hubs" aria-label={label}>
      {hubs.map((hub) => (
        <Link key={hub.to} className="pro-hub" to={hub.to}>
          <BeltRail kind={hub.belt} />
          <span>{hub.title}</span>
        </Link>
      ))}
    </nav>
  );
}

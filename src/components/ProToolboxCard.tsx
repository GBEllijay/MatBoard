import { Link } from 'react-router-dom';
import { PRO_HUBS } from '../lib/productNames';
import { BeltRail } from './BeltRail';

/** Four Pro hubs, top to bottom, each with its belt rail. */
export function ProToolboxCard() {
  return (
    <nav className="pro-hubs" aria-label="Advantage Pro hubs">
      {PRO_HUBS.map((hub) => (
        <Link key={hub.to} className="pro-hub" to={hub.to}>
          <BeltRail kind={hub.belt} />
          <span>{hub.title}</span>
        </Link>
      ))}
    </nav>
  );
}

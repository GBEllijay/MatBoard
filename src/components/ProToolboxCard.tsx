import { Link } from 'react-router-dom';
import { PRO_HUBS } from '../lib/productNames';
import { BeltRail } from './BeltRail';

const HUB_BELTS = ['black', 'tournament', 'blue', 'black'] as const;

/** Four Pro hubs. Same full-width weight as the old suite button, stacked. */
export function ProToolboxCard() {
  return (
    <nav className="pro-hubs" aria-label="Advantage Pro hubs">
      {PRO_HUBS.map((hub, index) => (
        <Link key={hub.to} className="pro-hub" to={hub.to}>
          <BeltRail kind={HUB_BELTS[index] ?? 'white'} />
          <span>{hub.title}</span>
        </Link>
      ))}
    </nav>
  );
}

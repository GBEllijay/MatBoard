import { Link } from 'react-router-dom';
import { COACH_UNLIMITED_PATH, PRO_HUBS } from '../lib/productNames';
import { BeltRail } from './BeltRail';

/** Four Pro hubs, top to bottom. Coach Unlimited is the black-belt button. */
export function ProToolboxCard() {
  return (
    <nav className="pro-hubs" aria-label="Advantage Pro hubs">
      {PRO_HUBS.map((hub) =>
        hub.to === COACH_UNLIMITED_PATH ? (
          <Link key={hub.to} className="pro-hub pro-hub--black-belt" to={hub.to}>
            <span className="pro-hub__copy">
              <span>{hub.title}</span>
              <strong className="pro-hub__professor">Professor</strong>
            </span>
            <span className="pro-hub__belt-end" aria-hidden="true">
              <span className="pro-hub__belt-rank">
                <span className="pro-hub__belt-stripe" />
                <span className="pro-hub__belt-bar" />
                <span className="pro-hub__belt-stripe" />
              </span>
              <span className="pro-hub__belt-tip" />
            </span>
          </Link>
        ) : (
          <Link key={hub.to} className="pro-hub" to={hub.to}>
            <BeltRail kind={hub.belt} />
            <span>{hub.title}</span>
          </Link>
        ),
      )}
    </nav>
  );
}

import { Link } from 'react-router-dom';
import { unlinkBracketBout } from '../lib/bracketBout';
import type { SuiteMenuLink } from '../lib/productNames';
import { BeltRail } from './BeltRail';

/**
 * Stacked menu buttons from Tournament Management Pro (/suite).
 * The Media Edition screen reuses the same buttons, so they look and open the same.
 */
export function SuiteMenuLinks({ links, label }: { links: readonly SuiteMenuLink[]; label: string }) {
  return (
    <nav className="suite__nav" aria-label={label}>
      {links.map((link) => (
        <Link
          key={link.title}
          className="pro-hub"
          to={link.to}
          onClick={link.clearBout ? () => unlinkBracketBout() : undefined}
        >
          {link.belt ? <BeltRail kind={link.belt} /> : null}
          {link.sub ? (
            <span className="pro-hub__label">
              <span>{link.title}</span>
              <span className="pro-hub__sub">{link.sub}</span>
            </span>
          ) : (
            <span>{link.title}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

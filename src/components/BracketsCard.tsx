import { Link } from 'react-router-dom';
import { BeltRail } from './BeltRail';
import { WHITE_BRACKETS_PATH } from '../lib/bracketRosterStore';

/**
 * Brackets card for the White hub. The image is still a placeholder.
 * TODO: Replace BracketsPlaceholder with the real mock-tournament TV photo next week.
 * The SVG is decorative and swappable: drop the final image in as an <img>
 * (for example public/storefront/brackets-tv.jpg) and remove this component.
 */
export function BracketsCard() {
  return (
    <article className="mode-card mode-card--brackets" id="brackets">
      <BeltRail kind="white" />
      <Link className="mode-card__hit" to={WHITE_BRACKETS_PATH} tabIndex={-1} aria-label="Open Brackets" />
      <BracketsPlaceholder />
      <strong>Brackets</strong>
      <span className="mode-card__sub">Mock tournament</span>
      <span>
        Run a mock tournament on a gym TV or device. Fill the bracket and advance winners right on the screen.
        Supports brackets of up to 64 competitors, with skins and saved boards.
      </span>
      <div className="mode-card__actions">
        <Link className="btn" to={WHITE_BRACKETS_PATH}>
          Brackets
        </Link>
      </div>
    </article>
  );
}

/** Decorative stand-in: a bracket on a TV. Not live tournament data. */
function BracketsPlaceholder() {
  return (
    <div className="brackets-placeholder" data-brackets-placeholder="true">
      <svg
        className="brackets-placeholder__art"
        viewBox="0 0 360 200"
        width="360"
        height="200"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        <rect className="brackets-placeholder__bezel" x="8" y="6" width="344" height="168" rx="10" />
        <rect className="brackets-placeholder__screen" x="22" y="18" width="316" height="144" rx="4" />
        <text className="brackets-placeholder__title" x="36" y="40">
          Mock tournament
        </text>
        {/* Left side of an 8-person bracket */}
        <g className="brackets-placeholder__lines" fill="none">
          <path d="M40 58h70v20H40" />
          <path d="M40 88h70v20H40" />
          <path d="M40 118h70v20H40" />
          <path d="M40 148h70v12H40" />
          <path d="M110 68h40v30h-40" />
          <path d="M110 128h40v26h-40" />
          <path d="M150 83h36v52h-36" />
          <path d="M186 109h28" />
          {/* Right side mirrored */}
          <path d="M320 58h-70v20H320" />
          <path d="M320 88h-70v20H320" />
          <path d="M320 118h-70v20H320" />
          <path d="M320 148h-70v12H320" />
          <path d="M250 68h-40v30h40" />
          <path d="M250 128h-40v26h40" />
          <path d="M210 83h-36v52h36" />
          <path d="M174 109h-28" />
        </g>
        <text className="brackets-placeholder__name" x="46" y="72">
          Atlas
        </text>
        <text className="brackets-placeholder__name" x="46" y="102">
          Romeo
        </text>
        <text className="brackets-placeholder__name" x="46" y="132">
          Mina
        </text>
        <text className="brackets-placeholder__name" x="46" y="156">
          Jules
        </text>
        <text className="brackets-placeholder__name brackets-placeholder__name--right" x="314" y="72">
          Nori
        </text>
        <text className="brackets-placeholder__name brackets-placeholder__name--right" x="314" y="102">
          Kai
        </text>
        <text className="brackets-placeholder__name brackets-placeholder__name--right" x="314" y="132">
          Reed
        </text>
        <text className="brackets-placeholder__name brackets-placeholder__name--right" x="314" y="156">
          Quinn
        </text>
        <rect className="brackets-placeholder__stand" x="150" y="174" width="60" height="8" rx="1" />
        <rect className="brackets-placeholder__base" x="120" y="182" width="120" height="10" rx="2" />
      </svg>
      <p className="brackets-placeholder__note">Placeholder image. Final photo next week.</p>
    </div>
  );
}

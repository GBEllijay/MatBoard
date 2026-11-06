import { Link } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { useSeatDoor } from '../hooks/useSeatDoor';
import { isCoachUnlimitedUnlocked, subscribeCoachUnlock } from '../lib/coachUnlock';
import { LICENSE_SHARE_BUTTON, licenseShareKinds, sharePathFor, type ShareKind } from '../lib/licenseShare';

const LABEL: Record<ShareKind, string> = {
  instructor: 'Instructor',
  student: 'Student',
};

const HINT: Record<ShareKind, string> = {
  instructor: 'Coach seat invite.',
  student: 'Student Edition link.',
};

function shareHint(kinds: readonly ShareKind[]): string {
  if (kinds.includes('instructor') && kinds.includes('student')) return 'Coach seat or Student Edition.';
  return HINT[kinds[0] ?? 'student'];
}

function QrGlyph() {
  return (
    <svg className="license-share-entry__glyph-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10 0h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v4h-2v-4z"
      />
    </svg>
  );
}

/**
 * Owner-only share card on Instructor Edition and Pro.
 * A signed-in seat never sees it, and lower tiers never get here.
 */
export function LicenseShareButton() {
  const door = useSeatDoor();
  const coachUnlocked = useSyncExternalStore(subscribeCoachUnlock, isCoachUnlimitedUnlocked, isCoachUnlimitedUnlocked);
  const kinds = licenseShareKinds({ proUnlocked: door.proUnlocked, coachUnlocked, seated: door.seated });
  if (!kinds.length) return null;
  return (
    <section className="license-share-entry" aria-label={LICENSE_SHARE_BUTTON}>
      <div className="license-share-entry__head">
        <span className="license-share-entry__glyph" aria-hidden="true">
          <QrGlyph />
        </span>
        <div className="license-share-entry__copy">
          <span className="license-share-entry__label">{LICENSE_SHARE_BUTTON}</span>
          <p className="license-share-entry__hint">{shareHint(kinds)}</p>
        </div>
      </div>
      <div className="license-share-entry__actions">
        {kinds.map((kind) => (
          <Link
            key={kind}
            className={`license-share-entry__btn license-share-entry__btn--${kind}`}
            to={sharePathFor(kind)}
            data-share={kind}
          >
            {LABEL[kind]}
          </Link>
        ))}
      </div>
    </section>
  );
}

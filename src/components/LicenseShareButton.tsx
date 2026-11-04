import { Link } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { useSeatDoor } from '../hooks/useSeatDoor';
import { isCoachUnlimitedUnlocked, subscribeCoachUnlock } from '../lib/coachUnlock';
import { LICENSE_SHARE_BUTTON, licenseShareKinds, sharePathFor, type ShareKind } from '../lib/licenseShare';

const LABEL: Record<ShareKind, string> = {
  instructor: 'Instructor',
  student: 'Student',
};

/**
 * Small "Share code" row on Instructor Edition and Pro. Owner only.
 * A signed-in seat (assistant coach, coach, program director) never sees it,
 * and lower tiers never get here.
 */
export function LicenseShareButton() {
  const door = useSeatDoor();
  const coachUnlocked = useSyncExternalStore(subscribeCoachUnlock, isCoachUnlimitedUnlocked, isCoachUnlimitedUnlocked);
  const kinds = licenseShareKinds({ proUnlocked: door.proUnlocked, coachUnlocked, seated: door.seated });
  if (!kinds.length) return null;
  return (
    <nav className="license-share-entry" aria-label={LICENSE_SHARE_BUTTON}>
      <span className="license-share-entry__label">{LICENSE_SHARE_BUTTON}</span>
      {kinds.map((kind) => (
        <Link key={kind} className="license-share-entry__btn" to={sharePathFor(kind)} data-share={kind}>
          {LABEL[kind]}
        </Link>
      ))}
    </nav>
  );
}

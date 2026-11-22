/**
 * Public `/` opens the marketing homepage for new visitors.
 * A device that already has Advantage set up is sent to `/products`.
 *
 * Saved access is any existing entitlement or license helper:
 * an open edition door (White, Student, Media, Coach, or Pro), an
 * owner/alpha test grant that opens a door, a live instructor seat,
 * or a saved student code. Preview-only White (`isPreviewWhiteUnlocked`,
 * the pages.dev badge) is not a saved license and must not redirect.
 */
import { doorOpen, subscribeEntitlement } from './entitlement.ts';
import { DOORS } from './entitlementToken.ts';
import { isLiveSeat, readCurrentSeat, subscribeSeatSession } from './instructorSeats.ts';
import { readStudentCode } from './studentDriveCopy.ts';

export function hasSavedAdvantageAccess(): boolean {
  if (DOORS.some((door) => doorOpen(door))) return true;
  if (isLiveSeat(readCurrentSeat())) return true;
  if (typeof localStorage === 'undefined') return false;
  return Boolean(readStudentCode(localStorage));
}

export function subscribeSavedAdvantageAccess(fn: () => void): () => void {
  const offEntitlement = subscribeEntitlement(fn);
  const offSeat = subscribeSeatSession(fn);
  return () => {
    offEntitlement();
    offSeat();
  };
}

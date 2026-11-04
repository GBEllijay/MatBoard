import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SignedInUpgradeBar } from './EditionLadder';
import {
  acceptInstructorInvite,
  readCurrentSeat,
  seatChromeHidden,
  subscribeSeatSession,
  type InstructorSeat,
} from '../lib/instructorSeats';

export { seatChromeHidden };

export function useCurrentSeat(): InstructorSeat | null {
  return useSyncExternalStore(subscribeSeatSession, readCurrentSeat, readCurrentSeat);
}

/**
 * Seat banner and the leftover signed-out strip are not rendered.
 * signOutInstructorSeat() in instructorSeats.ts is unchanged for a later control.
 * Nothing here signs a seat out.
 */
export function SeatSessionBar() {
  return null;
}

export function SeatSignedOutToast() {
  return null;
}

export function SeatSessionChrome() {
  return <SignedInUpgradeBar />;
}

export function InviteAccept() {
  const [search, setSearch] = useSearchParams();
  const token = search.get('invite');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const result = acceptInstructorInvite(token);
    if (!result.ok && result.reason !== 'signed-out') {
      setNotice(
        result.reason === 'revoked'
          ? 'This invite was revoked.'
          : result.reason === 'storage'
            ? 'This device could not save the seat session.'
            : 'This invite link is not on this device.',
      );
    } else {
      setNotice(null);
    }
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('invite');
        return next;
      },
      { replace: true },
    );
  }, [token, setSearch]);

  if (!notice) return null;
  return (
    <p className="invite-error" role="alert">
      {notice}
    </p>
  );
}

export { CollaborationGate } from './CollaborationGate';

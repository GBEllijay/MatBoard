import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  acceptInstructorInvite,
  instructorSeatBinderLabel,
  readCurrentSeat,
  signOutInstructorSeat,
  subscribeSeatSession,
  type InstructorSeat,
} from '../lib/instructorSeats';

export function useCurrentSeat(): InstructorSeat | null {
  return useSyncExternalStore(subscribeSeatSession, readCurrentSeat, () => null);
}

function signedInLine(seat: InstructorSeat): string {
  const role = instructorSeatBinderLabel(seat.presetId, seat.permissions);
  return `Signed in as ${seat.email} · ${role}`;
}

/** Plain signed-in line. Same words and weight as the session bar. */
export function SeatIdentityLine() {
  const seat = useCurrentSeat();
  if (!seat) return null;
  return <p className="seat-session">{signedInLine(seat)}</p>;
}

export function SeatSignOut() {
  const seat = useCurrentSeat();
  if (!seat) return null;
  return (
    <button type="button" className="home__text-btn" onClick={() => signOutInstructorSeat()}>
      Sign out of seat
    </button>
  );
}

export function SeatSessionBar() {
  const seat = useCurrentSeat();
  if (!seat) return null;
  return (
    <p className="seat-session">
      <span>{signedInLine(seat)}</span>
      <SeatSignOut />
    </p>
  );
}

export function InviteAccept() {
  const [search, setSearch] = useSearchParams();
  const token = search.get('invite');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const result = acceptInstructorInvite(token);
    if (!result.ok) {
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

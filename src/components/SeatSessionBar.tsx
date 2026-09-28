import { useEffect, useState } from 'react';
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
  const [seat, setSeat] = useState<InstructorSeat | null>(() => readCurrentSeat());
  useEffect(() => subscribeSeatSession(() => setSeat(readCurrentSeat())), []);
  return seat;
}

export function SeatSessionBar() {
  const seat = useCurrentSeat();
  if (!seat) return null;
  const role = instructorSeatBinderLabel(seat.presetId, seat.permissions);
  return (
    <p className="seat-session">
      <span>
        Signed in as {seat.email} · {role}
      </span>
      <button type="button" className="home__text-btn" onClick={() => signOutInstructorSeat()}>
        Sign out of seat
      </button>
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

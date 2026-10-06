import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  acceptInstructorInvite,
  consumeSignedOutToast,
  instructorSeatBinderLabel,
  readCurrentSeat,
  readSignedOutToast,
  seatChromeHidden,
  signOutInstructorSeat,
  subscribeSeatSession,
  subscribeSignedOutToast,
  type InstructorSeat,
} from '../lib/instructorSeats';

export { seatChromeHidden };

export function useCurrentSeat(): InstructorSeat | null {
  return useSyncExternalStore(subscribeSeatSession, readCurrentSeat, readCurrentSeat);
}

function useSignedOutToast(): boolean {
  return useSyncExternalStore(subscribeSignedOutToast, readSignedOutToast, readSignedOutToast);
}

export function SeatSessionBar() {
  const seat = useCurrentSeat();
  const [search, setSearch] = useSearchParams();
  if (!seat) return null;
  const role = instructorSeatBinderLabel(seat.presetId, seat.permissions);
  return (
    <div className="seat-session-dock">
      <div className="seat-session" role="region" aria-label="Instructor seat">
        <span className="seat-session__who">
          Signed in as {seat.email} · {role}
        </span>
        <button
          type="button"
          className="btn seat-session__out"
          onClick={() => {
            signOutInstructorSeat();
            if (!search.has('invite')) return;
            setSearch(
              (current) => {
                const next = new URLSearchParams(current);
                next.delete('invite');
                return next;
              },
              { replace: true },
            );
          }}
        >
          Sign out of seat
        </button>
      </div>
    </div>
  );
}

export function SeatSignedOutToast() {
  const visible = useSignedOutToast();

  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => consumeSignedOutToast(), 4500);
    return () => window.clearTimeout(id);
  }, [visible]);

  if (!visible) return null;
  return (
    <p className="seat-toast" role="status" aria-live="polite">
      Signed out
    </p>
  );
}

/** Sticky sign-out on coach, pro, and home. Hidden on the gym TV casts. */
export function SeatSessionChrome() {
  const { pathname } = useLocation();
  if (seatChromeHidden(pathname)) return null;
  return (
    <>
      <SeatSessionBar />
      <SeatSignedOutToast />
    </>
  );
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

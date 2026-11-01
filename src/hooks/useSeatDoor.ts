import { useCurrentSeat } from '../components/SeatSessionBar.tsx';
import {
  isProgramDirectorSeat,
  seatGrantsCoachMenus,
  seatGrantsMediaConsole,
  isLiveSeat,
  type InstructorSeat,
} from '../lib/instructorSeats.ts';
import { isCoachUnlimitedUnlocked, subscribeCoachUnlock } from '../lib/coachUnlock.ts';
import { type ProSurfaceInput } from '../lib/productNames.ts';
import { useSyncExternalStore } from 'react';
import { entitlementSnapshot } from '../lib/entitlement.ts';
import { rankSeatDoor } from '../lib/ownerPassRank.ts';
import { useMediaUnlocked } from './useMediaUnlocked.ts';
import { useProUnlocked } from './useProUnlocked.ts';

export type SeatDoor = ProSurfaceInput & {
  seat: InstructorSeat | null;
};

/**
 * Browser Pro unlock plus the signed-in invite, for menu doors.
 * An owner pass or alpha-pro code outranks the seat: the full owner console
 * stays, and a browser that only has a seat is unchanged.
 */
export function useSeatDoor(): SeatDoor {
  const proUnlocked = useProUnlocked();
  const mediaUnlocked = useMediaUnlocked();
  // Coach door store without useCoachUnlocked's URL-query side effects (a URL never opens coach).
  const coachUnlocked = useSyncExternalStore(subscribeCoachUnlock, isCoachUnlimitedUnlocked, isCoachUnlimitedUnlocked);
  const seat = useCurrentSeat();
  return rankSeatDoor(
    {
      proUnlocked,
      seat,
      seated: isLiveSeat(seat),
      seatGrantsMedia: seatGrantsMediaConsole(seat),
      programDirectorSeat: isProgramDirectorSeat(seat),
      coachMenus: seatGrantsCoachMenus(seat),
      mediaUnlocked,
      coachUnlocked,
    },
    entitlementSnapshot().claims,
  );
}

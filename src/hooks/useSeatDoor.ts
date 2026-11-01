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
import { useMediaUnlocked } from './useMediaUnlocked.ts';
import { useProUnlocked } from './useProUnlocked.ts';

export type SeatDoor = ProSurfaceInput & {
  seat: InstructorSeat | null;
};

/** Browser Pro unlock plus the signed-in invite, for menu doors. */
export function useSeatDoor(): SeatDoor {
  const proUnlocked = useProUnlocked();
  const mediaUnlocked = useMediaUnlocked();
  // Coach door store without useCoachUnlocked's URL-query side effects (a URL never opens coach).
  const coachUnlocked = useSyncExternalStore(subscribeCoachUnlock, isCoachUnlimitedUnlocked, isCoachUnlimitedUnlocked);
  const seat = useCurrentSeat();
  return {
    proUnlocked,
    seat,
    seated: isLiveSeat(seat),
    seatGrantsMedia: seatGrantsMediaConsole(seat),
    programDirectorSeat: isProgramDirectorSeat(seat),
    coachMenus: seatGrantsCoachMenus(seat),
    mediaUnlocked,
    coachUnlocked,
  };
}

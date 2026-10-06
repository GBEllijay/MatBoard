import { useCurrentSeat } from '../components/SeatSessionBar.tsx';
import {
  isProgramDirectorSeat,
  seatGrantsCoachMenus,
  seatGrantsMediaConsole,
  isLiveSeat,
  type InstructorSeat,
} from '../lib/instructorSeats.ts';
import { type ProSurfaceInput } from '../lib/productNames.ts';
import { useProUnlocked } from './useProUnlocked.ts';

export type SeatDoor = ProSurfaceInput & {
  seat: InstructorSeat | null;
};

/** Browser Pro unlock plus the signed-in invite, for menu doors. */
export function useSeatDoor(): SeatDoor {
  const proUnlocked = useProUnlocked();
  const seat = useCurrentSeat();
  return {
    proUnlocked,
    seat,
    seated: isLiveSeat(seat),
    seatGrantsMedia: seatGrantsMediaConsole(seat),
    programDirectorSeat: isProgramDirectorSeat(seat),
    coachMenus: seatGrantsCoachMenus(seat),
  };
}

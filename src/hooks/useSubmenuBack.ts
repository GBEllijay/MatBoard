import { useLocation } from 'react-router-dom';
import { useCoachUnlocked } from './useCoachUnlocked';
import { useProUnlocked } from './useProUnlocked';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { isLiveSeat } from '../lib/instructorSeats';
import { submenuBackTarget, type SubmenuNavInput } from '../lib/submenuNav';

/** One-level back target for the page on screen. */
export function useSubmenuBack(
  options?: Pick<SubmenuNavInput, 'detailOpen' | 'unlimited'>,
): string | null {
  const { pathname, search } = useLocation();
  const seat = useCurrentSeat();
  return submenuBackTarget({
    pathname,
    search,
    proUnlocked: useProUnlocked(),
    coachUnlocked: useCoachUnlocked(),
    seated: seat ? isLiveSeat(seat) : false,
    detailOpen: options?.detailOpen,
    unlimited: options?.unlimited,
  });
}

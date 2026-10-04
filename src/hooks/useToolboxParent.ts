import { useCurrentSeat } from '../components/SeatSessionBar.tsx';
import { parentToolboxPath, toolEyebrow } from '../lib/productNames.ts';
import { useCoachUnlocked } from './useCoachUnlocked.ts';
import { useProUnlocked } from './useProUnlocked.ts';

export function useToolboxParent(): { path: string; eyebrow: string } {
  const pro = useProUnlocked();
  const coach = useCoachUnlocked();
  const seated = useCurrentSeat() !== null;
  return {
    path: parentToolboxPath(pro, coach, seated),
    eyebrow: toolEyebrow(pro, coach, seated),
  };
}

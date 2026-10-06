import { parentToolboxPath, toolEyebrow, visibleProHubs } from '../lib/productNames.ts';
import { useCoachUnlocked } from './useCoachUnlocked.ts';
import { useSeatDoor } from './useSeatDoor.ts';

export function useToolboxParent(): { path: string; eyebrow: string } {
  const coach = useCoachUnlocked();
  const door = useSeatDoor();
  const proConsole = visibleProHubs(door).length > 0;
  return {
    path: parentToolboxPath(door.proUnlocked, coach, door.seated, proConsole),
    eyebrow: toolEyebrow(door.proUnlocked, coach, door.seated),
  };
}

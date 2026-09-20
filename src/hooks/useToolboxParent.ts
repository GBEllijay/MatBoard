import { parentToolboxPath, toolEyebrow } from '../lib/productNames.ts';
import { useCoachUnlocked } from './useCoachUnlocked.ts';
import { useProUnlocked } from './useProUnlocked.ts';

export function useToolboxParent(): { path: string; eyebrow: string } {
  const pro = useProUnlocked();
  const coach = useCoachUnlocked();
  return {
    path: parentToolboxPath(pro, coach),
    eyebrow: toolEyebrow(pro, coach),
  };
}

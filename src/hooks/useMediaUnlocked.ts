import { useSyncExternalStore } from 'react';
import { isMediaUnlocked, subscribeMediaUnlock } from '../lib/mediaUnlock';

export function useMediaUnlocked(): boolean {
  return useSyncExternalStore(subscribeMediaUnlock, isMediaUnlocked, isMediaUnlocked);
}

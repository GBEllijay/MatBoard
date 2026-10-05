import { useSyncExternalStore } from 'react';
import { isWhiteUnlocked, subscribeWhiteUnlock } from '../lib/whiteUnlock';

export function useWhiteUnlocked(): boolean {
  return useSyncExternalStore(subscribeWhiteUnlock, isWhiteUnlocked, isWhiteUnlocked);
}

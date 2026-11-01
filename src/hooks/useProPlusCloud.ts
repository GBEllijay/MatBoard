import { useSyncExternalStore } from 'react';
import { proPlusCloudUnlocked, subscribeProPlusCloud } from '../lib/proPlusCloud';

export function useProPlusCloudUnlocked(): boolean {
  return useSyncExternalStore(subscribeProPlusCloud, proPlusCloudUnlocked, () => false);
}

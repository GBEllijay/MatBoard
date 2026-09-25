import { useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  isProUnlocked,
  previewUnlockFromSearch,
  subscribeProUnlock,
} from '../lib/proUnlock';
import { useUnlockQuery } from './useUnlockQuery';

export function useProUnlocked(): boolean {
  useUnlockQuery();
  const [searchParams] = useSearchParams();
  const stored = useSyncExternalStore(subscribeProUnlock, isProUnlocked, isProUnlocked);
  const preview = previewUnlockFromSearch(searchParams);
  return preview ?? stored;
}

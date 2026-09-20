import { useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  isCoachUnlocked,
  previewCoachUnlockFromSearch,
  subscribeCoachUnlock,
} from '../lib/coachUnlock';
import { useUnlockQuery } from './useUnlockQuery';

export function useCoachUnlocked(): boolean {
  useUnlockQuery();
  const [searchParams] = useSearchParams();
  const stored = useSyncExternalStore(subscribeCoachUnlock, isCoachUnlocked, isCoachUnlocked);
  const preview = previewCoachUnlockFromSearch(searchParams);
  return preview ?? stored;
}

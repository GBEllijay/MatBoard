import { useSyncExternalStore } from 'react';
import { isStudentEditionUnlocked, subscribeStudentEditionUnlock } from '../lib/studentUnlock';
import { useUnlockQuery } from './useUnlockQuery';

/** Student Edition owner flag. Same subscription pattern as White and Coach. */
export function useStudentEditionUnlocked(): boolean {
  useUnlockQuery();
  return useSyncExternalStore(
    subscribeStudentEditionUnlock,
    isStudentEditionUnlocked,
    isStudentEditionUnlocked,
  );
}

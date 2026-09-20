import { useEffect, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  applyUnlockSearch,
  isProUnlocked,
  previewUnlockFromSearch,
  stripUnlockParams,
  subscribeProUnlock,
} from '../lib/proUnlock';

export function useProUnlocked(): boolean {
  const [searchParams, setSearchParams] = useSearchParams();
  const stored = useSyncExternalStore(subscribeProUnlock, isProUnlocked, isProUnlocked);
  const preview = previewUnlockFromSearch(searchParams);

  useEffect(() => {
    if (!searchParams.has('pro') && !searchParams.has('unlock')) return;
    const applied = applyUnlockSearch(searchParams);
    if (!applied) return;
    const next = stripUnlockParams(searchParams);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return preview ?? stored;
}

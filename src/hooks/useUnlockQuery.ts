import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { stripsCoachParam } from '../lib/proUnlock';

/**
 * `?pro=`, `?unlock=`, and `?coach=` used to unlock tiers. They are removed
 * from the address and do not change any door. `?student=1` stays; it is demo mode.
 * The academy QR's signed `?coach=` token stays (it never unlocks anything) so
 * Connections and the "code first" screen can read it.
 */
export function useUnlockQuery(): void {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const stripCoach = stripsCoachParam(searchParams.get('coach'));
    if (!searchParams.has('pro') && !searchParams.has('unlock') && !stripCoach) return;
    const next = new URLSearchParams(searchParams);
    next.delete('pro');
    next.delete('unlock');
    if (stripCoach) next.delete('coach');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
}

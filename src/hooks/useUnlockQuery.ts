import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * `?pro=`, `?unlock=`, and `?coach=` used to unlock tiers. They are removed
 * from the address and do not change any door. `?student=1` stays; it is demo mode.
 */
export function useUnlockQuery(): void {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!searchParams.has('pro') && !searchParams.has('unlock') && !searchParams.has('coach')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('pro');
    next.delete('unlock');
    next.delete('coach');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
}

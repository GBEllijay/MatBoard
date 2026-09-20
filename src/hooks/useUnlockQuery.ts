import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { applyCoachUnlockSearch, stripCoachUnlockParams } from '../lib/coachUnlock';
import { applyUnlockSearch, stripUnlockParams } from '../lib/proUnlock';

/** Consume `?pro=` / `?unlock=` / `?coach=` once so the two unlock hooks do not race. */
export function useUnlockQuery(): void {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const hasPro = searchParams.has('pro') || searchParams.has('unlock');
    const hasCoach = searchParams.has('coach');
    if (!hasPro && !hasCoach) return;
    const appliedPro = hasPro && applyUnlockSearch(searchParams);
    const appliedCoach = hasCoach && applyCoachUnlockSearch(searchParams);
    if (!appliedPro && !appliedCoach) return;
    const next = stripCoachUnlockParams(stripUnlockParams(searchParams));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
}

import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { applyCoachUnlockSearch, stripCoachUnlockParams } from '../lib/coachUnlock';
import {
  applyFullOwnerSearch,
  applyUnlockSearch,
  isFullOwnerUnlockCode,
  stripFullOwnerStudentParam,
  stripUnlockParams,
} from '../lib/proUnlock';

/**
 * Consume `?pro=` / `?unlock=` / `?coach=` and a full-code `?student=` once.
 * `?student=1` is the Student Edition preview and stays on the address.
 */
export function useUnlockQuery(): void {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const hasPro = searchParams.has('pro') || searchParams.has('unlock');
    const hasCoach = searchParams.has('coach');
    const studentRaw = searchParams.get('student');
    const hasStudentCode = studentRaw != null && isFullOwnerUnlockCode(studentRaw);
    if (!hasPro && !hasCoach && !hasStudentCode) return;
    const appliedPro = hasPro && applyUnlockSearch(searchParams);
    const appliedCoach = hasCoach && applyCoachUnlockSearch(searchParams);
    const appliedFull = applyFullOwnerSearch(searchParams);
    if (!appliedPro && !appliedCoach && !appliedFull) return;
    const next = stripFullOwnerStudentParam(stripCoachUnlockParams(stripUnlockParams(searchParams)));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
}

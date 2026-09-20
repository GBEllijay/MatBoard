import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { flashDurationMs, syncBoutFromQuery } from '../lib/bracketBout';
import { dispatchMatch, isPresentationReceiver } from '../lib/matchStore';
import { useMatchState } from './useStores';

/** Load `?bout=` into match state once, without resetting an already-open bout. */
export function useBoutQuerySync(): void {
  const [params] = useSearchParams();
  const bout = params.get('bout');
  useEffect(() => {
    syncBoutFromQuery(bout);
  }, [bout]);
}

/**
 * After a linked Win/DQ: keep the Display flash, then go to the bracket.
 * Chromecast / Presentation receivers stay on the scoreboard (no shared tournament store).
 */
export function useBracketOutcomeReturn(): void {
  const match = useMatchState();
  const navigate = useNavigate();
  const flash = match.outcomeFlash;

  useEffect(() => {
    if (!flash) return;
    const wait = Math.max(0, flashDurationMs() - (Date.now() - flash.at));
    const timer = window.setTimeout(() => {
      if (isPresentationReceiver()) return;
      dispatchMatch({ type: 'setOutcomeFlash', value: null });
      navigate('/tournament');
    }, wait);
    return () => window.clearTimeout(timer);
  }, [flash, navigate]);
}

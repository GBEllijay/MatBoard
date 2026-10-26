import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { captureHalfOffQuery, halfOffArrivalActive, rememberHalfOffArrival } from '../lib/halfOff';

/** Remember `?promo=MEIA` and report whether this browser arrived through half off. */
export function useHalfOffArrival(): boolean {
  const [params] = useSearchParams();
  const [active, setActive] = useState(() => halfOffArrivalActive());

  useEffect(() => {
    if (captureHalfOffQuery(params)) setActive(true);
  }, [params]);

  return active;
}

/** Half-off page sets the flag before paint so the next tap already carries it. */
export function useRememberHalfOffArrival(): void {
  useState(() => {
    rememberHalfOffArrival();
    return null;
  });
}

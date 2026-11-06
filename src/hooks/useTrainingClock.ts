import { useCallback, useEffect, useState } from 'react';
import { attachTrainingScreen, tickTraining } from '../lib/trainingStore.ts';
import { useInterval } from './useClock.ts';

/** Ticks the round clock while this screen is mounted and pauses it when the last one leaves. */
export function useTrainingClock(): void {
  const [, setFrame] = useState(0);
  useEffect(() => attachTrainingScreen(), []);
  useInterval(
    useCallback(() => {
      tickTraining();
      setFrame((frame) => frame + 1);
    }, []),
    100,
    true,
  );
}

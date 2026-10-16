import { useEffect } from 'react';

export function useInterval(onTick: () => void, ms: number, active = true): void {
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(onTick, ms);
    onTick();
    return () => window.clearInterval(id);
  }, [onTick, ms, active]);
}

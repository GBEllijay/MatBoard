import { useEffect } from 'react';

export function useRaf(onTick: (now: number) => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const loop = (now: number) => {
      onTick(now);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [onTick, active]);
}

export function useInterval(onTick: () => void, ms: number, active = true): void {
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(onTick, ms);
    onTick();
    return () => window.clearInterval(id);
  }, [onTick, ms, active]);
}

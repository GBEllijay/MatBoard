import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTimedHold, type HoldClock } from '../hooks/useTimedHold';
import { HOLD_MS } from '../lib/holdDuration';

const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;

/** Fill ring shown only while a round-timer hold is in progress. */
export function HoldRing({ progress }: { progress: number }) {
  const shown = Math.min(1, Math.max(0, progress));
  const seconds = Math.min(3, Math.floor(shown * (HOLD_MS / 1000)));
  return (
    <svg
      className="hold-ring"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={3}
      aria-valuenow={seconds}
      aria-valuetext={`${seconds} of 3 seconds`}
      aria-label="Hold progress"
      data-progress={shown.toFixed(3)}
    >
      <circle className="hold-ring__halo" cx="50" cy="50" r={RING_R} />
      <circle className="hold-ring__track" cx="50" cy="50" r={RING_R} />
      <circle
        className="hold-ring__fill"
        cx="50"
        cy="50"
        r={RING_R}
        transform="rotate(-90 50 50)"
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - shown)}
      />
    </svg>
  );
}

type TapEvent = { stopPropagation: () => void };

type Props = {
  className?: string;
  ariaLabel?: string;
  /** Which hold this is. "round" resets the session. "timer" resets the period. */
  dataHold: 'round' | 'timer';
  /** Skin clocks use this for the digit string some layouts read. */
  dataD?: string;
  onTap?: (event: TapEvent) => void;
  onComplete: () => void;
  clock?: HoldClock;
  /**
   * Circular skin frame (the visionary disc, the brasil globe). The ring is
   * centered on this box. It is never placed at the pointer.
   */
  ringHost?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
};

/**
 * Existing round-timer button, plus a 3-second hold.
 * The ring sits on the control. Releasing early leaves the tap behaviour alone
 * only when the press was short; a longer press that does not finish does nothing.
 */
export function HoldButton({ className, ariaLabel, dataHold, dataD, onTap, onComplete, clock, ringHost, children }: Props) {
  const hold = useTimedHold({ onTap, onComplete, clock });
  const ring = hold.active ? <HoldRing progress={hold.progress} /> : null;
  const host = ring && ringHost?.current ? ringHost.current : null;
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      data-hold={dataHold}
      data-d={dataD}
      {...hold.buttonProps}
    >
      {children}
      {ring ? (host ? createPortal(ring, host) : ring) : null}
    </button>
  );
}

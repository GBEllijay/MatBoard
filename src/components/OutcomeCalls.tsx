import { useState } from 'react';
import { Sheet } from './Sheet';
import {
  DQ_REASON_HINTS,
  DQ_REASON_LABELS,
  DQ_REASONS,
  WIN_METHOD_HINTS,
  WIN_METHOD_LABELS,
  WIN_METHODS,
  type DqReason,
  type OutcomeCall,
  type WinMethod,
} from '../lib/outcomes';

type Props = {
  open: OutcomeCall | null;
  title: string;
  onClose: () => void;
  onPickWin: (method: WinMethod) => void;
  onPickDq: (reason: DqReason) => void;
};

export function OutcomePickSheet({ open, title, onClose, onPickWin, onPickDq }: Props) {
  return (
    <Sheet open={Boolean(open)} title={title} onClose={onClose}>
      {open === 'win' ? (
        <div className="outcome-picks" role="list">
          {WIN_METHODS.map((method) => (
            <button
              key={method}
              type="button"
              className={`btn outcome-pick outcome-pick--${method}`}
              onClick={() => onPickWin(method)}
            >
              <strong>{WIN_METHOD_LABELS[method]}</strong>
              <span>{WIN_METHOD_HINTS[method]}</span>
            </button>
          ))}
        </div>
      ) : null}
      {open === 'dq' ? (
        <div className="outcome-picks" role="list">
          {DQ_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              className={`btn outcome-pick outcome-pick--${reason}`}
              onClick={() => onPickDq(reason)}
            >
              <strong>{DQ_REASON_LABELS[reason]}</strong>
              <span>{DQ_REASON_HINTS[reason]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}

type CallsProps = {
  sideLabel: string;
  disabled: boolean;
  highlight?: boolean;
  focusId?: boolean;
  variant: 'pad' | 'bout';
  focusDomId?: string;
  onWin: () => void;
  onDq: () => void;
};

export function OutcomeCalls({
  sideLabel,
  disabled,
  highlight = false,
  focusId = false,
  variant,
  focusDomId,
  onWin,
  onDq,
}: CallsProps) {
  const groupClass = variant === 'pad' ? 'pad__calls' : 'bout__calls';
  const btnClass = variant === 'pad' ? 'btn pad-call' : 'bout-call';
  return (
    <div
      id={focusDomId}
      className={`${groupClass}${highlight ? ` ${groupClass}--needed` : ''}`}
      role="group"
      aria-label={`${sideLabel} win condition`}
      tabIndex={focusId ? -1 : undefined}
    >
      <button
        type="button"
        className={`${btnClass} ${variant === 'pad' ? 'pad-call' : 'bout-call'}--win`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={`${sideLabel} Win`}
        onClick={onWin}
      >
        Win
      </button>
      <button
        type="button"
        className={`${btnClass} ${variant === 'pad' ? 'pad-call' : 'bout-call'}--dq`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={`${sideLabel} DQ`}
        onClick={onDq}
      >
        DQ
      </button>
    </div>
  );
}

/** One sheet for a Blue/White pair on the Controller (or bracket). */
export function useOutcomeSheet() {
  const [sheet, setSheet] = useState<{ call: OutcomeCall; side: 'blue' | 'white'; label: string } | null>(
    null,
  );
  return {
    sheet,
    openWin: (side: 'blue' | 'white', label: string) => setSheet({ call: 'win', side, label }),
    openDq: (side: 'blue' | 'white', label: string) => setSheet({ call: 'dq', side, label }),
    close: () => setSheet(null),
  };
}

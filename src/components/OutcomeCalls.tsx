import { declareMatchOutcome } from '../lib/bracketBout';
import { displayFocusId } from '../lib/matchFocus';
import { type Side } from '../lib/matchStore';
import { OUTCOME_METHOD_LABELS, type BoutOutcomeKind } from '../lib/outcomes';

const CALLS: { method: BoutOutcomeKind; short: string; className: string }[] = [
  { method: 'score', short: 'Win', className: 'win' },
  { method: 'submission', short: 'Sub', className: 'sub' },
  { method: 'dq', short: 'DQ', className: 'dq' },
  { method: 'tech', short: 'T-loss', className: 'tech' },
];

type Props = {
  side: Side;
  label: string;
  disabled: boolean;
  /** Controller pads use full labels; Display scoreboard uses short marks. */
  compact?: boolean;
  highlight?: boolean;
  /** Focus target when opening Controller from Display for a referee decision. */
  focusId?: boolean;
  variant: 'pad' | 'bout';
};

export function OutcomeCalls({
  side,
  label,
  disabled,
  compact = false,
  highlight = false,
  focusId = false,
  variant,
}: Props) {
  const groupClass = variant === 'pad' ? 'pad__calls' : 'bout__calls';
  const btnClass = variant === 'pad' ? 'btn pad-call' : 'bout-call';
  return (
    <div
      id={focusId ? displayFocusId('outcome') : undefined}
      className={`${groupClass}${highlight ? ` ${groupClass}--needed` : ''}`}
      role="group"
      aria-label={`${label} win condition`}
      tabIndex={focusId ? -1 : undefined}
    >
      {CALLS.map((call) => (
        <button
          key={call.method}
          type="button"
          className={`${btnClass} ${variant === 'pad' ? 'pad-call' : 'bout-call'}--${call.className}`}
          disabled={disabled}
          aria-label={`${label} ${OUTCOME_METHOD_LABELS[call.method]}`}
          onClick={() => declareMatchOutcome(side, call.method)}
        >
          {compact ? call.short : OUTCOME_METHOD_LABELS[call.method]}
        </button>
      ))}
    </div>
  );
}

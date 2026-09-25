import { outcomeSplashLine, type MatchOutcome } from '../lib/outcomes';

type Props = {
  outcome: MatchOutcome;
  name: string;
};

/** Fullscreen Match Display splash — gym-TV sized, centered, then the board returns. */
export function OutcomeSplash({ outcome, name }: Props) {
  const line = outcomeSplashLine(outcome);
  if (!line) return null;

  return (
    <div
      className={`display-splash display-splash--${outcome.call} display-splash--${outcome.side}`}
      role="status"
      aria-live="assertive"
    >
      <div className="display-splash__card">
        <p className="display-splash__name">{name}</p>
        <p className="display-splash__line">{line}</p>
      </div>
    </div>
  );
}
